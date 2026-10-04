"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Mic, MicOff, Play, Square, RefreshCw, AlertCircle, BrainCircuit, AlertTriangle, Send, Pause } from "lucide-react";
import { cn, isMobileDevice } from "@/lib/utils";
import { useSearchParams } from "next/navigation";
import { CoachingMarkdown as ReactMarkdown } from "./CoachingMarkdown";
import { ensureUser } from "@/lib/auth";
import { savePracticeSession } from "@/app/actions";
import { Feedback, PracticeSessionInput, modeSchema } from "@/lib/validation";
import { readFeedback } from "@/lib/stream-protocol";
import { blobToBase64, finalizeRecording } from "@/lib/recording";
import type { SpeechRecognitionLike } from "@/lib/speech";
import { transcribeAudio } from "@/app/actions";


type SessionState = "IDLE" | "LISTENING" | "SPEAKING" | "ANALYZING" | "COACHING";

export function LiveSession() {

  const searchParams = useSearchParams();
  const requestedMode = modeSchema.safeParse(searchParams?.get("mode") || "conversation");
  const initialMode = requestedMode.success ? requestedMode.data : "conversation";
  const [selectedMode, setSelectedMode] = useState(initialMode);

  const [isPaused, setIsPaused] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const startingRef = useRef(false);
  const mediaRequestRef = useRef(0);
  const [isMicOn, setIsMicOn] = useState(true);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const [browserSupported, setBrowserSupported] = useState(true);
  const [permissionError, setPermissionError] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      queueMicrotask(() => setBrowserSupported(!!SpeechRecognition));
    }
  }, []);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);

  const [appState, setAppState] = useState<SessionState>("IDLE");
  const [transcriptParagraphs, setTranscriptParagraphs] = useState<string[]>([]);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const isRecognitionRunningRef = useRef<boolean>(false);

  const finalizedPrefixRef = useRef<string>("");
  const segmentBufferRef = useRef<string>("");
  const segmentTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [markdownFeedback, setMarkdownFeedback] = useState<string>("");
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

    const [isTranscribing, setIsTranscribing] = useState(false);
  const [isManualEditing, setIsManualEditing] = useState(false);

  const startRecording = useCallback((streamToUse?: MediaStream) => {
    const activeStream = streamToUse || mediaStreamRef.current || mediaStream;
    if (!activeStream) return;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") return;

    try {
      let mimeType = 'audio/webm;codecs=opus';
      if (typeof MediaRecorder !== 'undefined') {
        if (!MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : (MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '');
        }
      }
      const options = mimeType ? { mimeType } : undefined;
      const recorder = new MediaRecorder(activeStream, options);
      const chunks: Blob[] = [];
      audioChunksRef.current = chunks;
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
        }
      };
      recorder.onstop = () => {
        if (mediaRecorderRef.current === recorder && chunks.length > 0) {
          const audioBlob = new Blob(chunks, { type: mimeType || 'audio/webm' });
          const url = URL.createObjectURL(audioBlob);
          setAudioUrl(url);
        }
      };
      recorder.start(250);
      mediaRecorderRef.current = recorder;
    } catch {
      console.error("Session operation failed.");
    }
  }, [mediaStream]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        console.error("Session operation failed.");
      }
    }
  }, []);



  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [speakingTimeMs, setSpeakingTimeMs] = useState<number>(0);
  const feedbacksRef = useRef<Feedback[]>([]);
  const analysisAbortRef = useRef<AbortController | null>(null);
  const analysisBusyRef = useRef(false);
  const transcriptionBusyRef = useRef(false);
  const answerVersionRef = useRef(0);
  const retryRef = useRef(false);
  const sessionIdRef = useRef("");
  const pendingSaveRef = useRef<PracticeSessionInput | null>(null);
  const savingRef = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const cancelAnalysis = () => { if (segmentTimeoutRef.current) { clearTimeout(segmentTimeoutRef.current); segmentTimeoutRef.current = null; } answerVersionRef.current++; analysisAbortRef.current?.abort(); analysisBusyRef.current = false; setIsStreaming(false); };
  const isSpeakingRef = useRef<boolean>(false);
  const lastSpeakTimeRef = useRef<number>(0);

  const setupAudioAnalysis = async (stream: MediaStream) => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (analyserRef.current) {
      try { analyserRef.current.disconnect(); } catch {}
      analyserRef.current = null;
    }

    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) audioContextRef.current = new AudioCtx();
    }
    const ctx = audioContextRef.current;
    if (ctx && ctx.state === "suspended") {
      await ctx.resume();
    }
    if (!ctx) return;

    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.3;
    source.connect(analyser);
    analyserRef.current = analyser;

    const dataArray = new Uint8Array(analyser.fftSize);

    const draw = () => {
      if (!analyserRef.current || !latestState.current.isMicOn || latestState.current.isPaused) {
        setAudioLevel(0);
        animationFrameRef.current = requestAnimationFrame(draw);
        return;
      }

      analyserRef.current.getByteTimeDomainData(dataArray);

      let sumSquares = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const norm = (dataArray[i] - 128) / 128;
        sumSquares += norm * norm;
      }
      const rms = Math.sqrt(sumSquares / dataArray.length);
      const volumeLevel = Math.min(100, Math.round(rms * 320));

      setAudioLevel(volumeLevel);

      const now = Date.now();
      if (volumeLevel > 10) {
        if (!isSpeakingRef.current) {
          isSpeakingRef.current = true;
          lastSpeakTimeRef.current = now;
        }
      } else {
        if (isSpeakingRef.current) {
          setSpeakingTimeMs(prev => prev + (now - lastSpeakTimeRef.current));
          isSpeakingRef.current = false;
        }
      }

      setAppState(prev => {
        if (prev === "LISTENING" && volumeLevel > 10) return "SPEAKING";
        if (prev === "SPEAKING" && volumeLevel < 5 && !interimTranscript) return "LISTENING";
        return prev;
      });

      animationFrameRef.current = requestAnimationFrame(draw);
    };

    draw();
  };

  const cleanupAudioAnalysis = () => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (audioContextRef.current?.state !== 'closed') audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
    analyserRef.current = null;
  };

  const startMedia = async () => {
    const request = ++mediaRequestRef.current;
    try {
      setPermissionError(false);
      const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
      if (request !== mediaRequestRef.current) { stream.getTracks().forEach(track => track.stop()); return false; }
      mediaStreamRef.current = stream;
      setMediaStream(stream);


      stream.getAudioTracks().forEach(t => t.enabled = isMicOn);

      setupAudioAnalysis(stream);
      startRecording(stream);
      return true;
    } catch {
      if (request !== mediaRequestRef.current) return false;
      console.error("Session operation failed.");

      setPermissionError(true);
      setIsSessionActive(false);
      return false;
    }
  };

  const stopMedia = () => {
    mediaRequestRef.current++;
    stopRecording();
    const stream = mediaStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      setMediaStream(null);
    }
    cleanupAudioAnalysis();
  };



  const togglePause = () => {
    const newState = !isPaused;
    setIsPaused(newState);
    if (mediaRecorderRef.current?.state === "recording" && newState) mediaRecorderRef.current.pause();
    if (mediaRecorderRef.current?.state === "paused" && !newState) mediaRecorderRef.current.resume();
    if (newState) {
      if (segmentTimeoutRef.current) clearTimeout(segmentTimeoutRef.current);
    }
  };

  const toggleMic = () => {
    const newState = !isMicOn;
    setIsMicOn(newState);
    if (mediaStream) mediaStream.getAudioTracks().forEach(t => t.enabled = newState);
  };

  const handleAnalyzeNow = async () => {
    if (analysisBusyRef.current || transcriptionBusyRef.current) return;
    transcriptionBusyRef.current = true;
    stopRecognition();
    const version = answerVersionRef.current;
    if (segmentTimeoutRef.current) clearTimeout(segmentTimeoutRef.current);
    let text = segmentBufferRef.current.trim() || transcript.trim() || interimTranscript.trim();
    try {
      if (!isManualEditing) {
        const blob = await finalizeRecording(mediaRecorderRef.current, audioChunksRef.current);
        if (blob.size > 200) {
          setIsTranscribing(true);
          await ensureUser();
          const result = await transcribeAudio(await blobToBase64(blob), blob.type || 'audio/webm');
          if (answerVersionRef.current !== version) return;
          if (result.serverError) throw new Error(result.serverError);
          if (result.transcript?.trim()) text = result.transcript.trim();
        }
      }
      if (answerVersionRef.current !== version) return;
      await triggerAnalysis(text);
    } catch (error) {
      if (answerVersionRef.current === version) setAnalysisError(error instanceof Error ? error.message : "Recording could not be analyzed.");
    } finally { transcriptionBusyRef.current = false; setIsTranscribing(false); }
  };
  const triggerAnalysis = async (textToAnalyze: string) => {
    if (analysisBusyRef.current) return;
    if (feedbacksRef.current.length >= 50) { setAnalysisError("This session has reached its feedback limit. Please end it and start a new session."); return; }
    if (textToAnalyze.trim().length < 10) { setAnalysisError("Response too short to analyze. Please elaborate."); return; }
    analysisBusyRef.current = true;
    const request = new AbortController();
    analysisAbortRef.current?.abort();
    analysisAbortRef.current = request;
    stopRecording();
    stopRecognition();
    finalizedPrefixRef.current = "";
    segmentBufferRef.current = "";
    setTranscriptParagraphs(prev => [...prev, textToAnalyze]);
    setTranscript(""); setInterimTranscript("");
     setAppState("COACHING"); setAnalysisError(null);
    setMarkdownFeedback(""); setIsStreaming(true);
    try {
      await ensureUser();
      request.signal.throwIfAborted();
      const jd = localStorage.getItem("target_jd") || undefined;
      const response = await fetch('/api/analyze', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: request.signal,
        body: JSON.stringify({ segmentText: textToAnalyze, mode: selectedMode, contextJd: jd })
      });
      const { markdown, result } = await readFeedback(response, text => { if (!request.signal.aborted) setMarkdownFeedback(text); }, request.signal);
      request.signal.throwIfAborted();
      const prior = feedbacksRef.current.at(-1);
      const feedback: Feedback = { transcript: textToAnalyze, score: result.score, biggest_weakness: result.biggest_weakness, fix: result.fix, raw_feedback: markdown, dimensions: result.dimensions, is_retry: retryRef.current, retry_improvement: retryRef.current && prior ? result.score-prior.score : null };
      feedbacksRef.current = [...feedbacksRef.current, feedback];

      retryRef.current = false;
    } catch (error) {
      if (!request.signal.aborted) setAnalysisError(error instanceof Error ? error.message : "Feedback could not be completed.");
    } finally {
      if (analysisAbortRef.current === request) { analysisBusyRef.current = false; setIsStreaming(false); }
    }
  };
  const latestState = useRef({ isMicOn, isSessionActive, isPaused, isManualEditing, triggerAnalysis, startRecording });
  useEffect(() => {
    latestState.current = { isMicOn, isSessionActive, isPaused, isManualEditing, triggerAnalysis, startRecording };
  });

  const startRecognition = useCallback(function restartRecognition() {
    if (typeof window === "undefined") return;

    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      return;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }

    try {
      const isMobile = isMobileDevice();
      const recognition = new SpeechRec();
      // On mobile devices, continuous = true causes hardware aborts; use continuous = false
      recognition.continuous = !isMobile;
      recognition.interimResults = true;
      recognition.lang = navigator.language || "en-US";

      recognition.onstart = () => {
        isRecognitionRunningRef.current = true;
      };

      recognition.onerror = (event) => {
        console.warn("Speech recognition error:", event?.error);
        if (event?.error === 'not-allowed') {
          setPermissionError(true);
        }
      };

      recognition.onresult = (event) => {
        if (!latestState.current.isMicOn || latestState.current.isPaused || latestState.current.isManualEditing || analysisBusyRef.current) return;

        let sessionFinal = "";
        let sessionInterim = "";

        for (let i = 0; i < event.results.length; ++i) {
          const item = event.results[i];
          if (item.isFinal) {
            sessionFinal += item[0].transcript + " ";
          } else {
            sessionInterim += item[0].transcript;
          }
        }

        const cleanSessionFinal = sessionFinal.trim();
        const base = finalizedPrefixRef.current.trim();
        const fullTranscript = base
          ? (cleanSessionFinal ? `${base} ${cleanSessionFinal}` : base)
          : cleanSessionFinal;

        if (cleanSessionFinal || sessionInterim) {
          setTranscript(fullTranscript || sessionInterim);
          segmentBufferRef.current = fullTranscript || sessionInterim;

        }
        setInterimTranscript(sessionInterim);

        if (cleanSessionFinal && !isMobile) {
          if (segmentTimeoutRef.current) {
            clearTimeout(segmentTimeoutRef.current);
            segmentTimeoutRef.current = null;
          }
          let timeoutMs = 4000;
          try {
            const pacing = localStorage.getItem("pacing_profile");
            if (pacing && pacing.includes("2.5s")) timeoutMs = 2500;
            else if (pacing && pacing.includes("7s")) timeoutMs = 7000;
          } catch {}
          segmentTimeoutRef.current = setTimeout(() => {
            if (isSpeakingRef.current) return;
            const finalSegment = segmentBufferRef.current.trim();
            if (finalSegment && finalSegment.length >= 10) {
              latestState.current.triggerAnalysis(finalSegment);
            }
          }, timeoutMs);
        }
      };

      recognition.onend = () => {
        isRecognitionRunningRef.current = false;
        if (segmentBufferRef.current) {
          finalizedPrefixRef.current = segmentBufferRef.current;
        }
        // ONLY auto-restart on desktop Chrome where continuous loop doesn't fight mobile audio HAL
        if (!isMobile) {
          const { isSessionActive, isMicOn, isPaused, isManualEditing } = latestState.current;
          if (isSessionActive && isMicOn && !isPaused && !isManualEditing && !analysisBusyRef.current) {
            setTimeout(() => {
              if (latestState.current.isSessionActive && latestState.current.isMicOn && !latestState.current.isPaused && !analysisBusyRef.current && !isRecognitionRunningRef.current) {
                restartRecognition();
              }
            }, 300);
          }
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch {
      console.warn("Recognition could not start.");
    }
  }, []);

  const stopRecognition = useCallback(() => {
    isRecognitionRunningRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    setInterimTranscript("");
  }, []);

  useEffect(() => {
    if (isSessionActive && isMicOn && !isPaused && !analysisBusyRef.current) {
      startRecognition();
    } else {
      stopRecognition();
    }
    return () => {
      stopRecognition();
    };
  }, [isMicOn, isSessionActive, isPaused, isManualEditing, isStreaming, startRecognition, stopRecognition]);

  const resetSessionState = () => {
    cancelAnalysis();
    if (mediaStreamRef.current) startRecording(mediaStreamRef.current);
    finalizedPrefixRef.current = "";
    setTranscriptParagraphs([]);
    setTranscript("");
    setInterimTranscript("");
    setMarkdownFeedback("");
    setIsStreaming(false);



    segmentBufferRef.current = "";

    setAppState("LISTENING");
  };

  const handleRetry = () => {
    cancelAnalysis();
    retryRef.current = true;
    finalizedPrefixRef.current = "";
    if (mediaStreamRef.current) startRecording(mediaStreamRef.current);

    setTranscriptParagraphs([]);
    setTranscript("");
    setInterimTranscript("");
    segmentBufferRef.current = "";

    setAppState("LISTENING");
  };

  const persistSession = async () => {
    if (savingRef.current) return false;
    if (!pendingSaveRef.current && sessionStartTime) {
      const duration = Math.min(14400000, Date.now()-sessionStartTime);
      const speaking = speakingTimeMs + (isSpeakingRef.current ? Date.now()-lastSpeakTimeRef.current : 0);
      pendingSaveRef.current = { id: sessionIdRef.current, mode: modeSchema.parse(selectedMode), duration_ms: duration, speaking_time_ms: Math.max(0,Math.min(duration,speaking)), feedbacks: feedbacksRef.current };
    }
    if (!pendingSaveRef.current) { setSaveError('The session did not finish starting. Start a new session and try again.'); return false; }
    savingRef.current = true; setIsSaving(true); setSaveError(null);
    try {
      const result = await savePracticeSession(pendingSaveRef.current);
      if ("serverError" in result) throw new Error(result.serverError);
      pendingSaveRef.current = null;
      return true;
    } catch (error) { setSaveError(error instanceof Error ? error.message : "Session was not saved."); return false; }
    finally { savingRef.current = false; setIsSaving(false); }
  };

  const toggleSession = async () => {
    if (startingRef.current || savingRef.current || pendingSaveRef.current) return;
    cancelAnalysis();
    if (!isSessionActive) {
      startingRef.current = true; setIsStarting(true);
      const request = mediaRequestRef.current;
      try {
      await ensureUser();
      if (request !== mediaRequestRef.current) return;
      setIsPaused(false);
      if (!await startMedia()) return;
      startRecording();
      startRecognition();
      setSessionStartTime(Date.now());
      setSpeakingTimeMs(0);
      isSpeakingRef.current = false;
      lastSpeakTimeRef.current = Date.now();
      feedbacksRef.current = [];

      sessionIdRef.current = crypto.randomUUID();
      resetSessionState();
      setIsSessionActive(true);
      } catch { stopMedia(); setSaveError('The training session could not start. Please retry or sign in.'); }
      finally { startingRef.current = false; setIsStarting(false); }
    } else {
      stopMedia();
      if (recognitionRef.current) recognitionRef.current.stop();
      if (segmentTimeoutRef.current) clearTimeout(segmentTimeoutRef.current);


      setIsSessionActive(false);
      setAppState("IDLE");
      setAudioLevel(0);
      await persistSession();
    }
  };

  useEffect(() => {
    const resources = { answerVersionRef, analysisAbortRef, mediaRecorderRef, mediaRequestRef };
    return () => {
      resources.mediaRequestRef.current++;
      resources.answerVersionRef.current++;
      resources.analysisAbortRef.current?.abort();
      if (resources.mediaRecorderRef.current) { resources.mediaRecorderRef.current.onstop = null; }
      mediaStreamRef.current?.getTracks().forEach(track => track.stop());
      cleanupAudioAnalysis();
      stopRecording();
      if (recognitionRef.current) recognitionRef.current.stop();
      if (segmentTimeoutRef.current) clearTimeout(segmentTimeoutRef.current);
    };
  }, [stopRecording]);

  const getAppStatus = () => {
    switch (appState) {
      case "IDLE": return { text: "IDLE", color: "text-gray-500", indicator: "bg-gray-500" };
      case "LISTENING": return isPaused ? { text: "PAUSED", color: "text-amber-500", indicator: "bg-amber-500" } : { text: "LISTENING...", color: "text-blue-400", indicator: "bg-blue-400 animate-pulse" };
      case "SPEAKING": return { text: "RECEIVING AUDIO...", color: "text-green-400", indicator: "bg-green-400" };
      case "ANALYZING": return { text: "ANALYZING...", color: "text-purple-400", indicator: "bg-purple-400 animate-pulse" };
      case "COACHING": return { text: "FEEDBACK READY", color: "text-amber-400", indicator: "bg-amber-400" };
      default: return { text: "", color: "", indicator: "" };
    }
  };

  const status = getAppStatus();



  // NEW LAYOUT: 75% AI Coach / 25% Tools
  if (!browserSupported) {
    return (
      <div className="flex items-center justify-center h-full min-h-[calc(100vh-4rem)] p-4 max-w-[1600px] mx-auto bg-gray-950 text-gray-200">
      {saveError && <div role="alert" className="p-4 border border-red-500 rounded-lg text-red-400">{saveError} <button disabled={isSaving} onClick={() => void persistSession()} className="underline ml-3">Retry saving</button></div>}
      {isSaving && <p role="status" className="text-gray-400">Saving your session...</p>}
        <div className="bg-amber-500/10 border border-amber-500 rounded-xl p-8 flex flex-col items-center gap-4 max-w-lg text-center shadow-lg">
          <AlertTriangle size={48} className="text-amber-500" />
          <h2 className="text-2xl font-bold text-amber-500">Browser Not Supported</h2>
          <p className="text-gray-300">Speech recognition requires Google Chrome or Microsoft Edge. Please switch browsers for the full experience.</p>
        </div>
      </div>
    );
  }

  if (permissionError) {
    return (
      <div className="flex flex-col h-full min-h-[calc(100vh-4rem)] items-center justify-center p-4 bg-gray-950 text-gray-200">
        <div className="bg-red-500/10 border border-red-500/50 rounded-xl p-8 flex flex-col items-center gap-4 max-w-lg text-center shadow-lg">
          <AlertCircle size={48} className="text-red-500" />
          <h2 className="text-2xl font-bold text-red-500">Microphone Access Required</h2>
          <p className="text-gray-300 mb-2">Microphone access is required for speech training.</p>
          <div className="bg-gray-900 border border-gray-800 p-4 rounded-lg text-sm text-gray-400 mb-4 w-full text-left flex flex-col gap-2">
            <p>1. Click the camera/lock icon in your browser&apos;s address bar.</p>
            <p>2. Enable Microphone permissions.</p>
            <p>3. Refresh the page or click Try Again.</p>
          </div>
          <button
            onClick={() => {
              setPermissionError(false);
              void toggleSession().catch(() => setSaveError('The training session could not start. Please retry or sign in.'));
            }}
            className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-black rounded-xl font-bold text-lg shadow-lg transition-transform hover:scale-[1.02]"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-[calc(100vh-4rem)] p-4 max-w-[1600px] mx-auto space-y-4 bg-gray-950 text-gray-200">
      {saveError && <div role="alert" className="p-4 border border-red-500 rounded-lg text-red-400">{saveError} <button disabled={isSaving} onClick={() => void persistSession()} className="underline ml-3">Retry saving</button></div>}
      {isSaving && <p role="status" className="text-gray-400">Saving your session...</p>}

      {/* Header */}
      <div className="flex justify-between items-center bg-gray-900 border border-gray-800 rounded-xl p-3 shadow-lg">
        <div className="flex items-center gap-4">
          <select
            value={selectedMode}
            onChange={(e) => setSelectedMode(modeSchema.parse(e.target.value))}
            disabled={isSessionActive}
            className="bg-black border border-gray-700 rounded-lg px-3 py-1.5 text-sm font-medium outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-50 text-gray-300"
          >
            <option value="conversation">Conversation</option>
            <option value="story">Storytelling</option>
            <option value="public_speaking">Public Speaking</option>
            <option value="wit">Wit & Humor</option>
            <option value="explanation">Explanation</option>
            <option value="qna">Q&A</option>
          </select>
        </div>

        <div className="flex items-center gap-3 text-sm font-medium tracking-wide">
          <span className="text-gray-400 text-xs uppercase">System Status:</span>
          <div className="flex items-center gap-2">
            <div className={cn("w-2 h-2 rounded-full", status.indicator)} />
            <span className={status.color}>{status.text}</span>
          </div>
        </div>
      </div>

      {/* Main Workspace  */}
      <div className="flex flex-col lg:flex-row gap-4 flex-1">

        {/* LEFT COLUMN: AI COACH (75%) */}
        <div className="flex-[3] flex flex-col gap-4">

          {/* AI Feedback Panel */}
          <div className="flex-1 bg-gray-900 border border-gray-800 rounded-xl shadow-lg flex flex-col overflow-hidden relative">
            <div className="bg-black/40 border-b border-gray-800 p-4 flex items-center justify-between">
              <h2 className="font-bold text-lg tracking-wide text-amber-500 flex items-center gap-2">
                <BrainCircuit size={20} /> AI Communication Coach
              </h2>
            </div>

            <div className="p-6 flex-1 overflow-y-auto">
              {!markdownFeedback && !isStreaming && appState !== "ANALYZING" && appState !== "COACHING" && (
                <div className="h-full flex flex-col items-center justify-center text-center text-gray-500">
                  <div className="w-20 h-20 bg-gray-900 rounded-full flex items-center justify-center border border-gray-800 mb-6 shadow-xl">
                    <BrainCircuit size={32} className="text-gray-700" />
                  </div>
                  <h3 className="text-xl font-medium text-gray-400 mb-2">Awaiting Speech</h3>
                  <p className="text-sm max-w-md">The AI Coach is listening. Speak naturally. Feedback will appear here after you finish a thought.</p>
                </div>
              )}

              {appState === "ANALYZING" && (
                <div className="h-full flex flex-col items-center justify-center text-center text-purple-400 gap-4">
                  <RefreshCw size={32} className="animate-spin opacity-80" />
                  <p className="text-lg font-medium tracking-wide">Analyzing your communication...</p>
                </div>
              )}

              {/* Error UI */}
              {analysisError && appState === "COACHING" && (
                <div className="h-full flex flex-col items-center justify-center text-center gap-4 animate-in fade-in">
                  <AlertCircle size={40} className="text-red-500 mb-2" />
                  <h4 className="font-bold text-gray-100 text-xl">Analysis Failed</h4>
                  <p className="text-gray-400">{analysisError}</p>
                  <button onClick={() => { setAnalysisError(null); setAppState("LISTENING"); }} className="mt-4 px-6 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm font-bold transition-colors">
                    Dismiss
                  </button>
                </div>
              )}

              {(markdownFeedback || isStreaming) && appState === "COACHING" && (
                <div className="flex flex-col gap-6 animate-in fade-in">
                  <div className="prose prose-invert prose-amber max-w-none text-gray-200">
                    <ReactMarkdown>{markdownFeedback}</ReactMarkdown>
                    {isStreaming && (
                      <span className="inline-block w-2 h-4 bg-amber-500 animate-pulse ml-1 align-middle"></span>
                    )}
                  </div>

                  {/* Retry Action Area */}
                  {!isStreaming && (
                  <div className="mt-4 p-6 bg-gray-900 border border-gray-800 rounded-xl shadow-lg">
                     <div className="flex flex-col gap-4">
                       <div className="flex gap-3">
                         <button onClick={resetSessionState} className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl font-bold transition-colors">
                           Continue Next
                         </button>
                         <button onClick={handleRetry} className="flex-[2] py-3 bg-amber-500 hover:bg-amber-400 text-black rounded-xl font-bold text-lg shadow-lg flex items-center justify-center gap-2 transition-transform hover:scale-[1.02]">
                           <RefreshCw size={20} /> Try Again Now
                         </button>
                       </div>
                     </div>
                  </div>
                  )}
                </div>
              )}
            </div>

            {/* Live Transcript docked to bottom of AI panel */}
            <div className="min-h-36 bg-gray-950 border-t border-gray-800 p-4 overflow-y-auto relative flex flex-col">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-2">
                    <Mic size={12} className={audioLevel > 5 ? "text-green-500 animate-pulse" : "text-gray-500"} />
                    Live Transcript
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => { if (!isManualEditing) { stopRecognition(); stopRecording(); } else if (isSessionActive) { finalizedPrefixRef.current = transcript; startRecognition(); startRecording(); } setIsManualEditing(!isManualEditing); }}
                      className="text-[11px] text-amber-500 hover:text-amber-400 font-semibold px-2 py-0.5 rounded hover:bg-amber-500/10 transition"
                    >
                      {isManualEditing ? "🎤 Voice View" : "✏️ Type / Edit"}
                    </button>
                    {isSessionActive && (
                      <button
                        onClick={handleAnalyzeNow}
                        disabled={isStreaming || appState === "ANALYZING" || isTranscribing}
                        className="flex items-center gap-1.5 px-3 py-1 bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold rounded-full transition-transform hover:scale-105 shadow-md disabled:opacity-50"
                      >
                        <Send size={12} />
                        {isTranscribing ? "Transcribing..." : "Done Speaking — Analyze"}
                      </button>
                    )}
                  </div>
                </div>
                {isManualEditing ? (
                  <textarea
                    value={transcript}
                    disabled={isTranscribing || isStreaming}
                    maxLength={12000}
                    onChange={(e) => {
                      setTranscript(e.target.value);
                      segmentBufferRef.current = e.target.value;
                    }}
                    placeholder="Type or edit your answer here..."
                    className="w-full flex-1 min-h-[80px] bg-transparent text-gray-200 text-sm outline-none resize-none placeholder-gray-600"
                  />
                ) : (
                  <>
                    {transcriptParagraphs.map((p, i) => (
                      <p key={i} className="text-gray-300 text-sm leading-relaxed mb-2">{p}</p>
                    ))}
                    {transcript || interimTranscript ? (
                      <p className="text-gray-300 text-sm leading-relaxed">
                        {transcript} <span className="text-gray-500 italic animate-pulse">{interimTranscript}</span>
                      </p>
                    ) : (
                      <p className="text-gray-600 text-xs italic my-auto">
                        {isSessionActive ? "🎙️ Listening... Speak your answer aloud, then tap 'Done Speaking — Analyze'." : "Start training session to speak."}
                      </p>
                    )}
                  </>
                )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Audio Controls & Meter */}
        <div className="flex-1 lg:max-w-[320px] xl:max-w-[360px] flex flex-col gap-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col gap-4 shadow-lg">
             <button
                onClick={() => { void toggleSession().catch(() => setAnalysisError("Session could not be started. Please sign in or try again.")); }}
                disabled={isSaving || isStarting}
                className={cn(
                  "w-full py-4 rounded-xl font-black tracking-wider transition-all shadow-lg flex items-center justify-center gap-2 text-lg",
                  isSessionActive
                    ? "bg-red-600/10 text-red-500 hover:bg-red-600/20 border border-red-900/50"
                    : "bg-amber-500 text-black hover:bg-amber-400 hover:scale-[1.02]"
                )}
              >
                {isStarting ? 'STARTING…' : isSessionActive ? <><Square size={20} fill="currentColor" /> END SESSION</> : <><Play size={20} fill="currentColor" /> START TRAINING</>}
              </button>

              <div className="flex gap-2">
                <button
                  onClick={toggleMic}
                  disabled={!isSessionActive}
                  className={cn("flex-1 py-3 rounded-lg flex flex-col items-center justify-center gap-1 transition-colors disabled:opacity-50 text-xs font-bold uppercase tracking-wider",
                    isMicOn ? "bg-gray-800 hover:bg-gray-700 text-gray-300" : "bg-red-900/20 text-red-500 border border-red-900/30"
                  )}
                >
                  {isMicOn ? <Mic size={20} /> : <MicOff size={20} />}
                  Mic
                </button>

                <button
                  onClick={togglePause}
                  disabled={!isSessionActive}
                  className={cn("flex-1 py-3 rounded-lg flex flex-col items-center justify-center gap-1 transition-colors disabled:opacity-50 text-xs font-bold uppercase tracking-wider",
                    !isPaused ? "bg-gray-800 hover:bg-gray-700 text-gray-300" : "bg-amber-900/20 text-amber-500 border border-amber-900/30"
                  )}
                >
                  {isPaused ? <Play size={20} /> : <Pause size={20} />}
                  {isPaused ? 'Resume' : 'Pause'}
                </button>
              </div>

              {/* Live Audio Level Meter */}
              <div className="bg-black/50 rounded-lg p-3 border border-gray-800">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Voice Input Level</span>
                  <span className="text-[10px] font-bold text-gray-600">{Math.round(audioLevel)}%</span>
                </div>
                <div className="h-1.5 w-full bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-green-500 via-amber-500 to-red-500 transition-all duration-75"
                    style={{ width: `${isMicOn ? audioLevel : 0}%` }}
                  />
                </div>
              </div>

              {/* Recorded Audio Playback */}
              {audioUrl && (
                <div className="bg-black/40 rounded-lg p-3 border border-gray-800">
                  <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider block mb-2">Your Speech Recording</span>
                  <audio key={audioUrl} controls src={audioUrl} className="w-full h-8" />
                </div>
              )}
          </div>
        </div>

      </div>
    </div>
  );
}
