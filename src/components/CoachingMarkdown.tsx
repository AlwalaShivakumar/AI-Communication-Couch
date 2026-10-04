import ReactMarkdown from 'react-markdown';
export function CoachingMarkdown({ children }: { children: string }) {
  return <ReactMarkdown skipHtml components={{ img: () => null, a: ({ children }) => <span>{children}</span> }}>{children}</ReactMarkdown>;
}
