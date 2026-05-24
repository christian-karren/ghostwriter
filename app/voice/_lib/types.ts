export type SampleKind = "own" | "liked";

export type SampleMeta = {
  id: string;
  shortId: string;
  name: string;
  kind: SampleKind;
  rawPath: string;
  extractedPath: string | null;
  contentHash: string;
  wordCount: number;
  ext: string;
  createdAt: number;
  updatedAt: number;
};

export type Sample = SampleMeta & { content: string };

export type Settings = {
  apiKey: string;
  temperature: number;
  onboardingComplete: boolean;
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
  userEdited?: boolean;
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
  digestUserEdited?: boolean;
};

export type ArchiveGenerationInput = {
  request: string;
  source?: string;
  systemPrompt: string;
  draftV1: string;
  violationsV1: Violation[];
  draftV2?: string;
  violationsV2?: Violation[];
  finalText: string;
  meta: {
    model: string;
    temperature: number;
    finishReason: string;
    ms: number;
    accepted: boolean;
    retried: boolean;
  };
};
