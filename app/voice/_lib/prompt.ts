import type { Sample, Violation } from "./types";
import { MAX_SENTENCE_WORDS, type LengthFeedback } from "./styleGuard";

const VOICE_INSTRUCTION = `You are writing as the author whose voice is described and shown below. Your primary objective is voice match. A careful reader of the samples should be able to attribute your output to the same author.

Everything else in this prompt is secondary to voice match. The style constraints further down exist to remove four specific patterns that read as AI-generated. They do NOT exist to flatten your output into short choppy ESL-sounding sentences with pronoun-led openings. If your draft reads like a string of 8 to 12 word declaratives starting with "Its," "They," "These," and "This," you have failed even if every rule is technically followed.`;

const CRAFT_GUIDANCE = `# Craft (what good writing looks like)

Voice match is the goal. The samples and profile tell you HOW this writer sounds. This section is about general craft. Apply it inside the writer's voice.

ORGANIZATION. Paragraphs open with a thesis or directional statement, develop one idea thoroughly, then transition to the next idea through an explicit move. Topics do not switch mid-paragraph.

WORD CHOICE AND DESCRIPTION. Replace generic descriptors with concrete specifics. "A diverse group of influential technologists" is weak filler. "Sam Altman, then president of Y Combinator, alongside Ilya Sutskever, who had built AlexNet under Geoffrey Hinton" is strong. Cut filler adjectives like "profound," "compelling," "groundbreaking," "remarkable," "unprecedented," "burgeoning," "pivotal," and "unequivocally" unless the writer's own samples reach for them. Name the actual companies, products, dates, people, and dollar figures rather than gesturing at them.

SENTENCE OPENINGS. Do NOT stack consecutive sentences starting with pronouns. After a sentence opens with "Its," "They," "These," "This," "It," "Their," or "Them," the next sentence must open differently. Use dependent clauses, prepositional phrases, named subjects, transitional adverbs, or participial phrases. A pattern of "X did Y. They did Z. These results showed W. It marked a turning point." is the failure mode.

RHYTHM. Vary aggressively. Mix short punchy sentences (5 to 12 words) for emphasis with longer compound sentences (25 to 40 words) for development. Long sentences are GOOD when they develop a clear thought, use commas and semicolons well, and read naturally. Commas are your friend. Parentheticals are your friend. Use rhetorical questions when the writer's voice does. The only bad long sentence is the AI run-on that loses the reader, jumps subjects mid-thought, or strings together too many ideas without structure. Do NOT default to a uniform middle length. Do NOT default to short choppy declaratives that sound like ESL prose.

ANALYTICAL DEPTH. A good analyst names tensions, identifies causes, surfaces tradeoffs. Do not just summarize events. Tell the reader WHY a move happened, WHAT pressure forced it, WHO benefited and who lost ground. Steer toward the important details and skip the obvious ones.

AUTHORITY. Write as someone who has formed a view. Surface judgments where the writer's voice permits. Do not hedge into vague generalities like "this is complex" or "the future is uncertain."`;

const TASK_INSTRUCTION = `# Your task

The user will tell you what to write. Pay attention to every part of their request.

- LENGTH. If they ask for a specific length (300 words, 800 words, 1200 words, "long"), hit within 10 percent of that target. If they ask for 1200, write 1080 to 1320. Err on the LONG side, never short. The harness will catch and reject undershooting drafts so this rule matters. Do not summarize or wrap up early. If you find yourself wrapping up at 70 percent of target, add more depth, more examples, more analysis, more concrete specifics.
- TOPICS. If they list multiple topics, cover ALL of them in roughly equal depth. Do not stop after the first one.
- FORMAT. If they specify a format (essay, blog post, list), respect it.

Output only the prose itself. No preamble. No "Here is...". No meta-commentary. No headers unless the user asked for headers. Just the writing.`;

