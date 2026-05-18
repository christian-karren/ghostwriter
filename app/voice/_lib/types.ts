export type Sample = {
  id: string;
  name: string;
  content: string;
  createdAt: number;
  updatedAt: number;
};

export type Settings = {
  apiKey: string;
  model: string;
  temperature: number;
};

export type Violation = {
  kind: "em-dash" | "colon" | "long-sentence" | "contrastive" | "pronoun-stack";
  start: number;
  end: number;
  message: string;
};

export type GenerationResult = {
  text: string;
  violations: Violation[];
  retried: boolean;
};

export type VoiceProfile = {
  profile: string;
  sampleIds: string[];
  generatedAt: number;
  model: string;
};

export type Correction = {
  id: string;
  createdAt: number;
  request: string;
  draft: string;
  rewrite: string;
  note: string;
  lessons: string[];
};

export type CorrectionsLog = {
  corrections: Correction[];
  digest: string;
  digestUpdatedAt: number;
};
