const fs = require('fs');
let content = fs.readFileSync('src/components/LiveSession.tsx', 'utf8');

// 1. imports
content = content.replace(
  'import { useSearchParams } from "next/navigation";',
  'import { useSearchParams } from "next/navigation";\nimport ReactMarkdown from "react-markdown";'
);

// 2. state
content = content.replace(
  'const [feedback, setFeedback] = useState<CoachingFeedback | null>(null);',
  'const [markdownFeedback, setMarkdownFeedback] = useState<string>("");'
);
content = content.replace(
  'const [analysisError, setAnalysisError] = useState<string | null>(null);',
  'const [analysisError, setAnalysisError] = useState<string | null>(null);\n  const [isStreaming, setIsStreaming] = useState(false);'
);

// 3. triggerAnalysis
const oldTriggerAnalysisStart = 'const triggerAnalysis = async (textToAnalyze: string) => {';
const oldTriggerAnalysisEnd = '  const latestState = useRef({ isMicOn, isSessionActive, isPaused, triggerAnalysis, startRecording });';
let startIndex = content.indexOf(oldTriggerAnalysisStart);
let endIndex = content.indexOf(oldTriggerAnalysisEnd);

if (startIndex !== -1 && endIndex !== -1) {
  const newTriggerAnalysis = `const triggerAnalysis = async (textToAnalyze: string) => {
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
        if (value) {
          const chunkValue = decoder.decode(value, { stream: true });
          fullFeedback += chunkValue;
          setMarkdownFeedback(prev => prev + chunkValue);
        }
      }
      setIsStreaming(false);
      setPreviousAttempt(textToAnalyze);

    } catch (error: any) {
      console.error("Analysis failed:", error);
      setAnalysisError(error.message || "Failed to analyze response");
      setIsStreaming(false);
    }
  };

`;
  content = content.substring(0, startIndex) + newTriggerAnalysis + content.substring(endIndex);
}

// 4. resetSessionState
content = content.replace('setFeedback(null);', 'setMarkdownFeedback("");\\n    setIsStreaming(false);');

// 5. Update UI
const oldUIStart = '{/* Complex Feedback UI */}';
const oldUIEnd = '{/* Live Transcript docked to bottom of AI panel */}';
let uiStartIndex = content.indexOf(oldUIStart);
let uiEndIndex = content.indexOf(oldUIEnd);

if (uiStartIndex !== -1 && uiEndIndex !== -1) {
  const newUI = `{/* ChatGPT-style Streaming Feedback UI */}
              {(markdownFeedback || isStreaming) && !comparison && appState === "COACHING" && (
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

              `;
  content = content.substring(0, uiStartIndex) + newUI + content.substring(uiEndIndex);
}

// 6. Fix "Awaiting Speech"
content = content.replace(
  '{!feedback && !comparison && appState !== "ANALYZING" && (',
  '{!markdownFeedback && !comparison && !isStreaming && appState !== "ANALYZING" && appState !== "COACHING" && ('
);

fs.writeFileSync('src/components/LiveSession.tsx', content);
console.log('LiveSession.tsx patched successfully.');
