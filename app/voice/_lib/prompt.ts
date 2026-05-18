import type { Sample, Violation } from "./types";
import { MAX_SENTENCE_WORDS } from "./styleGuard";

const VOICE_INSTRUCTION = `You are the author of the writing samples below. Read them closely. Notice the rhythm, the vocabulary, the kind of openings the author chooses, the way they build paragraphs, the way they handle transitions, the level of formality, the small idiosyncrasies. When you write the user's request, write as if you are the same person. Do not write as a generic assistant.`;

const TASK_INSTRUCTION = `# Your task

The user will tell you what to write. Pay attention to every part of their request.

- If they ask for a specific length (300 words, 800 words, "long", etc), hit it. Do not stop short.
- If they list multiple topics, cover all of them. Do not stop after the first one.
- If they specify a format (essay, blog post, list), respect it.

Output only the requested prose itself. No preamble. No "Here is...". No meta-commentary. No headers unless the user asked for headers. Just the writing.`;

const STYLE_RULES = `# Style constraints (absolute, no exceptions)

These four constraints override any default writing instinct. They are non-negotiable, but they should not push you into a choppy, robotic, listicle voice. Keep the author's natural flow within these limits.

1. NEVER use em dashes (—) or en dashes (–). Use periods, commas, or parentheses instead.
2. NEVER use colons (:) in prose. Restructure the sentence to avoid them.
3. Keep every sentence to ${MAX_SENTENCE_WORDS} words or fewer. Count before committing. Split longer sentences.
4. NEVER use "It's not X, it's Y" or "Not just X, but Y" or any close variant. This includes "It isn't X. It's Y", "Not only X but also Y", "This isn't X, it's Y", "Rather than X, it's Y". If you want to contrast two ideas, find a different way to phrase it.

If you find yourself writing many short, identical-rhythm sentences in a row, that is the wrong fix. Vary your sentence structure. Use compound sentences with commas. Use questions. Use sentence fragments occasionally if the author does. Match the author's pace, just without the banned patterns.`;

const NO_SAMPLES_FALLBACK = `(No voice samples were provided. Write thoughtfully and with personality. Avoid sounding like a typical AI assistant.)`;

export function buildSystemPrompt(
  samples: Sample[],
  profile?: string | null,
): string {
  const sampleSection =
    samples.length === 0
      ? NO_SAMPLES_FALLBACK
      : samples
          .map(
            (s, i) =>
              `## Sample ${i + 1}: ${s.name}\n\n${s.content.trim()}`,
          )
          .join("\n\n---\n\n");

  const trimmedProfile = profile?.trim();
  const profileSection = trimmedProfile
    ? `# Voice profile

This is a distilled description of the writer's voice, extracted from their samples. Treat it as your primary guide. The raw samples below are supporting evidence.

${trimmedProfile}

`
    : "";

  return `${VOICE_INSTRUCTION}

${profileSection}# Voice samples

${sampleSection}

${TASK_INSTRUCTION}

${STYLE_RULES}`;
}

export function buildUserPrompt(request: string, sourceMaterial: string): string {
  const parts: string[] = [];
  parts.push(`# Writing request\n\n${request.trim()}`);
  if (sourceMaterial.trim()) {
    parts.push(
      `# Source material\n\nUse the following as input. Do not quote it verbatim. Rewrite it in the user's voice.\n\n${sourceMaterial.trim()}`,
    );
  }
  return parts.join("\n\n");
}

export function buildRetryPrompt(
  request: string,
  sourceMaterial: string,
  previousAttempt: string,
  violations: Violation[],
): string {
  const flagged = violations
    .slice(0, 12)
    .map((v) => {
      const snippet = previousAttempt.slice(v.start, v.end).replace(/\s+/g, " ").trim();
      return `- ${v.message}: "${snippet}"`;
    })
    .join("\n");

  return `${buildUserPrompt(request, sourceMaterial)}

# Your previous attempt violated the style rules

You wrote:

${previousAttempt}

These specific things broke the rules:

${flagged}

Rewrite the response from scratch. Keep the same length, the same topic coverage, and the same voice. Just fix the violations. Do not shorten the essay or strip content to avoid the rules. No em dashes, no colons, no sentences over ${MAX_SENTENCE_WORDS} words, no "not X, it's Y" patterns.`;
}
