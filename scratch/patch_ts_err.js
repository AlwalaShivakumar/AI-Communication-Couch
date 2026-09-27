const fs = require('fs');
let c = fs.readFileSync('src/components/InterviewLiveSession.tsx', 'utf8');
c = c.replace(/setFeedback\(null\);/g, 'setMarkdownFeedback(""); setIsStreaming(false);');
fs.writeFileSync('src/components/InterviewLiveSession.tsx', c);
