"use client";

import { invoke } from "@tauri-apps/api/core";

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

const DEFAULT_SETTINGS: Settings = {
  apiKey: "",
  temperature: 0.7,
  onboardingComplete: false,
};

/* samples */

export async function loadSamples(): Promise<SampleMeta[]> {
  return invoke<SampleMeta[]>("list_samples");
}

export async function readSample(id: string): Promise<Sample> {
  const { meta, text } = await invoke<{ meta: SampleMeta; text: string }>(
    "read_sample",
    { id },
  );
  return { ...meta, content: text };
}

export async function addSample(opts: {
  name: string;
  kind: SampleKind;
  bytes: Uint8Array;
  mimeType?: string | null;
  extractedText?: string | null;
}): Promise<SampleMeta> {
  return invoke<SampleMeta>("add_sample", {
    input: {
      name: opts.name,
      kind: opts.kind,
      bytes: Array.from(opts.bytes),
      mimeType: opts.mimeType ?? null,
      extractedText: opts.extractedText ?? null,
    },
  });
}

export async function updateSample(
  id: string,
  patch: { name?: string; text?: string },
): Promise<SampleMeta> {
  return invoke<SampleMeta>("update_sample", {
    id,
    input: {
      name: patch.name ?? null,
      text: patch.text ?? null,
    },
  });
}

export async function deleteSample(id: string): Promise<void> {
  await invoke("delete_sample", { id });
}

/* settings */

export async function loadSettings(): Promise<Settings> {
  const [base, apiKey] = await Promise.all([
    invoke<{ temperature: number; onboardingComplete?: boolean }>(
      "read_settings",
    ),
    invoke<string | null>("get_api_key"),
  ]);
  return {
    ...DEFAULT_SETTINGS,
    temperature:
      typeof base.temperature === "number"
        ? base.temperature
        : DEFAULT_SETTINGS.temperature,
    onboardingComplete: base.onboardingComplete ?? false,
    apiKey: apiKey ?? "",
  };
}

export async function saveSettings(s: Settings): Promise<void> {
  const tasks: Promise<unknown>[] = [
    invoke("write_settings", {
      settings: {
        temperature: s.temperature,
        onboardingComplete: s.onboardingComplete,
      },
    }),
  ];
  tasks.push(
    s.apiKey
      ? invoke("set_api_key", { value: s.apiKey })
      : invoke("delete_api_key"),
  );
  await Promise.all(tasks);
}

/* profile */

type ProfileMetaRaw = {
  model: string | null;
  generatedAt: number | null;
  sourceSampleIds: string[];
  lastMachineHash: string | null;
};

type ProfileReadRaw = {
  markdown: string;
  meta: ProfileMetaRaw;
  userEdited: boolean;
  exists: boolean;
};

export async function loadProfile(): Promise<VoiceProfile | null> {
  const res = await invoke<ProfileReadRaw>("read_profile");
  if (!res.exists || !res.markdown.trim()) return null;
  return {
    profile: res.markdown,
    sampleIds: res.meta.sourceSampleIds ?? [],
    generatedAt: res.meta.generatedAt ?? 0,
    model: res.meta.model ?? "",
    userEdited: res.userEdited,
  };
}

export async function saveProfile(
  p: VoiceProfile,
  force = false,
): Promise<void> {
  await invoke("write_profile", {
    input: {
      markdown: p.profile,
      meta: {
        model: p.model || null,
        generatedAt: p.generatedAt || null,
        sourceSampleIds: p.sampleIds,
      },
      force,
    },
  });
}

export async function clearProfile(): Promise<void> {
  await invoke("clear_profile");
}

/* corrections */

type DigestReadRaw = {
  markdown: string;
  meta: {
    generatedAt: number | null;
    sourceCorrectionIds: string[];
    lastMachineHash: string | null;
  };
  userEdited: boolean;
  exists: boolean;
};

export async function loadCorrections(): Promise<CorrectionsLog> {
  const [list, digest] = await Promise.all([
    invoke<Correction[]>("list_corrections"),
    invoke<DigestReadRaw>("read_corrections_digest"),
  ]);
  return {
    corrections: list,
    digest: digest.exists ? digest.markdown : "",
    digestUpdatedAt: digest.meta.generatedAt ?? 0,
    digestUserEdited: digest.userEdited,
  };
}

export async function appendCorrection(c: Correction): Promise<Correction> {
  return invoke<Correction>("append_correction", { correction: c });
}

export async function deleteCorrection(id: string): Promise<void> {
  await invoke("delete_correction", { id });
}

export async function saveCorrectionsDigest(opts: {
  markdown: string;
  sourceCorrectionIds: string[];
  force?: boolean;
}): Promise<void> {
  await invoke("write_corrections_digest", {
    input: {
      markdown: opts.markdown,
      meta: { sourceCorrectionIds: opts.sourceCorrectionIds },
      force: opts.force ?? false,
    },
  });
}

export async function clearCorrections(): Promise<void> {
  const list = await invoke<Correction[]>("list_corrections");
  await Promise.all(list.map((c) => deleteCorrection(c.id)));
  await saveCorrectionsDigest({
    markdown: "",
    sourceCorrectionIds: [],
    force: true,
  });
}

/* history */

export async function archiveGeneration(
  input: ArchiveGenerationInput,
): Promise<string> {
  return invoke<string>("archive_generation", {
    input: {
      request: input.request,
      source: input.source ?? null,
      systemPrompt: input.systemPrompt,
      draftV1: input.draftV1,
      violationsV1: input.violationsV1,
      draftV2: input.draftV2 ?? null,
      violationsV2: input.violationsV2 ?? null,
      finalText: input.finalText,
      meta: input.meta,
    },
  });
}

export async function listGenerations(): Promise<GenerationSummary[]> {
  return invoke<GenerationSummary[]>("list_generations");
}

export async function readGeneration(id: string): Promise<GenerationFull> {
  return invoke<GenerationFull>("read_generation", { id });
}

export async function deleteGeneration(id: string): Promise<void> {
  await invoke("delete_generation", { id });
}

/* misc */

export async function openDataDir(): Promise<void> {
  await invoke("open_data_dir");
}
