"use client";

import type {
  ArchiveGenerationInput,
  Correction,
  CorrectionsLog,
  GenerationFull,
  GenerationSummary,
  Sample,
  SampleKind,
  SampleMeta,
  Settings,
  VoiceProfile,
} from "../types";

/*
 * Web storage backend. localStorage for small JSON state (settings, profile,
 * corrections digest, api key). IndexedDB for samples and generation archives,
 * since they can grow large.
 */

const LS_SETTINGS = "gw.settings.v1";
const LS_APIKEY = "gw.apikey.v1";
const LS_PROFILE = "gw.profile.v1";
const LS_CORRECTIONS = "gw.corrections.v1";
const DB_NAME = "ghostwriter";
const DB_VERSION = 1;
const STORE_SAMPLES = "samples";
const STORE_GENERATIONS = "generations";

const DEFAULT_SETTINGS: Settings = {
  apiKey: "",
  temperature: 0.7,
  onboardingComplete: false,
};

/* === IndexedDB helpers === */

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_SAMPLES)) {
        db.createObjectStore(STORE_SAMPLES, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_GENERATIONS)) {
        db.createObjectStore(STORE_GENERATIONS, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);
        const request = fn(store);
        transaction.oncomplete = () => resolve(request.result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      }),
  );
}

/* === localStorage helpers === */

function lsGet<T>(key: string): T | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function lsSet(key: string, value: unknown): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

function lsRemove(key: string): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(key);
}

/* === utilities === */

function now(): number {
  return Date.now();
}

async function sha256Hex(text: string): Promise<string> {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    return "sha256-unavailable";
  }
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `sha256-${hex}`;
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "sample"
  );
}

function shortId(id: string): string {
  return id.replace(/[^a-z0-9]/gi, "").slice(0, 8) || id.slice(0, 8);
}

