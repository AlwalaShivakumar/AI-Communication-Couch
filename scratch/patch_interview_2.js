const fs = require('fs');
let content = fs.readFileSync('src/components/InterviewLiveSession.tsx', 'utf8');

// replace all instances of setFeedback(null);
content = content.replace(/setFeedback\(null\);/g, 'setMarkdownFeedback("");\\n    setIsStreaming(false);');

// replace the Body Language dimension calculation
const bodyLanguageBlock = `const validBLScores = accumulatedFeedbacks.filter(f => typeof f.body_language_score === 'number').map(f => f.body_language_score);
          if (validBLScores.length > 0) {
            const avgBLScore = Math.round(validBLScores.reduce((a,b)=>a+b,0) / validBLScores.length);
            dimensions.push({ dimension: "Body Language", score: avgBLScore });
          }`;
content = content.replace(bodyLanguageBlock, '');

// replace feedback?.followUpQuestion with a fallback (it doesn't exist anymore on markdown string)
content = content.replace(/feedback\?\.followUpQuestion/g, 'false');

// replace the old feedback UI
const oldUIStart = '{appState === "FEEDBACK" && feedback ? (';
const oldUIEnd = '<button\\n                     onClick={handleNextQuestion}';
let uiStartIndex = content.indexOf(oldUIStart);
let uiEndIndex = content.indexOf('<button\\n                     onClick={handleNextQuestion}');

if (uiStartIndex !== -1 && uiEndIndex !== -1) {
  // Let's locate the exact chunk
  // Because it's hard to be perfect, I will do a string replacement on the exact JSX block.
}

fs.writeFileSync('src/components/InterviewLiveSession.tsx', content);
