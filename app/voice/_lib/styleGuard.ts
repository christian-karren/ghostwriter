import type { Violation } from "./types";

export const MAX_SENTENCE_WORDS = 20;

export function findViolations(text: string): Violation[] {
  const violations: Violation[] = [];

  for (const match of text.matchAll(/[—–]/g)) {
    const start = match.index ?? 0;
    violations.push({
      kind: "em-dash",
      start,
      end: start + match[0].length,
      message: "Em dash or en dash",
    });
  }

  for (const match of text.matchAll(/:/g)) {
    const start = match.index ?? 0;
    violations.push({
      kind: "colon",
      start,
      end: start + 1,
      message: "Colon",
    });
  }

  for (const s of splitSentences(text)) {
    const words = s.text.trim().split(/\s+/).filter(Boolean);
    if (words.length > MAX_SENTENCE_WORDS) {
      violations.push({
        kind: "long-sentence",
        start: s.start,
        end: s.end,
        message: `Sentence has ${words.length} words (max ${MAX_SENTENCE_WORDS})`,
      });
    }
  }

  const contrastive = [
    /\b(it'?s|that'?s|this is|they'?re|you'?re|we'?re)\s+not\s+(just\s+|simply\s+|merely\s+|only\s+)?[^.!?\n]{1,120}?[,;.\-]\s*(it'?s|that'?s|this is|they'?re|you'?re|we'?re|rather)\b/gi,
    /\bnot\s+(just|only|merely|simply)\s+[^.!?\n]{1,120}?,?\s*but\s+(also\s+)?\w/gi,
    /\b(isn'?t|aren'?t|wasn'?t|weren'?t)\s+[^.!?\n]{1,120}?[,;.\-]\s*(it'?s|that'?s|they'?re|rather)\b/gi,
  ];

  for (const re of contrastive) {
    for (const match of text.matchAll(re)) {
      const start = match.index ?? 0;
      violations.push({
        kind: "contrastive",
        start,
        end: start + match[0].length,
        message: '"Not X, it\'s Y" pattern',
      });
    }
  }

  return mergeOverlapping(violations.sort((a, b) => a.start - b.start));
}

type SentenceSpan = { text: string; start: number; end: number };

function splitSentences(text: string): SentenceSpan[] {
  const spans: SentenceSpan[] = [];
  const re = /[^.!?\n]+(?:[.!?]+|\n|$)/g;
  for (const match of text.matchAll(re)) {
    const start = match.index ?? 0;
    const matched = match[0];
    if (!matched.trim()) continue;
    spans.push({ text: matched, start, end: start + matched.length });
  }
  return spans;
}

function mergeOverlapping(violations: Violation[]): Violation[] {
  if (violations.length === 0) return violations;
  const out: Violation[] = [];
  for (const v of violations) {
    const last = out[out.length - 1];
    if (last && last.kind === v.kind && v.start < last.end) {
      last.end = Math.max(last.end, v.end);
      continue;
    }
    out.push({ ...v });
  }
  return out;
}

export function summarizeViolations(violations: Violation[]): string {
  if (violations.length === 0) return "";
  const counts = new Map<string, number>();
  for (const v of violations) {
    counts.set(v.kind, (counts.get(v.kind) ?? 0) + 1);
  }
  const parts: string[] = [];
  if (counts.get("em-dash")) parts.push(`${counts.get("em-dash")} em/en dash(es)`);
  if (counts.get("colon")) parts.push(`${counts.get("colon")} colon(s)`);
  if (counts.get("long-sentence")) parts.push(`${counts.get("long-sentence")} long sentence(s)`);
  if (counts.get("contrastive")) parts.push(`${counts.get("contrastive")} contrastive pattern(s)`);
  return parts.join(", ");
}
