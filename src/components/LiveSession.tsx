"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Mic, MicOff, Play, Square, RefreshCw, AlertCircle, Activity, BrainCircuit, AlertTriangle, Send, CheckCircle, Pause } from "lucide-react";
import { cn, isMobileDevice } from "@/lib/utils";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getGuestId } from "@/lib/auth";
import { transcribeAudio } from "@/app/actions";
import { CoachingFeedback, ComparisonFeedback, analyzeCommunicationSegment, compareAttempts, generateSessionDimensions, generateTotalInsights } from "@/app/actions";

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

type SessionState = "IDLE" | "LISTENING" | "SPEAKING" | "ANALYZING" | "COACHING";

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl ? dataUrl.split(",")[1] || "" : "";
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function LiveSession() {
  
  const searchParams = useSearchParams();
  const initialMode = searchParams?.get("mode") || "conversation";
  const [selectedMode, setSelectedMode] = useState(initialMode);

  const [isPaused, setIsPaused] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isMicOn, setIsMicOn] = useState(true);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [hasPermissions, setHasPermissions] = useState(false);
  
  const [browserSupported, setBrowserSupported] = useState(true);
  const [permissionError, setPermissionError] = useState(false);
  const [hasUnanalyzedSpeech, setHasUnanalyzedSpeech] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      setBrowserSupported(!!SpeechRecognition);
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
  const recognitionRef = useRef<any>(null);
  const isRecognitionRunningRef = useRef<boolean>(false);
  
  const finalizedPrefixRef = useRef<string>("");
  const segmentBufferRef = useRef<string>("");
  const segmentTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const [feedback, setFeedback] = useState<CoachingFeedback | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  
  const [isRetryMode, setIsRetryMode] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isManualEditing, setIsManualEditing] = useState(false);
  const [previousAttempt, setPreviousAttempt] = useState<string>("");

  const startRecording = useCallback((streamToUse?: MediaStream) => {
    const activeStream = streamToUse || mediaStream;
    if (!activeStream) return;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") return;

    try {
      let mimeType = 'audio/webm;codecs=opus';
      if (typeof MediaRecorder !== 'undefined') {
        if (!MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : (MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '');
        }
      }
      const options = mimeType ? { mimeType } : undefined;
      const recorder = new MediaRecorder(activeStream, options);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };
      recorder.onstop = () => {
        if (audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, { type: mimeType || 'audio/webm' });
          const url = URL.createObjectURL(audioBlob);
          setAudioUrl(url);
        }
      };
      recorder.start(250);
      mediaRecorderRef.current = recorder;
    } catch (e) {
      console.error("Failed to start recording", e);
    }
  }, [mediaStream]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        console.error("Error stopping recorder", e);
      }
    }
  }, []);

  const [comparison, setComparison] = useState<ComparisonFeedback | null>(null);


  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [speakingTimeMs, setSpeakingTimeMs] = useState<number>(0);
  const [accumulatedFeedbacks, setAccumulatedFeedbacks] = useState<any[]>([]);
  const isSpeakingRef = useRef<boolean>(false);
  const lastSpeakTimeRef = useRef<number>(0);

  const setupAudioAnalysis = async (stream: MediaStream) => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (analyserRef.current) {
      try { analyserRef.current.disconnect(); } catch(e) {}
      analyserRef.current = null;
    }

    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
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
      if (!analyserRef.current || !latestState.current.isMicOn) {
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
    if (audioContextRef.current?.state !== 'closed') audioContextRef.current?.close();
    audioContextRef.current = null;
    analyserRef.current = null;
  };

  const startMedia = async () => {
    try {
      setPermissionError(false);
      const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
      setMediaStream(stream);
      setHasPermissions(true);
      
      stream.getAudioTracks().forEach(t => t.enabled = isMicOn);

      setupAudioAnalysis(stream);
      startRecording(stream);
    } catch (err) {
      console.error("Error accessing media devices.", err);
      setHasPermissions(false);
      setPermissionError(true);
      setIsSessionActive(false); // Make sure session is not active if permissions fail
    }
  };

  const stopMedia = () => {
    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop());
      setMediaStream(null);
    }
    cleanupAudioAnalysis();
  };



  const togglePause = () => {
    const newState = !isPaused;
    setIsPaused(newState);
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
    if (segmentTimeoutRef.current) clearTimeout(segmentTimeoutRef.current);
    let finalSegment = segmentBufferRef.current.trim();
    if (!finalSegment && transcript.trim()) {
      finalSegment = transcript.trim();
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      try {
        if (typeof mediaRecorderRef.current.requestData === "function") {
          mediaRecorderRef.current.requestData();
        }
      } catch (e) {}
    }

    if ((!finalSegment || finalSegment.length < 10) && audioChunksRef.current.length > 0) {
      setIsTranscribing(true);
      try {
        const mime = mediaRecorderRef.current?.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: mime });
        if (blob.size > 200) {
          const base64 = await blobToBase64(blob);
          if (base64) {
            const res = await transcribeAudio(base64, mime);
            if (res.transcript && res.transcript.trim().length >= 2) {
              finalSegment = res.transcript.trim();
              setTranscript(finalSegment);
              setTranscriptParagraphs(prev => [...prev, finalSegment]);
            }
          }
        }
      } catch (err) {
        console.error("Audio cloud transcription fallback error in LiveSession:", err);
      } finally {
        setIsTranscribing(false);
      }
    }

    if (finalSegment && finalSegment.length > 0) {
      latestState.current.triggerAnalysis(finalSegment);
    }
  };

  const triggerAnalysis = async (textToAnalyze: string) => {
    stopRecording();
    if (textToAnalyze.trim().length < 10) {
      setAnalysisError("Response too short to analyze. Please elaborate.");
      setTimeout(() => setAnalysisError(null), 4000);
      return;
    }
    
    segmentBufferRef.current = "";
    setHasUnanalyzedSpeech(false);
    setTranscriptParagraphs(prev => [...prev, textToAnalyze]);
    setTranscript("");

    setAppState("ANALYZING");
    setAnalysisError(null);
    try {
      if (isRetryMode && previousAttempt && feedback) {
        const { compareAttempts } = await import('@/app/actions');
        const result = await compareAttempts(previousAttempt, textToAnalyze, feedback, selectedMode);
        if (result && 'serverError' in result) {
          setAnalysisError(result.serverError as string);
          setAppState("COACHING");
        } else if (result) {
          setComparison(result as ComparisonFeedback);
          setAccumulatedFeedbacks(prev => [...prev, {
            transcript: textToAnalyze,
            score: result.newScore,
            biggest_weakness: "Retry",
            fix: result.whatRemainsWeak,
            is_retry: true,
            retry_improvement: result.newScore - (feedback?.overallScore || 0),
            raw_feedback: result
          }]);
          setAppState("COACHING");
        } else {
          setAppState("LISTENING");
        }
      } else {
        const { analyzeCommunicationSegment } = await import('@/app/actions');
        const jd = localStorage.getItem("target_jd") || undefined;
        const result = await analyzeCommunicationSegment(textToAnalyze, selectedMode, jd);
        if (result && 'serverError' in result) {
          setAnalysisError(result.serverError as string);
          setAppState("COACHING");
        } else if (result) {
          setFeedback(result as CoachingFeedback);
          setPreviousAttempt(textToAnalyze);

          let weakness = result.communicationIssue?.description || result.coachingTip || "Needs improvement";
          let fixText = result.coachingTip || "Try again";

          setAccumulatedFeedbacks(prev => [...prev, {
            transcript: textToAnalyze,
            score: result.overallScore,
            biggest_weakness: weakness,
            fix: fixText,
            is_retry: false,
            retry_improvement: null,
            raw_feedback: result,
          }]);

          setAppState("COACHING");
        } else {
          setAppState("LISTENING");
        }
      }
    } catch (error: any) {
      console.error("Analysis failed:", error);
      setAnalysisError(error.message || "Failed to analyze response");
      setAppState("COACHING");
    }
  };

  const latestState = useRef({ isMicOn, isSessionActive, isPaused, triggerAnalysis, startRecording });
  useEffect(() => {
    latestState.current = { isMicOn, isSessionActive, isPaused, triggerAnalysis, startRecording };
  }, [isMicOn, isSessionActive, isPaused, triggerAnalysis, startRecording]);

  const startRecognition = useCallback(() => {
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
      } catch(e) {}
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

      recognition.onerror = (event: any) => {
        console.warn("Speech recognition error:", event?.error);
        if (event?.error === 'not-allowed') {
          setPermissionError(true);
        }
      };

      recognition.onresult = (event: any) => {
        if (!latestState.current.isMicOn || latestState.current.isPaused) return;

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
          setHasUnanalyzedSpeech(true);
        }
        setInterimTranscript(sessionInterim);

        if (cleanSessionFinal && !isMobile) {
          if (segmentTimeoutRef.current) {
            clearTimeout(segmentTimeoutRef.current);
            segmentTimeoutRef.current = null;
          }
          let timeoutMs = 8000;
          try {
            const pacing = localStorage.getItem("pacing_profile");
            if (pacing && pacing.includes("2.5s")) timeoutMs = 5000;
            else if (pacing && pacing.includes("7s")) timeoutMs = 10000;
          } catch(e) {}
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
          const { isSessionActive, isMicOn, isPaused } = latestState.current;
          if (isSessionActive && isMicOn && !isPaused) {
            setTimeout(() => {
              if (latestState.current.isSessionActive && !isRecognitionRunningRef.current) {
                startRecognition();
              }
            }, 300);
          }
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch(e) {
      console.warn("Recognition start error:", e);
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
      } catch(e) {}
      recognitionRef.current = null;
    }
    setInterimTranscript("");
  }, []);

  useEffect(() => {
    if (isSessionActive && isMicOn && !isPaused) {
      startRecognition();
    } else {
      stopRecognition();
    }
    return () => {
      stopRecognition();
    };
  }, [isMicOn, isSessionActive, isPaused, startRecognition, stopRecognition]);

  const resetSessionState = () => {
    finalizedPrefixRef.current = "";
    setTranscriptParagraphs([]);
    setTranscript("");
    setInterimTranscript("");
    setFeedback(null);
    setComparison(null);
    setIsRetryMode(false);
    setPreviousAttempt("");
    segmentBufferRef.current = "";
    setHasUnanalyzedSpeech(false);
    setAppState("LISTENING");
  };

  const handleRetry = () => {
    setIsRetryMode(true);
    setTranscriptParagraphs([]);
    setTranscript("");
    setInterimTranscript("");
    segmentBufferRef.current = "";
    setHasUnanalyzedSpeech(false);
    setAppState("LISTENING");
  };

  const toggleSession = async () => {
    if (!isSessionActive) {
      setIsSessionActive(true);
      await startMedia();
      startRecording();
      startRecognition();
      setSessionStartTime(Date.now());
      setSpeakingTimeMs(0);
      setAccumulatedFeedbacks([]);
      resetSessionState();
    } else {
      stopMedia();
      if (recognitionRef.current) recognitionRef.current.stop();
      if (segmentTimeoutRef.current) clearTimeout(segmentTimeoutRef.current);
      setHasUnanalyzedSpeech(false);
      
      if (sessionStartTime) {
        const duration = Date.now() - sessionStartTime;
        const scoredFeedbacks = accumulatedFeedbacks.filter(f => f.score > 0);
        const overallScore = scoredFeedbacks.length > 0
          ? Math.round(scoredFeedbacks.reduce((acc, f) => acc + f.score, 0) / scoredFeedbacks.length)
          : null;

        const saveToDb = async () => {
          try {
            const { data: sessionData, error: sessionError } = await supabase
              .from('sessions')
              .insert({
                mode: selectedMode,
                user_id: getGuestId(),
                duration_ms: duration,
                speaking_time_ms: speakingTimeMs,
                overall_score: overallScore
              })
              .select('id')
              .single();

            if (sessionError) throw sessionError;

            if (sessionData && accumulatedFeedbacks.length > 0) {
              const feedbackInserts = accumulatedFeedbacks.map(f => ({
                session_id: sessionData.id,
                ...f
              }));

              await supabase.from('session_feedbacks').insert(feedbackInserts);

              const { generateSessionDimensions } = await import('@/app/actions');
              const dimensions = await generateSessionDimensions(accumulatedFeedbacks);
              if (dimensions && dimensions.length > 0) {

                const dimensionInserts = dimensions.map((d: any) => ({
                  session_id: sessionData.id,
                  dimension: d.dimension,
                  score: d.score
                }));
                await supabase.from('session_dimensions').insert(dimensionInserts);
              }
            }
          } catch (err) {
            console.error("Failed to save session to Supabase:", err);
          }
        };
        saveToDb();
      }

      setIsSessionActive(false);
      setAppState("IDLE");
      setAudioLevel(0);
    }
  };

  useEffect(() => {
    return () => {
      stopMedia();
      if (recognitionRef.current) recognitionRef.current.stop();
      if (segmentTimeoutRef.current) clearTimeout(segmentTimeoutRef.current);
    };
  }, []);

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

  useEffect(() => {
  }, [false, isSessionActive]);

  // NEW LAYOUT: 75% AI Coach / 25% Camera+Tools
  if (!browserSupported) {
    return (
      <div className="flex items-center justify-center h-full min-h-[calc(100vh-4rem)] p-4 max-w-[1600px] mx-auto bg-gray-950 text-gray-200">
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
            <p>1. Click the camera/lock icon in your browser's address bar.</p>
            <p>2. Enable Microphone permissions.</p>
            <p>3. Refresh the page or click Try Again.</p>
          </div>
          <button 
            onClick={() => {
              setPermissionError(false);
              startMedia();
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
      
      {/* Header */}
      <div className="flex justify-between items-center bg-gray-900 border border-gray-800 rounded-xl p-3 shadow-lg">
        <div className="flex items-center gap-4">
          <select 
            value={selectedMode}
            onChange={(e) => setSelectedMode(e.target.value)}
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
              {!feedback && !comparison && appState !== "ANALYZING" && (
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

              {/* Retry / Comparison UI */}
              {comparison && !analysisError && appState === "COACHING" && (
                <div className="flex flex-col gap-6 animate-in fade-in max-w-3xl mx-auto w-full">
                  <div className="flex justify-between items-center border-b border-gray-800 pb-4">
                    <h3 className="font-bold text-gray-100 text-2xl">Retry Evaluation</h3>
                    <div className={cn("px-4 py-1.5 rounded-full text-sm font-bold uppercase tracking-wider", comparison.didImprove ? "bg-green-900/40 text-green-400 border border-green-800" : "bg-red-900/40 text-red-400 border border-red-800")}>
                      {comparison.didImprove ? "Improved" : "Needs Work"}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-5 bg-green-900/10 border border-green-900/30 rounded-xl">
                      <span className="text-xs font-bold uppercase tracking-wider text-green-500 mb-2 block">What Improved</span>
                      <p className="text-green-100/80 leading-relaxed">{comparison.whatImproved}</p>
                    </div>
                    <div className="p-5 bg-orange-900/10 border border-orange-900/30 rounded-xl">
                      <span className="text-xs font-bold uppercase tracking-wider text-orange-500 mb-2 block">What Remains Weak</span>
                      <p className="text-orange-100/80 leading-relaxed">{comparison.whatRemainsWeak}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between bg-gray-900 p-6 rounded-xl border border-gray-800 mt-4">
                     <div>
                       <p className="text-gray-400 text-sm mb-1 uppercase tracking-wider font-bold">New Score</p>
                       <div className="flex items-baseline gap-2">
                         <span className={cn("text-4xl font-black", comparison.newScore > (feedback?.overallScore || 0) ? "text-green-400" : "text-gray-100")}>{comparison.newScore}</span>
                         <span className="text-gray-600 font-medium text-lg">/ 100</span>
                       </div>
                     </div>
                     <button onClick={resetSessionState} className="px-8 py-3 bg-white text-black hover:bg-gray-200 rounded-xl font-bold transition-colors shadow-lg text-lg">
                       Continue Session
                     </button>
                  </div>
                </div>
              )}

              {/* Complex Feedback UI */}
              {feedback && !comparison && !analysisError && appState === "COACHING" && (
                <div className="flex flex-col gap-6 animate-in fade-in">
                  
                  {/* Top Level Score & Tip */}
                  <div className="flex items-start justify-between bg-gray-900/50 p-6 rounded-2xl border border-gray-800">
                    <div className="flex-1 pr-8">
                      <span className="text-xs font-bold uppercase tracking-wider text-amber-500 mb-2 block">Primary Coaching Tip</span>
                      <h3 className="text-2xl font-semibold text-gray-100 leading-snug">{feedback.coachingTip}</h3>
                    </div>
                    <div className="flex flex-col items-end shrink-0 pl-6 border-l border-gray-800">
                      <span className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1 block">Score</span>
                      <div className="flex items-baseline gap-1">
                        <span className={cn("text-5xl font-black tracking-tighter", feedback.overallScore > 80 ? "text-green-400" : feedback.overallScore > 60 ? "text-amber-400" : "text-red-400")}>{feedback.overallScore}</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {/* Communication Issue */}
                    {feedback.communicationIssue?.detected && (
                      <div className="p-5 bg-red-900/10 border border-red-900/30 rounded-xl flex flex-col gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-red-500 block">Communication Weakness</span>
                        <h4 className="text-lg font-bold text-red-100">{feedback.communicationIssue.title}</h4>
                        <p className="text-sm text-red-200/70">{feedback.communicationIssue.description}</p>
                        <div className="mt-2 text-xs font-medium text-red-400/80 bg-red-950/40 p-2 rounded">
                          <strong>Why it matters:</strong> {feedback.communicationIssue.whyItMatters}
                        </div>
                      </div>
                    )}

                    {/* Language Correction */}
                    {feedback.languageCorrection?.detected && (
                      <div className="p-5 bg-orange-900/10 border border-orange-900/30 rounded-xl flex flex-col gap-2">
                         <span className="text-[10px] font-bold uppercase tracking-wider text-orange-500 block">Grammar & Phrasing</span>
                         <div className="text-sm text-gray-400 line-through decoration-red-500/50">{feedback.languageCorrection.original}</div>
                         <div className="text-base font-semibold text-orange-100">{feedback.languageCorrection.corrected}</div>
                         <p className="text-xs text-orange-200/70 mt-1">{feedback.languageCorrection.explanation}</p>
                      </div>
                    )}

                    {/* Natural English */}
                    {feedback.naturalEnglish?.detected && (
                       <div className="p-5 bg-blue-900/10 border border-blue-900/30 rounded-xl flex flex-col gap-2">
                         <span className="text-[10px] font-bold uppercase tracking-wider text-blue-500 block">Natural English</span>
                         <div className="text-sm text-gray-400 italic">"{feedback.naturalEnglish.original}"</div>
                         <div className="text-base font-semibold text-blue-100">"{feedback.naturalEnglish.betterVersion}"</div>
                         <p className="text-xs text-blue-200/70 mt-1">{feedback.naturalEnglish.explanation}</p>
                       </div>
                    )}

                  </div>

                  {/* Retry Action Area */}
                  <div className="mt-4 p-6 bg-gray-900 border border-gray-800 rounded-xl shadow-lg">
                     <div className="flex flex-col gap-4">
                       <div>
                         <span className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1 block">{feedback.retryRequired ? 'Required Retry' : 'Optional Retry'}</span>
                         <p className="text-gray-200 text-lg">{feedback.retryInstruction}</p>
                       </div>
                       <div className="flex gap-3">
                         <button onClick={resetSessionState} className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl font-bold transition-colors">
                           Skip & Continue
                         </button>
                         <button onClick={handleRetry} className="flex-[2] py-3 bg-amber-500 hover:bg-amber-400 text-black rounded-xl font-bold text-lg shadow-lg flex items-center justify-center gap-2 transition-transform hover:scale-[1.02]">
                           <RefreshCw size={20} /> Try Again Now
                         </button>
                       </div>
                     </div>
                  </div>

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
                      onClick={() => setIsManualEditing(!isManualEditing)}
                      className="text-[11px] text-amber-500 hover:text-amber-400 font-semibold px-2 py-0.5 rounded hover:bg-amber-500/10 transition"
                    >
                      {isManualEditing ? "🎤 Voice View" : "✏️ Type / Edit"}
                    </button>
                    {isSessionActive && (
                      <button 
                        onClick={handleAnalyzeNow}
                        disabled={appState === "ANALYZING" || isTranscribing}
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
                onClick={toggleSession}
                className={cn(
                  "w-full py-4 rounded-xl font-black tracking-wider transition-all shadow-lg flex items-center justify-center gap-2 text-lg",
                  isSessionActive
                    ? "bg-red-600/10 text-red-500 hover:bg-red-600/20 border border-red-900/50"
                    : "bg-amber-500 text-black hover:bg-amber-400 hover:scale-[1.02]"
                )}
              >
                {isSessionActive ? <><Square size={20} fill="currentColor" /> END SESSION</> : <><Play size={20} fill="currentColor" /> START TRAINING</>}
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