const STYLE_RULES = `# Style constraints (apply within the voice, not over it)

Five constraints must hold. These apply WITHIN the voice you are imitating. The voice profile is your primary guide. These constraints just remove five patterns that read as AI-generated or unfit for human prose.

1. NEVER use em dashes (—) or en dashes (–). If the writer uses them in their samples (most thoughtful writers do), substitute commas, periods, or parentheses while preserving the original rhythm. Do not collapse a single complex sentence into two short ones just to avoid an em dash.

2. NEVER use colons (:) in prose. Restructure to avoid them. Semicolons are fine when the writer's voice uses them.

3. Vary sentence length aggressively. Use long sentences (25 to 40 words) for development. Use short sentences (5 to 12 words) for emphasis. Long sentences are GOOD when they have clear structure, use commas and semicolons well, and read naturally. The hard cap is ${MAX_SENTENCE_WORDS} words on any single sentence, but the cap is for safety, not a target. The only sentence pattern to avoid is the AI run-on (40 plus words, weak structure, lost subject, hard to read). Do NOT default to short choppy 8 to 12 word declaratives. Do NOT write everything at the same length.

4. NEVER use "It's not X, it's Y" or "Not just X, but Y" or any close variant. This includes "It isn't X. It's Y", "Not only X but also Y", "This isn't X, it's Y", "Rather than X, it's Y", and standalone phrases like "X, not just Y." Contrast ideas through plain phrasing instead.

5. Output PLAIN prose. No Markdown syntax of any kind. Do NOT wrap words in **double asterisks** for emphasis. Do NOT wrap words in *single asterisks* or _underscores_. Do NOT use # headers, > blockquotes, or [link](url) syntax. This output is going to be copied directly into emails, blog posts, and newsletters where Markdown does not render. Write the words you mean. Emphasis comes from word choice and sentence structure, not from formatting characters.

If you find yourself stacking short identical-rhythm sentences or pronoun-led openings, stop and rewrite. Vary structure. Use compound sentences with commas. Use semicolons when they fit the writer's voice. Use parentheticals. Use rhetorical questions if the writer does. Match the writer's pace and complexity. Default to thoughtful, varied prose with long sentences mixed in.`;

const NO_SAMPLES_FALLBACK = `(No voice samples were provided. Write thoughtfully and with personality. Avoid sounding like a typical AI assistant.)`;

export function buildSystemPrompt(
  samples: Sample[],
  profile?: string | null,
  correctionsDigest?: string | null,
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

  const trimmedDigest = correctionsDigest?.trim();
  const correctionsSection = trimmedDigest
    ? `# Personal corrections (from this user's past edits)

This user has rewritten your previous drafts. The lessons below were extracted from those rewrites. They are explicit instructions about what this user wants. Apply them. They override your defaults and refine the voice profile above.

${trimmedDigest}

`
    : "";

  return `${VOICE_INSTRUCTION}

${profileSection}${correctionsSection}# Voice samples

${sampleSection}

${CRAFT_GUIDANCE}

${TASK_INSTRUCTION}

${STYLE_RULES}`;
}

export function buildUserPrompt(request: string, sourceMaterial: string): string {
  const parts: string[] = [];
  parts.push(`# Writing request\n\n${request.trim()}`);
  if (sourceMaterial.trim()) {
    parts.push(
      `# Attached files

The user attached the following files as context for this task. Read them carefully. They may contain a rubric, an assignment description, source notes, an outline, or a draft to rewrite. Use them appropriately based on what they are. Follow any constraints they imply. If they look like notes or an outline, expand them in the user's voice. If they look like a rubric or instructions, treat them as requirements.

${sourceMaterial.trim()}`,
    );
  }
  return parts.join("\n\n");
}

export function buildRetryPrompt(
  request: string,
  sourceMaterial: string,
  previousAttempt: string,
  violations: Violation[],
  lengthFeedback?: LengthFeedback | null,
): string {
  const flagged = violations
    .slice(0, 12)
    .map((v) => {
      const snippet = previousAttempt.slice(v.start, v.end).replace(/\s+/g, " ").trim();
      return `- ${v.message}: "${snippet}"`;
    })
    .join("\n");

  const lengthBlock =
    lengthFeedback && lengthFeedback.status !== "ok"
      ? `# Length feedback

Your draft was ${lengthFeedback.actual} words. The target is ${lengthFeedback.target} words (acceptable range ${lengthFeedback.min} to ${lengthFeedback.max}). ${
          lengthFeedback.status === "short"
            ? `You are SHORT by about ${lengthFeedback.delta} words. Add real depth. More examples, more analysis, more named specifics, more nuance. Do NOT pad with filler. Do NOT just restate things. Add new substance.`
            : `You went LONG by about ${lengthFeedback.delta} words. Trim filler and tighten phrasing while preserving every point.`
        }

`
      : "";

  const styleBlock =
    violations.length > 0
      ? `# Style issues to fix

${flagged}

`
      : "";

  return `${buildUserPrompt(request, sourceMaterial)}

# Your previous attempt needs revision

You wrote:

${previousAttempt}

${lengthBlock}${styleBlock}Rewrite the response from scratch. Keep the topic coverage and voice. Address the feedback above. ${
    lengthFeedback?.status === "short" ? "Hit the target length with real substance, not padding. " : ""
  }No em dashes. No colons. No sentences over ${MAX_SENTENCE_WORDS} words. No "not X, it's Y" patterns. Use long varied sentences with commas when appropriate. Do NOT write in choppy short declaratives.`;
}
