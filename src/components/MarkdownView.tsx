import React from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface MarkdownViewProps {
  content: string;
  className?: string;
}

export function MarkdownView({ content, className }: MarkdownViewProps) {
  return (
    <div className={cn("prose prose-invert prose-sm max-w-none break-words", className)}>
      <Markdown 
        remarkPlugins={[remarkGfm]}
        components={{
          code(props) {
            const {children, className, node, ...rest} = props
            const match = /language-(\w+)/.exec(className || '')
            return match ? (
              <div className="bg-[#161618] border border-white/10 rounded-lg overflow-hidden font-mono text-[13px] my-4 not-prose">
                <div className="flex items-center justify-between px-4 py-2 bg-white/5 border-b border-white/5">
                  <span className="text-[10px] text-neutral-500 uppercase">{match[1]}</span>
                  <button 
                    className="text-[10px] text-neutral-400 hover:text-white transition-colors cursor-pointer"
                    onClick={() => navigator.clipboard.writeText(String(children))}
                  >
                    Copy Code
                  </button>
                </div>
                <SyntaxHighlighter
                  {...rest}
                  PreTag="div"
                  children={String(children).replace(/\n$/, '')}
                  language={match[1]}
                  style={vscDarkPlus}
                  customStyle={{
                    margin: 0,
                    borderRadius: 0,
                    background: 'transparent',
                    padding: '1rem'
                  }}
                />
              </div>
            ) : (
              <code {...rest} className={className}>
                {children}
              </code>
            )
          }
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
