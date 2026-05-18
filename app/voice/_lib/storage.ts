"use client";

import type { Sample, Settings } from "./types";

const SAMPLES_KEY = "voice.samples.v1";
const SETTINGS_KEY = "voice.settings.v1";

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
