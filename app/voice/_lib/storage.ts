"use client";

import * as tauriBackend from "./backends/tauri";
import * as webBackend from "./backends/web";
import type {
  CorrectionsLog,
  Sample,
  SampleMeta,
} from "./types";

export function isTauriEnv(): boolean {
  return (
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
  );
}

type Backend = typeof tauriBackend;

function pickBackend(): Backend {
  if (isTauriEnv()) return tauriBackend;
  return webBackend as unknown as Backend;
}

const backend = pickBackend();

const EMPTY_CORRECTIONS: CorrectionsLog = {
  corrections: [],
  digest: "",
  digestUpdatedAt: 0,
};

/* samples */

export const loadSamples = backend.loadSamples;
export const readSample = backend.readSample;

export async function hydrateSamples(metas: SampleMeta[]): Promise<Sample[]> {
  return Promise.all(metas.map((m) => backend.readSample(m.id)));
}

export const addSample = backend.addSample;
export const updateSample = backend.updateSample;
export const deleteSample = backend.deleteSample;

/* settings */

export const loadSettings = backend.loadSettings;
export const saveSettings = backend.saveSettings;

/* profile */

export const loadProfile = backend.loadProfile;
export const saveProfile = backend.saveProfile;
export const clearProfile = backend.clearProfile;

/* corrections */

export const loadCorrections = backend.loadCorrections;
export const appendCorrection = backend.appendCorrection;
export const deleteCorrection = backend.deleteCorrection;
export const saveCorrectionsDigest = backend.saveCorrectionsDigest;
export const clearCorrections = backend.clearCorrections;

export function emptyCorrections(): CorrectionsLog {
  return { ...EMPTY_CORRECTIONS };
}

/* history */

export const archiveGeneration = backend.archiveGeneration;
export const listGenerations = backend.listGenerations;
export const readGeneration = backend.readGeneration;
export const deleteGeneration = backend.deleteGeneration;

/* misc */

export const openDataDir = backend.openDataDir;
