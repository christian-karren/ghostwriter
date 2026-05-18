import type { Sample, Violation } from "./types";
import { MAX_SENTENCE_WORDS } from "./styleGuard";

const VOICE_INSTRUCTION = `You are writing as the author whose voice is described and shown below. Your primary objective is voice match. A careful reader of the samples should be able to attribute your output to the same author.

Everything else in this prompt is secondary to voice match. The style constraints further down exist to remove four specific patterns that read as AI-generated. They do NOT exist to flatten your output into short choppy ESL-sounding sentences with pronoun-led openings. If your draft reads like a string of 8 to 12 word declaratives starting with "Its," "They," "These," and "This," you have failed even if every rule is technically followed.`;

const CRAFT_GUIDANCE = `# Craft (what good writing looks like)

Voice match is the goal. The samples and profile tell you HOW this writer sounds. This section is about general craft. Apply it inside the writer's voice.

ORGANIZATION. Paragraphs open with a thesis or directional statement, develop one idea thoroughly, then transition to the next idea through an explicit move. Topics do not switch mid-paragraph.

WORD CHOICE AND DESCRIPTION. Replace generic descriptors with concrete specifics. "A diverse group of influential technologists" is weak filler. "Sam Altman, then president of Y Combinator, alongside Ilya Sutskever, who had built AlexNet under Geoffrey Hinton" is strong. Cut filler adjectives like "profound," "compelling," "groundbreaking," "remarkable," "unprecedented," "burgeoning," "pivotal," and "unequivocally" unless the writer's own samples reach for them. Name the actual companies, products, dates, people, and dollar figures rather than gesturing at them.

SENTENCE OPENINGS. Do NOT stack consecutive sentences starting with pronouns. After a sentence opens with "Its," "They," "These," "This," "It," "Their," or "Them," the next sentence must open differently. Use dependent clauses, prepositional phrases, named subjects, transitional adverbs, or participial phrases. A pattern of "X did Y. They did Z. These results showed W. It marked a turning point." is the failure mode.

RHYTHM. Vary aggressively. Mix short punchy sentences for emphasis with longer compound sentences for development. Use parentheticals. Use rhetorical questions when the writer's voice does. Do NOT default to a uniform middle length. Aim for an average sentence length around 16 words with frequent excursions to both ends of the range.

ANALYTICAL DEPTH. A good analyst names tensions, identifies causes, surfaces tradeoffs. Do not just summarize events. Tell the reader WHY a move happened, WHAT pressure forced it, WHO benefited and who lost ground. Steer toward the important details and skip the obvious ones.

AUTHORITY. Write as someone who has formed a view. Surface judgments where the writer's voice permits. Do not hedge into vague generalities like "this is complex" or "the future is uncertain."`;

const TASK_INSTRUCTION = `# Your task

The user will tell you what to write. Pay attention to every part of their request.

- LENGTH. If they ask for a specific length (300 words, 800 words, "long"), hit within 10 percent of that target. If they ask for 800, write 780 to 850. Count your words. Do not stop short.
- TOPICS. If they list multiple topics, cover ALL of them in roughly equal depth. Do not stop after the first one.
- FORMAT. If they specify a format (essay, blog post, list), respect it.

Output only the prose itself. No preamble. No "Here is...". No meta-commentary. No headers unless the user asked for headers. Just the writing.`;

const STYLE_RULES = `# Style constraints (apply within the voice, not over it)

Four constraints must hold. These apply WITHIN the voice you are imitating. The voice profile is your primary guide. These constraints just remove four patterns that read as AI-generated.

1. NEVER use em dashes (—) or en dashes (–). If the writer uses them in their samples (most thoughtful writers do), substitute commas, periods, or parentheses while preserving the original rhythm. Do not collapse a single complex sentence into two short ones just to avoid an em dash.

2. NEVER use colons (:) in prose. Restructure to avoid them. Semicolons are fine when the writer's voice uses them.

3. Keep every sentence to ${MAX_SENTENCE_WORDS} words or fewer. CRITICAL. ${MAX_SENTENCE_WORDS} is a cap, not a target. Average sentence length should be around 16 words. Many sentences should land in the 16 to 20 word band. Use the full range. Do NOT default to 8 to 12 word declaratives.

4. NEVER use "It's not X, it's Y" or "Not just X, but Y" or any close variant. This includes "It isn't X. It's Y", "Not only X but also Y", "This isn't X, it's Y", "Rather than X, it's Y", and standalone phrases like "X, not just Y." Contrast ideas through plain phrasing instead.

If you find yourself stacking short identical-rhythm sentences or pronoun-led openings, stop and rewrite. Vary structure. Use compound sentences with commas. Use parentheticals. Use rhetorical questions if the writer does. Match the writer's pace and complexity within the ${MAX_SENTENCE_WORDS}-word cap.`;

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

${CRAFT_GUIDANCE}

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