function extFromMime(mime: string | null | undefined, name: string): string {
  if (mime === "application/pdf") return "pdf";
  if (mime === "text/markdown") return "md";
  if (mime === "text/plain") return "txt";
  const dot = name.lastIndexOf(".");
  if (dot >= 0) {
    const candidate = name.slice(dot + 1).toLowerCase();
    if (/^[a-z0-9]{1,8}$/.test(candidate)) return candidate;
  }
  return "md";
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/* === samples === */

type StoredSample = {
  id: string;
  meta: SampleMeta;
  content: string;
};

export async function loadSamples(): Promise<SampleMeta[]> {
  const all = await tx<StoredSample[]>(STORE_SAMPLES, "readonly", (store) =>
    store.getAll(),
  );
  return all
    .map((s) => s.meta)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function readSample(id: string): Promise<Sample> {
  const stored = await tx<StoredSample | undefined>(
    STORE_SAMPLES,
    "readonly",
    (store) => store.get(id),
  );
  if (!stored) throw new Error(`Sample not found: ${id}`);
  return { ...stored.meta, content: stored.content };
}

export async function addSample(opts: {
  name: string;
  kind: SampleKind;
  bytes: Uint8Array;
  mimeType?: string | null;
  extractedText?: string | null;
}): Promise<SampleMeta> {
  const id = crypto.randomUUID();
  const short = shortId(id);
  const slug = slugify(opts.name);
  const ext = extFromMime(opts.mimeType, opts.name);
  const content =
    opts.extractedText ??
    (() => {
      try {
        return new TextDecoder().decode(opts.bytes);
      } catch {
        return "";
      }
    })();
  const meta: SampleMeta = {
    id,
    shortId: short,
    name: opts.name,
    kind: opts.kind,
    rawPath: `samples/raw/${slug}-${short}.${ext}`,
    extractedPath: opts.extractedText
      ? `samples/extracted/${slug}-${short}.txt`
      : null,
    contentHash: await sha256Hex(content),
    wordCount: wordCount(content),
    ext,
    createdAt: now(),
    updatedAt: now(),
  };
  await tx<IDBValidKey>(STORE_SAMPLES, "readwrite", (store) =>
    store.put({ id, meta, content }),
  );
  return meta;
}

export async function updateSample(
  id: string,
  patch: { name?: string; text?: string },
): Promise<SampleMeta> {
  const existing = await tx<StoredSample | undefined>(
    STORE_SAMPLES,
    "readonly",
    (store) => store.get(id),
  );
  if (!existing) throw new Error(`Sample not found: ${id}`);
  const nextMeta: SampleMeta = { ...existing.meta };
  let nextContent = existing.content;
  if (typeof patch.name === "string") nextMeta.name = patch.name;
  if (typeof patch.text === "string") {
    if (existing.meta.extractedPath) {
      throw new Error(
        "cannot edit text of a sample backed by an extracted source",
      );
    }
    nextContent = patch.text;
    nextMeta.contentHash = await sha256Hex(nextContent);
    nextMeta.wordCount = wordCount(nextContent);
  }
  nextMeta.updatedAt = now();
  await tx<IDBValidKey>(STORE_SAMPLES, "readwrite", (store) =>
    store.put({ id, meta: nextMeta, content: nextContent }),
  );
  return nextMeta;
}

export async function deleteSample(id: string): Promise<void> {
  await tx<undefined>(STORE_SAMPLES, "readwrite", (store) => store.delete(id));
}

/* === settings === */

type StoredSettings = {
  temperature: number;
  onboardingComplete: boolean;
};

export async function loadSettings(): Promise<Settings> {
  const base = lsGet<StoredSettings>(LS_SETTINGS);
  const apiKey = lsGet<string>(LS_APIKEY);
  return {
    ...DEFAULT_SETTINGS,
    temperature:
      base && typeof base.temperature === "number"
        ? base.temperature
        : DEFAULT_SETTINGS.temperature,
    onboardingComplete: base?.onboardingComplete ?? false,
    apiKey: typeof apiKey === "string" ? apiKey : "",
  };
}

export async function saveSettings(s: Settings): Promise<void> {
  lsSet(LS_SETTINGS, {
    temperature: s.temperature,
    onboardingComplete: s.onboardingComplete,
  });
  if (s.apiKey) {
    lsSet(LS_APIKEY, s.apiKey);
  } else {
    lsRemove(LS_APIKEY);
  }
}

/* === profile === */

type StoredProfile = {
  markdown: string;
  meta: {
    model: string | null;
    generatedAt: number | null;
    sourceSampleIds: string[];
    lastMachineHash: string | null;
  };
};

export async function loadProfile(): Promise<VoiceProfile | null> {
  const stored = lsGet<StoredProfile>(LS_PROFILE);
  if (!stored || !stored.markdown.trim()) return null;
  return {
    profile: stored.markdown,
    sampleIds: stored.meta.sourceSampleIds ?? [],
    generatedAt: stored.meta.generatedAt ?? 0,
    model: stored.meta.model ?? "",
    userEdited: false,
  };
}

export async function saveProfile(p: VoiceProfile): Promise<void> {
  lsSet(LS_PROFILE, {
    markdown: p.profile,
    meta: {
      model: p.model || null,
      generatedAt: p.generatedAt || now(),
      sourceSampleIds: p.sampleIds,
      lastMachineHash: await sha256Hex(p.profile),
    },
  });
}

export async function clearProfile(): Promise<void> {
  lsRemove(LS_PROFILE);
}

/* === corrections === */

type StoredCorrections = {
  events: Correction[];
  digest: {
    markdown: string;
    sourceCorrectionIds: string[];
    generatedAt: number;
  };
};

function loadCorrectionsLog(): StoredCorrections {
  return (
    lsGet<StoredCorrections>(LS_CORRECTIONS) ?? {
      events: [],
      digest: { markdown: "", sourceCorrectionIds: [], generatedAt: 0 },
    }
  );
}

export async function loadCorrections(): Promise<CorrectionsLog> {
  const store = loadCorrectionsLog();
  return {
    corrections: [...store.events].sort((a, b) => b.createdAt - a.createdAt),
    digest: store.digest.markdown,
    digestUpdatedAt: store.digest.generatedAt,
    digestUserEdited: false,
  };
}

export async function appendCorrection(c: Correction): Promise<Correction> {
  const store = loadCorrectionsLog();
  store.events.unshift(c);
  lsSet(LS_CORRECTIONS, store);
  return c;
}

export async function deleteCorrection(id: string): Promise<void> {
  const store = loadCorrectionsLog();
  store.events = store.events.filter((e) => e.id !== id);
  lsSet(LS_CORRECTIONS, store);
}

export async function saveCorrectionsDigest(opts: {
  markdown: string;
  sourceCorrectionIds: string[];
  force?: boolean;
}): Promise<void> {
  const store = loadCorrectionsLog();
  store.digest = {
    markdown: opts.markdown,
    sourceCorrectionIds: opts.sourceCorrectionIds,
    generatedAt: now(),
  };
  lsSet(LS_CORRECTIONS, store);
}

export async function clearCorrections(): Promise<void> {
  lsSet(LS_CORRECTIONS, {
    events: [],
    digest: { markdown: "", sourceCorrectionIds: [], generatedAt: 0 },
  });
}

/* === history === */

type StoredGeneration = {
  id: string;
  createdAt: number;
  request: string;
  source: string | null;
  systemPrompt: string;
  draftV1: string;
  draftV2: string | null;
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

function isoDirname(timestamp: number, request: string): string {
  const iso = new Date(timestamp)
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace(/-\d{3}Z$/, "Z");
  const slug = slugify(request || "generation");
  return `${iso}-${slug}`;
}

export async function archiveGeneration(
  input: ArchiveGenerationInput,
): Promise<string> {
  const createdAt = now();
  const id = isoDirname(createdAt, input.request);
  const stored: StoredGeneration = {
    id,
    createdAt,
    request: input.request,
    source: input.source ?? null,
    systemPrompt: input.systemPrompt,
    draftV1: input.draftV1,
    draftV2: input.draftV2 ?? null,
    finalText: input.finalText,
    meta: input.meta,
  };
  await tx<IDBValidKey>(STORE_GENERATIONS, "readwrite", (store) =>
    store.put(stored),
  );
  return id;
}

export async function listGenerations(): Promise<GenerationSummary[]> {
  const all = await tx<StoredGeneration[]>(
    STORE_GENERATIONS,
    "readonly",
    (store) => store.getAll(),
  );
  return all
    .map((g) => ({
      id: g.id,
      createdAt: g.createdAt,
      request: g.request,
      accepted: g.meta.accepted,
    }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function readGeneration(id: string): Promise<GenerationFull> {
  const stored = await tx<StoredGeneration | undefined>(
    STORE_GENERATIONS,
    "readonly",
    (store) => store.get(id),
  );
  if (!stored) throw new Error(`Generation not found: ${id}`);
  return {
    id: stored.id,
    createdAt: stored.createdAt,
    request: stored.request,
    source: stored.source,
    finalText: stored.finalText,
    meta: stored.meta,
  };
}

export async function deleteGeneration(id: string): Promise<void> {
  await tx<undefined>(STORE_GENERATIONS, "readwrite", (store) =>
    store.delete(id),
  );
}

/* === misc === */

export async function openDataDir(): Promise<void> {
  throw new Error(
    "Open data folder is not available in the web app. Use the desktop app for filesystem access.",
  );
}
