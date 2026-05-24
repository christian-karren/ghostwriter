"use client";

import { generateText } from "./gemini";
import type { Sample, VoiceProfile } from "./types";

const PROFILE_SYSTEM = `You are analyzing a writer's samples to build a precise style profile for another model to use as an imitation guide.

Read every sample below. Then produce a structured description of this writer's voice.

Cover these dimensions, but only include each if there is clear evidence in the samples. Skip anything you cannot determine from the text.

1. Sentence rhythm. The typical sentence length range. How much it varies. Where the writer chooses to break a longer thought.
2. Vocabulary tells. Specific words and phrases this writer reaches for. Words they obviously avoid. Their level of formality.
3. Openings. How pieces and paragraphs typically start. Cold opens, anecdotes, statements of intent, questions.
4. Transitions. How they move between ideas. Connector phrases. Whether they signal moves or let them feel abrupt.
5. Concreteness. Do they reach for specific examples, named people, named places, or stay abstract.
6. Register and tone. Be specific. "Conversational with dry humor" beats "casual." Name the emotional temperature.
7. Structural habits. Paragraph length. Use of lists, dialogue, fragments, rhetorical questions.
8. Distinctive habits. Any pattern that would let a reader recognize this writer specifically.

Output ONLY the profile. No preamble. No section headers. No meta-commentary about what you are doing. A flowing description of 200 to 400 words, written so another LLM can read it and use it as a guide.`;

export async function extractVoiceProfile(opts: {
  apiKey: string;
  model: string;
  samples: Sample[];
}): Promise<VoiceProfile> {
  const { apiKey, model, samples } = opts;

  if (samples.length === 0) {
    throw new Error("No samples to analyze. Add at least one writing sample first.");
  }

  const sampleText = samples
    .map((s, i) => `## Sample ${i + 1}: ${s.name}\n\n${s.content.trim()}`)
    .join("\n\n---\n\n");

  const result = await generateText({
    apiKey,
    model,
    systemPrompt: PROFILE_SYSTEM,
    userPrompt: sampleText,
    temperature: 0.4,
    maxOutputTokens: 2048,
  });

  return {
    profile: result.text.trim(),
    sampleIds: samples.map((s) => s.id),
    generatedAt: Date.now(),
    model,
  };
}

export function isProfileStale(profile: VoiceProfile, samples: { id: string }[]): boolean {
  const currentIds = new Set(samples.map((s) => s.id));
  const profileIds = new Set(profile.sampleIds);
  if (currentIds.size !== profileIds.size) return true;
  for (const id of currentIds) {
    if (!profileIds.has(id)) return true;
  }
  return false;
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
