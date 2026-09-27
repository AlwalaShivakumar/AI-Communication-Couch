const fs = require('fs');

let content = fs.readFileSync('src/components/LiveSession.tsx', 'utf8');

// 1. Add react-markdown import
content = content.replace(
  'import { useSearchParams } from "next/navigation";',
  'import { useSearchParams } from "next/navigation";\nimport ReactMarkdown from "react-markdown";'
);

// 2. Change state variables
content = content.replace(
  'const [feedback, setFeedback] = useState<CoachingFeedback | null>(null);',
  'const [markdownFeedback, setMarkdownFeedback] = useState<string>("");'
);
content = content.replace(
  'const [analysisError, setAnalysisError] = useState<string | null>(null);',
  'const [analysisError, setAnalysisError] = useState<string | null>(null);\n  const [isStreaming, setIsStreaming] = useState(false);'
);

// 3. Update triggerAnalysis function
const triggerAnalysisOld = `
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
`;

const triggerAnalysisNew = `
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

    setAppState("COACHING");
    setAnalysisError(null);
    setMarkdownFeedback("");
    setIsStreaming(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id || undefined;
      const jd = localStorage.getItem("target_jd") || undefined;

      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segmentText: textToAnalyze, mode: selectedMode, contextJd: jd, userId })
      });

      if (!response.ok || !response.body) {
        throw new Error("Failed to stream feedback from AI Coach.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let fullFeedback = "";

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        const chunkValue = decoder.decode(value, { stream: true });
        fullFeedback += chunkValue;
        setMarkdownFeedback(prev => prev + chunkValue);
      }
      setIsStreaming(false);
      setPreviousAttempt(textToAnalyze);

      setAccumulatedFeedbacks(prev => [...prev, {
        transcript: textToAnalyze,
        score: 0,
        biggest_weakness: "Streaming Feedback",
        fix: "See details",
        is_retry: false,
        retry_improvement: null,
        raw_feedback: fullFeedback,
      }]);

    } catch (error: any) {
      console.error("Analysis failed:", error);
      setAnalysisError(error.message || "Failed to analyze response");
      setIsStreaming(false);
    }
  };
`;

content = content.replace(triggerAnalysisOld.trim(), triggerAnalysisNew.trim());

// 4. Also update resetSessionState to clear markdownFeedback
content = content.replace(
  'setFeedback(null);',
  'setMarkdownFeedback("");\n    setIsStreaming(false);'
);

// 5. Update the UI rendering to render Markdown instead of the complex feedback panels
// I'll use a regex replacement to grab the old UI block.
const oldUI = \`
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
\`;
const oldUINormalized = oldUI.trim();
const newUI = \`
              {/* ChatGPT-style Streaming Feedback UI */}
              {(markdownFeedback || isStreaming) && !comparison && appState === "COACHING" && (
                <div className="flex flex-col gap-6 animate-in fade-in">
                  <div className="prose prose-invert prose-amber max-w-none">
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
\`;

let oldUIIndex = content.indexOf('{/* Complex Feedback UI */}');
if(oldUIIndex !== -1) {
  let endOfOldUI = content.indexOf('{/* Live Transcript docked to bottom of AI panel */}');
  let before = content.substring(0, oldUIIndex);
  let after = content.substring(endOfOldUI);
  content = before + newUI + '\\n              ' + after;
}

// 6. Fix "Awaiting Speech" condition so it doesn't show when streaming
content = content.replace(
  '{!feedback && !comparison && appState !== "ANALYZING" && (',
  '{!markdownFeedback && !comparison && !isStreaming && appState !== "ANALYZING" && appState !== "COACHING" && ('
);

fs.writeFileSync('src/components/LiveSession.tsx', content);
console.log('LiveSession.tsx patched successfully.');
