"use client";

import { generateText } from "./gemini";
import {
  appendCorrection,
  loadCorrections,
  saveCorrectionsDigest,
} from "./storage";
import type { Correction } from "./types";

const EXTRACT_SYSTEM = `You are analyzing a writer's correction to an AI draft. Your job is to extract concrete, actionable style lessons that a future model can apply when writing for this user.

You will receive three pieces of information.
1. The user's original writing request.
2. The AI's draft that the user was unhappy with.
3. The user's rewrite of that draft.

Compare the draft and the rewrite carefully. Identify specific differences in:
- Word choice (words they cut, words they swapped, vocabulary they prefer)
- Sentence structure (rhythm, length, opening patterns, complexity)
- Organization (paragraph structure, transitions, how they lead and resolve ideas)
- Tone and register (formality, hedging, authority, humor)
- Content choices (what they added, removed, emphasized, or de-emphasized)
- Specific patterns you can name (e.g., "they cut all instances of 'truly' and 'incredibly'", "they replaced generic 'tech giants' with named companies")

Output a list of 3 to 10 lessons. Each lesson is one short imperative sentence telling a future model exactly what to do. Write them so they are concrete and applicable, not vague.

GOOD LESSONS:
- Replace "leverage" with "use" or a more specific verb
- Cut filler adjectives like "truly," "incredibly," "groundbreaking," and "unprecedented"
- Lead paragraphs with a concrete claim, not a setup sentence
- Prefer specific named companies and products over generic terms like "tech giants"
- Vary sentence openings instead of stacking pronouns like "Its," "They," "These"
- Use longer compound sentences with commas in the 16 to 20 word range
- Surface a personal judgment or critique in each paragraph rather than staying neutral

BAD LESSONS (avoid these, they are too vague):
- Write better
- Be more concrete
- Match the user's voice
- Use better word choice

Output ONLY the bulleted list. No preamble. No commentary. No headers. Each lesson on its own line, prefixed with "- ".`;

const CONSOLIDATE_SYSTEM = `You are consolidating a writer's accumulated style corrections into a single clean reference document. A future model will read this document at the top of every system prompt and apply it.

Below is a list of lessons extracted from past corrections. Some may overlap. Some may contradict.

Produce a clean, well-organized digest. Group related items. Resolve contradictions in favor of more recent or more frequently repeated guidance. Cut duplicates.

Output a single coherent passage of 200 to 500 words, written in second-person imperative ("Do X. Avoid Y."). Use short labeled sections if helpful. Output ONLY the digest. No preamble. No commentary.`;

export async function extractLessons(opts: {
  apiKey: string;
  request: string;
  draft: string;
  rewrite: string;
  note?: string;
}): Promise<string[]> {
  const { apiKey, request, draft, rewrite, note } = opts;
  if (!draft.trim() || !rewrite.trim()) {
    throw new Error("Need both the draft and your rewrite to extract lessons.");
  }
  const userPrompt = `# Request\n\n${request.trim() || "(no request recorded)"}\n\n# AI draft\n\n${draft.trim()}\n\n# User's rewrite\n\n${rewrite.trim()}${
    note?.trim() ? `\n\n# User's note about the change\n\n${note.trim()}` : ""
  }`;

  const result = await generateText({
    apiKey,
    systemPrompt: EXTRACT_SYSTEM,
    userPrompt,
    temperature: 0.3,
    maxOutputTokens: 1200,
  });

  return parseLessons(result.text);
}

export async function consolidateDigest(opts: {
  apiKey: string;
  corrections: Correction[];
}): Promise<string> {
  const { apiKey, corrections } = opts;
  if (corrections.length === 0) return "";

  const allLessons = corrections
    .slice(-25)
    .flatMap((c) => c.lessons)
    .filter((l) => l.trim().length > 0);

  if (allLessons.length === 0) return "";

  const userPrompt = `Accumulated lessons:\n\n${allLessons
    .map((l) => `- ${l}`)
    .join("\n")}`;

  const result = await generateText({
    apiKey,
    systemPrompt: CONSOLIDATE_SYSTEM,
    userPrompt,
    temperature: 0.3,
    maxOutputTokens: 2048,
  });

  return result.text.trim();
}

export async function recordCorrection(opts: {
  apiKey: string;
  request: string;
  draft: string;
  rewrite: string;
  note?: string;
  forceDigestOverwrite?: boolean;
}): Promise<{ correction: Correction }> {
  const { apiKey, request, draft, rewrite, note, forceDigestOverwrite } = opts;

  const lessons = await extractLessons({
    apiKey,
    request,
    draft,
    rewrite,
    note,
  });

  const correction: Correction = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    request: request.trim(),
    draft: draft.trim(),
    rewrite: rewrite.trim(),
    note: note?.trim() ?? "",
    lessons,
  };

  await appendCorrection(correction);

  const log = await loadCorrections();
  const digest = await consolidateDigest({
    apiKey,
    corrections: log.corrections,
  });

  await saveCorrectionsDigest({
    markdown: digest,
    sourceCorrectionIds: log.corrections.map((c) => c.id),
    force: forceDigestOverwrite || log.digestUserEdited === true,
  });

  return { correction };
}

function parseLessons(raw: string): string[] {
  const lines = raw.split("\n");
  const lessons: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const cleaned = trimmed
      .replace(/^[-*•]\s*/, "")
      .replace(/^\d+\.\s*/, "")
      .trim();
    if (!cleaned) continue;
    if (cleaned.length < 8) continue;
    lessons.push(cleaned);
  }
  return lessons;
}

export function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const days = Math.floor(hr / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}
