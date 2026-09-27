const fs = require('fs');
let content = fs.readFileSync('src/components/InterviewLiveSession.tsx', 'utf8');

// 1. imports
content = content.replace(
  'import { evaluateInterviewAnswer, InterviewEvaluation, transcribeAudio } from "@/app/interview/actions";',
  'import { transcribeAudio } from "@/app/interview/actions";\nimport ReactMarkdown from "react-markdown";'
);
content = content.replace(
  'import { InterviewEvaluation }',
  ''
);

// 2. state
content = content.replace(
  'const [feedback, setFeedback] = useState<InterviewEvaluation | null>(null);',
  'const [markdownFeedback, setMarkdownFeedback] = useState<string>("");\n  const [isStreaming, setIsStreaming] = useState(false);'
);

// 3. triggerAnalysis
const oldTriggerAnalysisStart = 'const triggerAnalysis = async (textToAnalyze: string) => {';
const oldTriggerAnalysisEnd = '  const handleManualAnalyze = async () => {';
let startIndex = content.indexOf(oldTriggerAnalysisStart);
let endIndex = content.indexOf(oldTriggerAnalysisEnd);

if (startIndex !== -1 && endIndex !== -1) {
  const newTriggerAnalysis = `const triggerAnalysis = async (textToAnalyze: string) => {
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

    setAppState("FEEDBACK");
    setMarkdownFeedback("");
    setIsStreaming(true);

    try {
      const jd = localStorage.getItem("target_jd") || undefined;
      const response = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: currentQuestion, answer: textToAnalyze, contextJd: jd })
      });

      if (!response.ok || !response.body) {
        throw new Error("Failed to stream evaluation from AI Coach.");
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
      setAppState("LISTENING");
      setIsStreaming(false);
    }
  };

`;
  content = content.substring(0, startIndex) + newTriggerAnalysis + content.substring(endIndex);
}

// 4. Reset states for handleRetryQuestion and handleNextQuestion
content = content.replace(
  'setFeedback(null);',
  'setMarkdownFeedback("");\n    setIsStreaming(false);'
);
content = content.replace(
  'setFeedback(null);',
  'setMarkdownFeedback("");\n    setIsStreaming(false);'
);

// 5. Update UI
const oldUIStart = '{appState === "FEEDBACK" && feedback ? (';
const oldUIEnd = '                   <button';
let uiStartIndex = content.indexOf(oldUIStart);
let uiEndIndex = content.indexOf(oldUIEnd);

if (uiStartIndex !== -1 && uiEndIndex !== -1) {
  const newUI = `{appState === "FEEDBACK" && (markdownFeedback || isStreaming) ? (
               <div className="flex-1 overflow-y-auto space-y-6">
                 
                 <div className="prose prose-sm dark:prose-invert prose-blue max-w-none text-gray-800 dark:text-gray-200">
                    <ReactMarkdown>{markdownFeedback}</ReactMarkdown>
                    {isStreaming && (
                      <span className="inline-block w-2 h-4 bg-blue-500 animate-pulse ml-1 align-middle"></span>
                    )}
                 </div>

                 {audioUrl && (
                    <div className="space-y-2 mt-4">
                       <h4 className="font-semibold text-blue-500 flex items-center gap-2">Your Answer Recording</h4>
                       <div className="p-3 bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-100 dark:border-blue-900/30">
                          <audio key={audioUrl} controls src={audioUrl} className="w-full h-10 outline-none" />
                       </div>
                    </div>
                 )}
                 
                 <div className="mt-4 flex flex-col gap-2">
                   {!isStreaming && (
`;
  // Let's accurately replace the UI block while preserving the buttons at the bottom.
  // I will just locate the old UI block by string search.
}

content = content.replace(
  'const validBLScores = accumulatedFeedbacks.filter(f => typeof f.body_language_score === \\'number\\').map(f => f.body_language_score);\n          if (validBLScores.length > 0) {\n            const avgBLScore = Math.round(validBLScores.reduce((a,b)=>a+b,0) / validBLScores.length);\n            dimensions.push({ dimension: "Body Language", score: avgBLScore });\n          }',
  ''
);


fs.writeFileSync('src/components/InterviewLiveSession.tsx', content);
console.log('InterviewLiveSession.tsx phase 1 patched.');
