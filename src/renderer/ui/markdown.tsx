import React, { useMemo } from 'react';

// Tiny, opinionated Markdown subset renderer for Claude's brief output.
// Supports: ## headings, paragraphs, single line breaks via two trailing spaces,
// *italic*, **bold**, `inline code`. Nothing else. Untrusted content; never raw HTML.

interface Props { source: string; className?: string }

export function Markdown({ source, className }: Props) {
  const blocks = useMemo(() => source.replace(/\r\n/g, '\n').split(/\n{2,}/), [source]);
  return (
    <div className={className}>
      {blocks.map((block, i) => {
        const trimmed = block.trim();
        if (!trimmed) return null;
        const headingMatch = trimmed.match(/^##\s+(.+)$/);
        if (headingMatch) {
          return <h2 key={i} className="text-[11px] uppercase tracking-[1.5px] text-muted font-semibold mb-2 mt-5">{headingMatch[1]}</h2>;
        }
        return <p key={i} className="text-[14px] leading-[1.6] text-text mb-3 whitespace-pre-wrap">{renderInline(trimmed)}</p>;
      })}
    </div>
  );
}

function renderInline(text: string): React.ReactNode[] {
  // Tokenize **bold**, *italic*, `code`. Order matters: **bold** before *italic*.
  const tokens: Array<{ type: 'text' | 'bold' | 'italic' | 'code'; content: string }> = [];
  let remaining = text;
  while (remaining.length > 0) {
    const bold = remaining.match(/^\*\*(.+?)\*\*/);
    if (bold) {
      tokens.push({ type: 'bold', content: bold[1] });
      remaining = remaining.slice(bold[0].length);
      continue;
    }
    const code = remaining.match(/^`([^`]+)`/);
    if (code) {
      tokens.push({ type: 'code', content: code[1] });
      remaining = remaining.slice(code[0].length);
      continue;
    }
    const italic = remaining.match(/^\*(\S(?:.*?\S)?)\*/);
    if (italic) {
      tokens.push({ type: 'italic', content: italic[1] });
      remaining = remaining.slice(italic[0].length);
      continue;
    }
    // Consume a chunk of plain text up to the next special character (linear time)
    const nextSpecial = remaining.search(/[*`]/);
    const chunkEnd = nextSpecial === -1 ? remaining.length : nextSpecial;
    tokens.push({ type: 'text', content: remaining.slice(0, chunkEnd) });
    remaining = remaining.slice(chunkEnd);
    if (remaining.length === 0) break; // safety
  }
  // Merge consecutive text tokens for fewer DOM nodes
  const merged: Array<{ type: 'text' | 'bold' | 'italic' | 'code'; content: string }> = [];
  for (const t of tokens) {
    const last = merged[merged.length - 1];
    if (last && last.type === 'text' && t.type === 'text') last.content += t.content;
    else merged.push({ ...t });
  }
  return merged.map((t, i) => {
    if (t.type === 'bold') return <strong key={i} className="font-bold text-text">{t.content}</strong>;
    if (t.type === 'italic') return <em key={i} className="italic">{t.content}</em>;
    if (t.type === 'code') return <code key={i} className="bg-bg-deep px-1.5 py-0.5 rounded text-[12px] text-accent">{t.content}</code>;
    return <React.Fragment key={i}>{t.content}</React.Fragment>;
  });
}
