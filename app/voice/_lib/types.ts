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
  kind: "em-dash" | "colon" | "long-sentence" | "contrastive";
  start: number;
  end: number;
  message: string;
};

export type GenerationResult = {
  text: string;
  violations: Violation[];
  retried: boolean;
};
