"use client";

import type { Violation } from "../_lib/types";

const KIND_STYLES: Record<Violation["kind"], string> = {
  "em-dash": "bg-red-500/25 underline decoration-red-500 decoration-2",
  "colon": "bg-red-500/25 underline decoration-red-500 decoration-2",
  "long-sentence": "bg-yellow-400/20 underline decoration-yellow-500 decoration-wavy",
  "contrastive": "bg-orange-500/25 underline decoration-orange-500 decoration-wavy",
  "pronoun-stack": "bg-purple-500/15 underline decoration-purple-500 decoration-wavy",
};

export function HighlightedOutput({
  text,
  violations,
}: {
  text: string;
  violations: Violation[];
}) {
  if (violations.length === 0) {
    return <pre className="whitespace-pre-wrap font-sans leading-relaxed">{text}</pre>;
  }

  const sorted = [...violations].sort((a, b) => a.start - b.start);
  const segments: React.ReactNode[] = [];
  let cursor = 0;

  for (let i = 0; i < sorted.length; i++) {
    const v = sorted[i];
    if (v.start < cursor) continue;
    if (v.start > cursor) {
      segments.push(<span key={`t-${i}`}>{text.slice(cursor, v.start)}</span>);
    }
    segments.push(
      <span
        key={`v-${i}`}
        className={`${KIND_STYLES[v.kind]} rounded px-0.5`}
        title={v.message}
      >
        {text.slice(v.start, v.end)}
      </span>,
    );
    cursor = v.end;
  }

  if (cursor < text.length) {
    segments.push(<span key="t-end">{text.slice(cursor)}</span>);
  }

  return (
    <pre className="whitespace-pre-wrap font-sans leading-relaxed">{segments}</pre>
  );
}
