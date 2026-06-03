import React from 'react';
import ReactMarkdown from 'react-markdown';

interface MarkdownRendererProps {
  content: string;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  return (
    <div className="prose prose-slate prose-sm max-w-none prose-headings:font-serif prose-headings:font-bold prose-headings:text-slate-800 prose-p:text-slate-700 prose-li:text-slate-700 prose-strong:text-slate-900 prose-strong:font-bold">
      <ReactMarkdown
        components={{
          ul: ({ children }) => <ul className="list-disc pl-5 space-y-1 my-2">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1 my-2">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          h1: ({ children }) => <h1 className="text-xl font-bold mt-4 mb-2 border-b pb-1 border-slate-300">{children}</h1>,
          h2: ({ children }) => <h2 className="text-lg font-bold mt-3 mb-2 text-blue-900">{children}</h2>,
          h3: ({ children }) => <h3 className="text-base font-bold mt-2 mb-1 text-slate-800">{children}</h3>,
          p: ({ children }) => <p className="mb-2 leading-relaxed">{children}</p>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-amber-500 pl-4 py-1 my-3 bg-amber-50 italic text-slate-700 rounded-r">
              {children}
            </blockquote>
          ),
          strong: ({ children }) => <strong className="font-bold text-blue-900 bg-blue-50 px-0.5 rounded">{children}</strong>,
          code: ({ children }) => <code className="bg-slate-200 px-1 py-0.5 rounded text-sm font-mono">{children}</code>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;