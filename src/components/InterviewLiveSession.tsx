"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Mic, MicOff, Play, Square, RefreshCw, AlertCircle, Briefcase, Activity, BrainCircuit, ChevronRight, SkipForward, Volume2, VolumeX, Pause, CheckCircle, ChevronLeft, RotateCcw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getGuestId } from "@/lib/auth";
import { evaluateInterviewAnswer, InterviewEvaluation, transcribeAudio } from "@/app/interview/actions";
import Link from "next/link";
import { isMobileDevice } from "@/lib/utils";

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

type SessionState = "IDLE" | "ASKING" | "LISTENING" | "SPEAKING" | "ANALYZING" | "FEEDBACK";

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


export function InterviewLiveSession() {
    
  const [questions, setQuestions] = useState<string[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [followUpQuestion, setFollowUpQuestion] = useState<string | null>(null);

  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isInterviewComplete, setIsInterviewComplete] = useState(false);
    const [isMicOn, setIsMicOn] = useState(true);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [speechSupported, setSpeechSupported] = useState(true);
  
  const [isTTSMuted, setIsTTSMuted] = useState(false);
  const [shortResponseError, setShortResponseError] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isManualEditing, setIsManualEditing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);

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

  const [feedback, setFeedback] = useState<InterviewEvaluation | null>(null);

  
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [speakingTimeMs, setSpeakingTimeMs] = useState<number>(0);
  const [accumulatedFeedbacks, setAccumulatedFeedbacks] = useState<any[]>([]);
  const isSpeakingRef = useRef<boolean>(false);
  const lastSpeakTimeRef = useRef<number>(0);

  useEffect(() => {
    if (typeof window !== "undefined") {
      if (!window.SpeechRecognition && !window.webkitSpeechRecognition) {
        setSpeechSupported(false);
      }
    }
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem("interview_questions");
    if (stored) {
      try {
        setQuestions(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to parse interview questions");
      }
    }
  }, []);

  const setupAudioAnalysis = async (stream: MediaStream) => {
    try {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (analyserRef.current) {
        try { analyserRef.current.disconnect(); } catch (e) {}
        analyserRef.current = null;
      }

      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          audioContextRef.current = new AudioCtx();
        }
      }
      const ctx = audioContextRef.current;
      if (!ctx) return;

      if (ctx.state === "suspended") {
        await ctx.resume();
      }

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
        // Sensitive scale: silence < 3%, normal talk ~40-70%, loud talk 80-100%
        const volumeLevel = Math.min(100, Math.round(rms * 320));

        setAudioLevel(volumeLevel);

        const now = Date.now();
        if (volumeLevel > 8) {
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
          if (prev === "LISTENING" && volumeLevel > 8) return "SPEAKING";
          if (prev === "SPEAKING" && volumeLevel < 4 && !interimTranscript) return "LISTENING";
          return prev;
        });

        animationFrameRef.current = requestAnimationFrame(draw);
      };

      draw();
    } catch (e) {
      console.warn("setupAudioAnalysis error:", e);
    }
  };

  const cleanupAudioAnalysis = () => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (audioContextRef.current?.state !== 'closed') audioContextRef.current?.close();
    audioContextRef.current = null;
    analyserRef.current = null;
  };

  const startMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
      mediaStreamRef.current = stream;
      setMediaStream(stream);
      setMediaError(null);

      stream.getAudioTracks().forEach(t => t.enabled = isMicOn);

      await setupAudioAnalysis(stream);
      startRecording(stream);
    } catch (err: any) {
      console.error("Error accessing media devices.", err);
      setMediaError("Could not access microphone. Please check your browser permissions and allow microphone access.");
    }
  };

  const stopMedia = () => {
    stopRecording();
    const stream = mediaStreamRef.current || mediaStream;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      setMediaStream(null);
    }
    cleanupAudioAnalysis();
  };

  const toggleMic = () => {
    const newState = !isMicOn;
    setIsMicOn(newState);
    const stream = mediaStreamRef.current || mediaStream;
    if (stream) stream.getAudioTracks().forEach(t => t.enabled = newState);
    if (!newState) {
      stopSpeechRecognition();
    } else if (isSessionActive && !isPaused) {
      startSpeechRecognition();
    }
  };

  const currentQuestion = followUpQuestion || questions[currentQuestionIndex] || "";

  const replayQuestion = () => {
    if ('speechSynthesis' in window && currentQuestion && !isTTSMuted) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(currentQuestion);
      window.speechSynthesis.speak(utterance);
    }
  };

  const startRecording = useCallback((streamToUse?: MediaStream) => {
    const activeStream = streamToUse || mediaStreamRef.current || mediaStream;
    if (!activeStream) return;
    
    // Stop any existing active recorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {}
    }

    try {
      let mimeType = '';
      if (typeof MediaRecorder !== 'undefined') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          mimeType = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
          mimeType = 'audio/ogg';
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
          const finalMime = recorder.mimeType || mimeType || 'audio/webm';
          const audioBlob = new Blob(audioChunksRef.current, { type: finalMime });
          if (audioBlob.size > 0) {
            const url = URL.createObjectURL(audioBlob);
            setAudioUrl(url);
          }
        }
      };
      
      recorder.start(250);
      mediaRecorderRef.current = recorder;
    } catch (e) {
      console.error("Failed to start recording:", e);
    }
  }, [mediaStream]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        if (typeof mediaRecorderRef.current.requestData === "function" && mediaRecorderRef.current.state === "recording") {
          mediaRecorderRef.current.requestData();
        }
        mediaRecorderRef.current.stop();
      } catch (e) {
        console.error("Error stopping recorder", e);
      }
    }
  }, []);

  const triggerAnalysis = async (textToAnalyze: string) => {
    if (textToAnalyze.trim().length < 10) {
      setShortResponseError(true);
      setTimeout(() => setShortResponseError(false), 4000);
      return;
    }

    // Stop recording immediately so user's answer audio is finalized
    stopRecording();

    segmentBufferRef.current = "";
    setTranscriptParagraphs(prev => [...prev, textToAnalyze]);
    setTranscript("");
    setInterimTranscript("");

    setAppState("ANALYZING");
    try {
      const jd = localStorage.getItem("target_jd") || undefined;
      const result = await evaluateInterviewAnswer(currentQuestion, textToAnalyze, jd);
      if (result && 'serverError' in result) {
        setAppState("FEEDBACK");
        setFeedback({
          score: 0,
          critique: result.serverError as string,
          whatWasMissing: "Analysis Failed",
          betterExample: "Please try again later. Rate limits may apply.",
        });
      } else if (result) {
        setFeedback(result as InterviewEvaluation);
        
        setAccumulatedFeedbacks(prev => [...prev, {
          transcript: textToAnalyze,
          score: result.score,
          biggest_weakness: result.whatWasMissing,
          fix: result.critique,
          is_retry: false,
          retry_improvement: null,
          raw_feedback: result,
        }]);

        // Keep current question visible! Only prepare follow-up when user clicks Next Question
        setAppState("FEEDBACK");
      } else {
        setAppState("LISTENING");
      }
    } catch (error: any) {
      console.error("Analysis failed:", error);
      setAppState("LISTENING");
    }
  };

  const handleManualAnalyze = async () => {
    if (segmentTimeoutRef.current) {
      clearTimeout(segmentTimeoutRef.current);
      segmentTimeoutRef.current = null;
    }
    
    let textToAnalyze = segmentBufferRef.current.trim();
    if (!textToAnalyze || transcript.trim().length > textToAnalyze.length) {
      textToAnalyze = transcript.trim();
    }
    if (interimTranscript.trim()) {
      textToAnalyze = (textToAnalyze + " " + interimTranscript.trim()).trim();
    }

    // Flush recorder to finalize latest audio
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      try {
        if (typeof mediaRecorderRef.current.requestData === "function") {
          mediaRecorderRef.current.requestData();
        }
      } catch (e) {}
    }

    // Fallback: If Web Speech API captured nothing or <10 chars, transcribe voice audio via Gemini!
    if (textToAnalyze.length < 10 && audioChunksRef.current.length > 0) {
      setIsTranscribing(true);
      try {
        const mime = mediaRecorderRef.current?.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: mime });
        if (blob.size > 200) {
          const base64 = await blobToBase64(blob);
          if (base64) {
            const res = await transcribeAudio(base64, mime);
            if (res.transcript && res.transcript.trim().length >= 2) {
              textToAnalyze = res.transcript.trim();
              setTranscript(textToAnalyze);
              setTranscriptParagraphs(prev => [...prev, textToAnalyze]);
            }
          }
        }
      } catch (err) {
        console.error("Audio cloud transcription fallback error:", err);
      } finally {
        setIsTranscribing(false);
      }
    }

    if (textToAnalyze.length >= 10) {
      triggerAnalysis(textToAnalyze);
    } else {
      setShortResponseError(true);
      setTimeout(() => setShortResponseError(false), 3500);
    }
  };

  const latestState = useRef({ isMicOn, isSessionActive, appState, currentQuestion, triggerAnalysis, isPaused });
  useEffect(() => {
    latestState.current = { isMicOn, isSessionActive, appState, currentQuestion, triggerAnalysis, isPaused };
  }, [isMicOn, isSessionActive, appState, currentQuestion, triggerAnalysis, isPaused]);

  const speakingCheckRef = useRef<NodeJS.Timeout | null>(null);

  const startSpeechRecognition = useCallback(() => {
    if (typeof window === "undefined") return;

    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      setSpeechSupported(false);
      return;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.stop();
      } catch (e) {}
      recognitionRef.current = null;
    }

    try {
      const isMobile = isMobileDevice();
      const recognition = new SpeechRec();
      // On mobile, continuous = false prevents mic drops and aborts
      recognition.continuous = !isMobile;
      recognition.interimResults = true;
      recognition.lang = navigator.language || "en-US";

      recognition.onresult = (event: any) => {
        const { isMicOn, isPaused } = latestState.current;
        if (!isMicOn || isPaused) return;

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

        setTranscript(fullTranscript);
        segmentBufferRef.current = fullTranscript;
        setInterimTranscript(sessionInterim);

        if (sessionInterim || cleanSessionFinal) {
          setAppState("SPEAKING");
          if (speakingCheckRef.current) clearTimeout(speakingCheckRef.current);
          speakingCheckRef.current = setTimeout(() => {
            setAppState(prev => prev === "SPEAKING" ? "LISTENING" : prev);
          }, 1500);
        }
      };

      recognition.onstart = () => {
        isRecognitionRunningRef.current = true;
      };

      recognition.onerror = (e: any) => {
        console.warn("Interview speech recognition error:", e?.error);
        if (e?.error === 'not-allowed') {
          setMediaError("Microphone access was denied. Please allow microphone permissions in your mobile browser settings.");
        }
      };

      recognition.onend = () => {
        isRecognitionRunningRef.current = false;
        // Lock in transcript from this cycle so it is preserved across auto-restarts without duplicating
        if (segmentBufferRef.current) {
          finalizedPrefixRef.current = segmentBufferRef.current;
        }
        // ONLY auto-restart on desktop Chrome; mobile should never loop restart to avoid mic on/off flickering
        if (!isMobileDevice()) {
          const { isSessionActive, isMicOn, isPaused, appState } = latestState.current;
          if (isSessionActive && isMicOn && !isPaused && appState !== "ANALYZING" && appState !== "FEEDBACK") {
            setTimeout(() => {
              if (latestState.current.isSessionActive && !isRecognitionRunningRef.current) {
                startSpeechRecognition();
              }
            }, 300);
          }
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch (e) {
      console.warn("Speech recognition failed to start:", e);
    }
  }, []);

  const stopSpeechRecognition = useCallback(() => {
    isRecognitionRunningRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.stop();
      } catch (e) {}
      recognitionRef.current = null;
    }
    setInterimTranscript("");
  }, []);

  useEffect(() => {
    return () => {
      stopSpeechRecognition();
      if (segmentTimeoutRef.current) clearTimeout(segmentTimeoutRef.current);
      if (speakingCheckRef.current) clearTimeout(speakingCheckRef.current);
    };
  }, [stopSpeechRecognition]);

  useEffect(() => {
    if (isSessionActive && currentQuestion && 'speechSynthesis' in window && !isTTSMuted) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(currentQuestion);
      setAppState("ASKING");
      stopSpeechRecognition();
      utterance.onend = () => {
        setAppState("LISTENING");
        if (latestState.current.isSessionActive && latestState.current.isMicOn && !latestState.current.isPaused) {
          startSpeechRecognition();
        }
      };
      utterance.onerror = () => {
        setAppState("LISTENING");
        if (latestState.current.isSessionActive && latestState.current.isMicOn && !latestState.current.isPaused) {
          startSpeechRecognition();
        }
      };
      window.speechSynthesis.speak(utterance);
    }
  }, [currentQuestion, isSessionActive, isTTSMuted, stopSpeechRecognition, startSpeechRecognition]);

  const saveSessionToDb = async () => {
    if (!sessionStartTime) return;
    const duration = Date.now() - sessionStartTime;
    const scoredFeedbacks = accumulatedFeedbacks.filter(f => f.score > 0);
    const overallScore = scoredFeedbacks.length > 0
      ? Math.round(scoredFeedbacks.reduce((acc, f) => acc + f.score, 0) / scoredFeedbacks.length)
      : null;

    try {
      const { data: sessionData, error: sessionError } = await supabase
        .from('sessions')
        .insert({
          mode: 'interview',
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
          const validBLScores = accumulatedFeedbacks.filter(f => typeof f.body_language_score === 'number').map(f => f.body_language_score);
          if (validBLScores.length > 0) {
            const avgBLScore = Math.round(validBLScores.reduce((a,b)=>a+b,0) / validBLScores.length);
            dimensions.push({ dimension: "Body Language", score: avgBLScore });
          }

          const dimensionInserts = dimensions.map((d: any) => ({
            session_id: sessionData.id,
            dimension: d.dimension,
            score: d.score
          }));
          await supabase.from('session_dimensions').insert(dimensionInserts);
        }
      }
    } catch (err) {
      console.error("Failed to save interview session to Supabase:", err);
    }
  };

  const toggleSession = async () => {
    if (!isSessionActive) {
      setIsSessionActive(true);
      setIsInterviewComplete(false);
      setSessionStartTime(Date.now());
      setSpeakingTimeMs(0);
      setAccumulatedFeedbacks([]);
      setAppState("LISTENING");
      finalizedPrefixRef.current = "";
      segmentBufferRef.current = "";
      setTranscriptParagraphs([]);
      setTranscript("");
      setFeedback(null);
      setCurrentQuestionIndex(0);
      setFollowUpQuestion(null);

      // Request microphone access & setup audio analysis
      await startMedia();

      // Start speech recognition
      startSpeechRecognition();
    } else {
      saveSessionToDb();
      stopMedia();
      stopSpeechRecognition();
      if (segmentTimeoutRef.current) clearTimeout(segmentTimeoutRef.current);
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      
      setIsSessionActive(false);
      setAppState("IDLE");
      setAudioLevel(0);
    }
  };

  const handleRetryQuestion = () => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    stopRecording();
    finalizedPrefixRef.current = "";
    setTranscriptParagraphs([]);
    setTranscript("");
    setInterimTranscript("");
    segmentBufferRef.current = "";
    setFeedback(null);
    setAudioUrl(null);
    setAppState("LISTENING");
    startSpeechRecognition();
    const stream = mediaStreamRef.current || mediaStream;
    if (stream && !isMobileDevice()) {
      setTimeout(() => {
        startRecording(stream);
      }, 100);
    }
  };

  const handlePreviousQuestion = () => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    stopRecording();
    if (followUpQuestion) {
      setFollowUpQuestion(null);
    } else if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
    }
    setTranscriptParagraphs([]);
    setTranscript("");
    setInterimTranscript("");
    segmentBufferRef.current = "";
    setFeedback(null);
    setAudioUrl(null);
    setAppState("LISTENING");
    startSpeechRecognition();
    const stream = mediaStreamRef.current || mediaStream;
    if (stream && !isMobileDevice()) {
      setTimeout(() => {
        startRecording(stream);
      }, 100);
    }
  };

  const handleNextQuestion = () => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    stopRecording();
    setAudioUrl(null);
    
    if (feedback?.followUpQuestion && !followUpQuestion) {
       setFollowUpQuestion(feedback.followUpQuestion);
    } else {
       setFollowUpQuestion(null);
       if (currentQuestionIndex < questions.length - 1) {
         setCurrentQuestionIndex(prev => prev + 1);
       } else {
         // Complete the interview
         setIsInterviewComplete(true);
         saveSessionToDb();
         stopMedia();
         stopSpeechRecognition();
         if (segmentTimeoutRef.current) clearTimeout(segmentTimeoutRef.current);
         setIsSessionActive(false);
         setAppState("IDLE");
         setAudioLevel(0);
         return;
       }
    }
    
    setTranscriptParagraphs([]);
    setTranscript("");
    setInterimTranscript("");
    segmentBufferRef.current = "";
    setFeedback(null);
    setAppState("LISTENING");
    startSpeechRecognition();
    const stream = mediaStreamRef.current || mediaStream;
    if (stream && !isMobileDevice()) {
      setTimeout(() => {
        startRecording(stream);
      }, 100);
    }
  };

  const handleSkipQuestion = () => {
    handleNextQuestion();
  };

  const togglePause = () => {
    setIsPaused(prev => {
      const newState = !prev;
      if (newState) {
        if (segmentTimeoutRef.current) clearTimeout(segmentTimeoutRef.current);
        stopSpeechRecognition();
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
          try { mediaRecorderRef.current.pause(); } catch(e) {}
        }
      } else {
        if (isSessionActive && isMicOn) {
          startSpeechRecognition();
        }
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "paused") {
          try { mediaRecorderRef.current.resume(); } catch(e) {}
        }
      }
      return newState;
    });
  };

  const startOver = () => {
    setIsInterviewComplete(false);
    setCurrentQuestionIndex(0);
    setFollowUpQuestion(null);
    setAccumulatedFeedbacks([]);
    toggleSession();
  };

  useEffect(() => {
    return () => {
      stopMedia();
      if (recognitionRef.current) recognitionRef.current.stop();
      if (segmentTimeoutRef.current) clearTimeout(segmentTimeoutRef.current);
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    };
  }, []);

  useEffect(() => {
  }, [isSessionActive]);

  if (isInterviewComplete) {
    const scoredFeedbacks = accumulatedFeedbacks.filter(f => f.score > 0);
    const overallScore = scoredFeedbacks.length > 0
      ? Math.round(scoredFeedbacks.reduce((acc, f) => acc + f.score, 0) / scoredFeedbacks.length)
      : 0;
      
    let bestScore = 0;
    let worstScore = 100;
    
    scoredFeedbacks.forEach(f => {
      if (f.score > bestScore) bestScore = f.score;
      if (f.score < worstScore) worstScore = f.score;
    });
    if (scoredFeedbacks.length === 0) {
      bestScore = 0;
      worstScore = 0;
    }

    return (
      <div className="flex flex-col h-full min-h-[calc(100vh-4rem)] p-4 max-w-[1600px] mx-auto bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-200 justify-center items-center">
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-10 max-w-2xl w-full shadow-lg text-center">
          <h1 className="text-4xl font-bold mb-2">🎉 Interview Complete!</h1>
          <p className="text-gray-500 mb-8">Great job finishing the session.</p>
          
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="bg-gray-50 dark:bg-gray-950 p-6 rounded-xl border border-gray-100 dark:border-gray-800 flex flex-col items-center">
              <span className="text-gray-500 font-medium mb-1">Overall Score</span>
              <span className="text-4xl font-bold text-blue-500">{overallScore}/100</span>
            </div>
            <div className="bg-gray-50 dark:bg-gray-950 p-6 rounded-xl border border-gray-100 dark:border-gray-800 flex flex-col items-center">
              <span className="text-gray-500 font-medium mb-1">Questions Answered</span>
              <span className="text-4xl font-bold">{accumulatedFeedbacks.length}</span>
            </div>
          </div>
          
          {scoredFeedbacks.length > 0 && (
            <div className="bg-gray-50 dark:bg-gray-950 rounded-xl border border-gray-100 dark:border-gray-800 p-4 mb-8 text-sm flex justify-around">
              <div>
                <span className="text-gray-500 mr-2">Best Answer:</span>
                <span className="font-bold text-green-500">{bestScore}/100</span>
              </div>
              <div>
                <span className="text-gray-500 mr-2">Weakest Answer:</span>
                <span className="font-bold text-red-500">{worstScore}/100</span>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <Link href="/insights" className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition">
              View Detailed Insights
            </Link>
            <button onClick={startOver} className="w-full py-3 bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl font-bold hover:bg-gray-300 dark:hover:bg-gray-700 transition">
              Practice Again
            </button>
            <Link href="/interview" className="w-full py-3 text-blue-600 dark:text-blue-400 font-medium hover:underline">
              Try New Questions
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-[calc(100vh-4rem)] p-4 max-w-[1600px] mx-auto space-y-4 bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-200">
      
      {!speechSupported && (
        <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-200 p-4 rounded-xl flex items-start gap-3">
          <AlertCircle className="shrink-0 mt-0.5" size={20} />
          <div>
            <h3 className="font-bold">Browser Not Supported</h3>
            <p className="text-sm">Speech recognition is not fully supported in your browser. Please use Google Chrome or Microsoft Edge for the best experience.</p>
          </div>
        </div>
      )}

      {mediaError && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-8 rounded-2xl max-w-md w-full shadow-2xl text-center">
            <AlertCircle size={48} className="mx-auto text-red-500 mb-4" />
            <h3 className="text-xl font-bold mb-2">Permissions Error</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-6">{mediaError}</p>
            <button onClick={() => setMediaError(null)} className="px-6 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg font-bold">
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-sm relative">
        {shortResponseError && (
          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-amber-100 text-amber-800 px-4 py-2 rounded-lg text-sm font-bold shadow-lg z-50 animate-in fade-in slide-in-from-top-2">
            Response too short to analyze. Please elaborate.
          </div>
        )}
        <div className="flex items-center gap-3">
          <Briefcase className="text-blue-500" />
          <h1 className="text-xl font-bold">Interview Coach</h1>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsTTSMuted(!isTTSMuted)}
            className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition"
            title={isTTSMuted ? "Unmute Voice" : "Mute Voice"}
          >
            {isTTSMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </button>
          <button
            onClick={toggleSession}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold transition-all ${
              isSessionActive 
              ? "bg-red-500 hover:bg-red-600 text-white shadow-red-500/20" 
              : "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20"
            }`}
          >
            {isSessionActive ? (
              <><Square size={18} /> End Interview</>
            ) : (
              <><Play size={18} /> Start Interview</>
            )}
          </button>
        </div>
      </div>

      {isSessionActive && (
        <div className="flex gap-4 h-[75vh]">
          {/* Main Content Area */}
          <div className="flex flex-col w-2/3 gap-4">
             {/* Question Card */}
             <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-6 shadow-sm relative">
                <p className="text-sm font-semibold text-blue-600 dark:text-blue-400 mb-2 uppercase tracking-wide">
                  {followUpQuestion ? "Follow-Up Question" : `Question ${currentQuestionIndex + 1} of ${questions.length}`}
                </p>
                <div className="flex justify-between items-start gap-4">
                  <h2 className="text-2xl font-bold flex-1">{currentQuestion}</h2>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button 
                      onClick={handlePreviousQuestion}
                      disabled={currentQuestionIndex === 0 && !followUpQuestion}
                      className="p-2 bg-blue-100 dark:bg-blue-800/50 text-blue-600 dark:text-blue-300 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-800 disabled:opacity-30 disabled:cursor-not-allowed transition"
                      title="Previous Question"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <button 
                      onClick={handleNextQuestion}
                      className="p-2 bg-blue-100 dark:bg-blue-800/50 text-blue-600 dark:text-blue-300 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-800 transition"
                      title="Skip to Next Question"
                    >
                      <ChevronRight size={18} />
                    </button>
                    <button 
                      onClick={replayQuestion} 
                      className="p-2 bg-blue-100 dark:bg-blue-800/50 text-blue-600 dark:text-blue-300 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-800 transition" 
                      title="Replay Question Audio"
                    >
                      <Volume2 size={18} />
                    </button>
                  </div>
                </div>
             </div>

             {/* Candidate Speech & Transcript */}
             <div className="flex-1 flex flex-col gap-4">
                <div className="flex-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 flex flex-col shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                        <Activity className={`${appState === "LISTENING" || appState === "SPEAKING" ? "text-green-500 animate-pulse" : "text-gray-400"}`} size={20} />
                        <h3 className="font-bold text-base">Your Spoken Answer</h3>

                        {/* Live Voice Input Level Meter */}
                        {isSessionActive && (
                          <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 ml-1">
                            <Mic size={14} className={audioLevel > 5 ? "text-green-500 animate-pulse" : "text-gray-400"} />
                            <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">Voice:</span>
                            <div className="w-16 sm:w-20 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                              <div 
                                className={`h-full transition-all duration-75 ${
                                  audioLevel > 60 
                                    ? "bg-gradient-to-r from-green-500 to-amber-500" 
                                    : "bg-green-500"
                                }`}
                                style={{ width: `${isMicOn ? Math.min(100, Math.max(audioLevel, 0)) : 0}%` }}
                              />
                            </div>
                            <span className="text-xs font-mono font-bold text-gray-700 dark:text-gray-200 min-w-[28px]">
                              {Math.round(isMicOn ? audioLevel : 0)}%
                            </span>
                          </div>
                        )}

                        <button 
                          type="button"
                          onClick={() => setIsManualEditing(!isManualEditing)}
                          className="text-xs text-blue-500 hover:text-blue-400 font-medium ml-auto px-2 py-1 rounded-lg hover:bg-blue-500/10 transition"
                        >
                          {isManualEditing ? "🎤 Voice Mode" : "✏️ Type / Edit"}
                        </button>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950 rounded-xl p-4 border border-gray-100 dark:border-gray-800 min-h-[200px] flex flex-col">
                        {isManualEditing ? (
                          <textarea
                            value={transcript}
                            onChange={(e) => {
                              setTranscript(e.target.value);
                              segmentBufferRef.current = e.target.value;
                            }}
                            placeholder="Type or edit your answer here..."
                            className="w-full flex-1 min-h-[160px] bg-transparent text-gray-800 dark:text-gray-100 placeholder-gray-400 text-base outline-none resize-none"
                          />
                        ) : (
                          <>
                            {transcriptParagraphs.map((p, i) => (
                              <p key={i} className="text-gray-800 dark:text-gray-200 leading-relaxed mb-2">{p}</p>
                            ))}
                            {transcript || interimTranscript ? (
                            <p className="text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap text-base">
                                {transcript}
                                <span className="text-blue-500 dark:text-blue-400 italic"> {interimTranscript}</span>
                            </p>
                            ) : transcriptParagraphs.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-gray-400 italic text-sm gap-3 my-auto py-8 text-center px-4">
                                {isSessionActive ? (
                                  <>
                                    <div className="flex items-center gap-2 text-red-500 font-semibold text-xs bg-red-500/10 px-3 py-1.5 rounded-full border border-red-500/20">
                                      <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping inline-block" />
                                      <span>Recording your voice... Speak your answer.</span>
                                    </div>
                                    <span className="text-xs text-gray-500 dark:text-gray-400 max-w-xs">
                                      Watch the voice meter above as you speak, then tap &ldquo;Done Speaking &mdash; Analyze My Answer&rdquo; below.
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <Mic size={24} className="text-blue-500/50 animate-bounce" />
                                    <span>Tap &ldquo;Start Interview&rdquo; above to begin speaking.</span>
                                  </>
                                )}
                            </div>
                            ) : null}
                          </>
                        )}
                    </div>

                    {/* Audio Playback if available */}
                    {audioUrl && (
                      <div className="mt-3 flex items-center gap-3 bg-gray-100 dark:bg-gray-800 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700">
                        <span className="text-xs text-blue-500 font-bold shrink-0 uppercase tracking-wider">Answer Audio:</span>
                        <audio key={audioUrl} controls src={audioUrl} className="w-full h-8" />
                      </div>
                    )}

                    {/* Bottom Action Controls */}
                    <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                      {/* Big Prominent Analyze Button */}
                      <button 
                        onClick={handleManualAnalyze}
                        disabled={appState === "ANALYZING" || isTranscribing || !isSessionActive}
                        className={`flex-[3] py-3.5 px-6 rounded-xl font-bold flex items-center justify-center gap-2 text-base transition-all shadow-md ${
                          appState === "ANALYZING" || isTranscribing
                            ? "bg-purple-600 text-white animate-pulse cursor-wait"
                            : isSessionActive
                              ? "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/30 scale-[1.01] cursor-pointer"
                              : "bg-gray-200 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed border border-gray-300 dark:border-gray-700"
                        }`}
                      >
                        <CheckCircle size={20} />
                        <span>
                          {isTranscribing 
                            ? "Transcribing Voice with AI..." 
                            : appState === "ANALYZING" 
                              ? "Evaluating Answer..." 
                              : "Done Speaking — Analyze My Answer"}
                        </span>
                      </button>

                      <div className="flex items-center gap-2 flex-1">
                        {/* Clear / Retry Button */}
                        <button 
                          onClick={handleRetryQuestion}
                          disabled={!transcript && !interimTranscript && appState !== "FEEDBACK"}
                          className="py-3.5 px-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl font-semibold text-sm flex items-center justify-center gap-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 transition border border-gray-200 dark:border-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
                          title="Reset answer and try again"
                        >
                          <RotateCcw size={16} /> Retry
                        </button>

                        <button 
                          onClick={toggleMic} 
                          className={`flex-1 py-3.5 px-3 rounded-xl flex items-center justify-center gap-1.5 font-semibold text-sm transition ${
                            isMicOn 
                              ? "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700" 
                              : "bg-red-500/10 text-red-500 border border-red-500/20"
                          }`}
                        >
                          {isMicOn ? <><Mic size={16} /> Mic</> : <><MicOff size={16} /> Muted</>}
                        </button>

                        <button 
                          onClick={handleSkipQuestion} 
                          className="py-3.5 px-3 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-xl font-semibold text-sm flex items-center justify-center gap-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 transition border border-gray-200 dark:border-gray-700"
                          title="Skip this question"
                        >
                          <SkipForward size={16} /> Skip
                        </button>
                      </div>
                    </div>
                </div>
             </div>
          </div>

          {/* AI Coach Feedback Panel */}
          <div className="w-1/3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 flex flex-col shadow-sm">
             <div className="flex items-center gap-2 mb-6 pb-4 border-b border-gray-100 dark:border-gray-800">
                <BrainCircuit className="text-purple-500" />
                <h3 className="text-lg font-bold">Coach Feedback</h3>
             </div>

             {appState === "FEEDBACK" && feedback ? (
               <div className="flex-1 overflow-y-auto space-y-6">
                 <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-600 dark:text-gray-400">Score</span>
                    <span className={`text-2xl font-bold ${feedback.score >= 80 ? "text-green-500" : feedback.score >= 60 ? "text-yellow-500" : "text-red-500"}`}>
                        {feedback.score}/100
                    </span>
                 </div>

                 <div className="space-y-2">
                    <h4 className="font-semibold text-red-500 flex items-center gap-2">Critique</h4>
                    <p className="text-sm bg-red-50 dark:bg-red-900/10 p-3 rounded-lg border border-red-100 dark:border-red-900/30 text-gray-800 dark:text-gray-300">
                        {feedback.critique}
                    </p>
                 </div>

                 <div className="space-y-2">
                    <h4 className="font-semibold text-amber-500 flex items-center gap-2">What Was Missing</h4>
                    <p className="text-sm bg-amber-50 dark:bg-amber-900/10 p-3 rounded-lg border border-amber-100 dark:border-amber-900/30 text-gray-800 dark:text-gray-300">
                        {feedback.whatWasMissing}
                    </p>
                 </div>

                 <div className="space-y-2">
                    <h4 className="font-semibold text-green-500 flex items-center gap-2">Better Approach</h4>
                    <p className="text-sm bg-green-50 dark:bg-green-900/10 p-3 rounded-lg border border-green-100 dark:border-green-900/30 text-gray-800 dark:text-gray-300">
                        {feedback.betterExample}
                    </p>
                 </div>

                 {audioUrl && (
                    <div className="space-y-2">
                       <h4 className="font-semibold text-blue-500 flex items-center gap-2">Your Answer Recording</h4>
                       <div className="p-3 bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-100 dark:border-blue-900/30">
                          <audio key={audioUrl} controls src={audioUrl} className="w-full h-10 outline-none" />
                       </div>
                    </div>
                 )}
                 
                 <div className="mt-4 flex flex-col gap-2">
                   <button
                     onClick={handleNextQuestion}
                     className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors shadow-md"
                   >
                     {feedback?.followUpQuestion && !followUpQuestion ? "Answer Follow-up Question" : "Next Question"} <ChevronRight size={18} />
                   </button>
                   <div className="flex gap-2">
                     <button
                       onClick={handleRetryQuestion}
                       className="flex-1 py-2.5 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition"
                       title="Retry this question to improve your score"
                     >
                       <RotateCcw size={16} /> Retry Question
                     </button>
                     <button
                       onClick={handlePreviousQuestion}
                       disabled={currentQuestionIndex === 0 && !followUpQuestion}
                       className="flex-1 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
                       title="Go back to previous question"
                     >
                       <ChevronLeft size={16} /> Previous
                     </button>
                   </div>
                 </div>
               </div>
             ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6 opacity-60">
                   <BrainCircuit size={48} className="mb-4 text-gray-300 dark:text-gray-700" />
                   <p className="text-sm font-medium">
                     {appState === "ANALYZING" ? "Evaluating your answer..." : "Answer the question. The coach will evaluate when you finish speaking."}
                   </p>
                </div>
             )}
          </div>
        </div>
      )}

      {!isSessionActive && (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-12 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-sm">
            <Briefcase size={64} className="text-blue-500 mb-6" />
            <h2 className="text-3xl font-bold mb-4">Ready for your Interview?</h2>
            <p className="text-gray-500 max-w-lg mb-8">
              Click Start Interview above. The AI Coach will ask you {questions.length > 0 ? questions.length : "targeted"} questions, evaluate your responses using the STAR method, and provide actionable feedback.
            </p>
          </div>
      )}
    </div>
  );
}
