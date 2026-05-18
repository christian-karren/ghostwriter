"use client";

import type { CorrectionsLog, Sample, Settings, VoiceProfile } from "./types";

const SAMPLES_KEY = "voice.samples.v1";
const SETTINGS_KEY = "voice.settings.v1";
const PROFILE_KEY = "voice.profile.v1";
const CORRECTIONS_KEY = "voice.corrections.v1";

const EMPTY_CORRECTIONS: CorrectionsLog = {
  corrections: [],
  digest: "",
  digestUpdatedAt: 0,
};

const DEFAULT_SETTINGS: Settings = {
  apiKey: "",
  model: "gemini-2.0-flash",
  temperature: 0.7,
};

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function loadSamples(): Sample[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(SAMPLES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Sample[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSamples(samples: Sample[]): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(SAMPLES_KEY, JSON.stringify(samples));
}

export function addSample(name: string, content: string): Sample {
  const samples = loadSamples();
  const now = Date.now();
  const sample: Sample = {
    id: crypto.randomUUID(),
    name: name.trim() || "Untitled",
    content: content.trim(),
    createdAt: now,
    updatedAt: now,
  };
  saveSamples([sample, ...samples]);
  return sample;
}

export function updateSample(id: string, patch: Partial<Pick<Sample, "name" | "content">>): void {
  const samples = loadSamples();
  const next = samples.map((s) =>
    s.id === id ? { ...s, ...patch, updatedAt: Date.now() } : s,
  );
  saveSamples(next);
}

export function deleteSample(id: string): void {
  const samples = loadSamples().filter((s) => s.id !== id);
  saveSamples(samples);
}

export function loadSettings(): Settings {
  if (!isBrowser()) return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadProfile(): VoiceProfile | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as VoiceProfile;
    if (typeof parsed.profile !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveProfile(profile: VoiceProfile): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function clearProfile(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(PROFILE_KEY);
}

export function loadCorrections(): CorrectionsLog {
  if (!isBrowser()) return EMPTY_CORRECTIONS;
  try {
    const raw = window.localStorage.getItem(CORRECTIONS_KEY);
    if (!raw) return EMPTY_CORRECTIONS;
    const parsed = JSON.parse(raw) as CorrectionsLog;
    if (!Array.isArray(parsed.corrections)) return EMPTY_CORRECTIONS;
    return {
      corrections: parsed.corrections,
      digest: typeof parsed.digest === "string" ? parsed.digest : "",
      digestUpdatedAt:
        typeof parsed.digestUpdatedAt === "number" ? parsed.digestUpdatedAt : 0,
    };
  } catch {
    return EMPTY_CORRECTIONS;
  }
}

export function saveCorrections(log: CorrectionsLog): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(CORRECTIONS_KEY, JSON.stringify(log));
}

export function clearCorrections(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(CORRECTIONS_KEY);
}
