"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { extractVoiceProfile, isProfileStale } from "./profile";
import {
  hydrateSamples,
  listGenerations,
  loadCorrections,
  loadProfile,
  loadSamples,
  loadSettings,
  saveProfile,
} from "./storage";
import type {
  CorrectionsLog,
  GenerationSummary,
  LastDraft,
  SampleMeta,
  Settings,
  VoiceProfile,
} from "./types";

type DataContextValue = {
  samples: SampleMeta[];
  settings: Settings;
  profile: VoiceProfile | null;
  corrections: CorrectionsLog;
  profileSyncing: boolean;
  profileSyncError: string | null;
  generations: GenerationSummary[];
  lastDraft: LastDraft | null;
  setLastDraft: (draft: LastDraft | null) => void;
  refreshSamples: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshCorrections: () => Promise<void>;
  refreshGenerations: () => Promise<void>;
  refreshAll: () => Promise<void>;
};

const DataContext = createContext<DataContextValue | null>(null);

type Phase =
  | { state: "loading" }
  | { state: "ready"; value: DataContextValue }
  | { state: "error"; message: string };

const AUTO_EXTRACT_DEBOUNCE_MS = 1500;

export function DataProvider({ children }: { children: ReactNode }) {
  const [samples, setSamples] = useState<SampleMeta[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [profile, setProfile] = useState<VoiceProfile | null>(null);
  const [corrections, setCorrections] = useState<CorrectionsLog | null>(null);
  const [generations, setGenerations] = useState<GenerationSummary[]>([]);
  const [lastDraft, setLastDraft] = useState<LastDraft | null>(null);
  const [profileSyncing, setProfileSyncing] = useState(false);
  const [profileSyncError, setProfileSyncError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ state: "loading" });
  const inFlightRef = useRef(false);

  const refreshSamples = useCallback(async () => {
    setSamples(await loadSamples());
  }, []);
  const refreshSettings = useCallback(async () => {
    setSettings(await loadSettings());
  }, []);
  const refreshProfile = useCallback(async () => {
    setProfile(await loadProfile());
  }, []);
  const refreshCorrections = useCallback(async () => {
    setCorrections(await loadCorrections());
  }, []);
  const refreshGenerations = useCallback(async () => {
    setGenerations(await listGenerations());
  }, []);

  const refreshAll = useCallback(async () => {
    const [s, set, p, c, g] = await Promise.all([
      loadSamples(),
      loadSettings(),
      loadProfile(),
      loadCorrections(),
      listGenerations(),
    ]);
    setSamples(s);
    setSettings(set);
    setProfile(p);
    setCorrections(c);
    setGenerations(g);
  }, []);

  useEffect(() => {
    let cancelled = false;
    refreshAll()
      .then(() => {
        if (!cancelled) setPhase({ state: "ready", value: null as never });
      })
      .catch((err) => {
        if (!cancelled) {
          setPhase({
            state: "error",
            message: err instanceof Error ? err.message : String(err),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [refreshAll]);

  // Auto-extract voice profile when samples change.
  // Skips if: no API key, no samples, profile is up to date, or user hand-edited it.
  // Debounced so rapid sample uploads only trigger one extraction.
  useEffect(() => {
    if (!settings?.apiKey) return;
    if (samples.length === 0) return;
    if (profile && !isProfileStale(profile, samples)) return;
    if (profile?.userEdited) return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      if (cancelled || inFlightRef.current) return;
      inFlightRef.current = true;
      setProfileSyncing(true);
      setProfileSyncError(null);
      try {
        const fullSamples = await hydrateSamples(samples);
        if (cancelled) return;
        const next = await extractVoiceProfile({
          apiKey: settings.apiKey,
          samples: fullSamples,
        });
        if (cancelled) return;
        await saveProfile(next, false);
        await refreshProfile();
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setProfileSyncError(message);
        console.error("Auto-extract profile failed:", err);
      } finally {
        inFlightRef.current = false;
        if (!cancelled) setProfileSyncing(false);
      }
    }, AUTO_EXTRACT_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [samples, settings?.apiKey, profile, refreshProfile]);

  const value = useMemo<DataContextValue | null>(() => {
    if (settings === null || corrections === null) return null;
    return {
      samples,
      settings,
      profile,
      corrections,
      profileSyncing,
      profileSyncError,
      generations,
      lastDraft,
      setLastDraft,
      refreshSamples,
      refreshSettings,
      refreshProfile,
      refreshCorrections,
      refreshGenerations,
      refreshAll,
    };
  }, [
    samples,
    settings,
    profile,
    corrections,
    profileSyncing,
    profileSyncError,
    generations,
    lastDraft,
    refreshSamples,
    refreshSettings,
    refreshProfile,
    refreshCorrections,
    refreshGenerations,
    refreshAll,
  ]);

  if (phase.state === "error") {
    return <ErrorScreen message={phase.message} />;
  }

  if (phase.state === "loading" || !value) {
    return <LoadingScreen />;
  }

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) {
    throw new Error("useData must be called inside a <DataProvider>");
  }
  return ctx;
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex items-center gap-3 text-[13px] text-muted">
        <span className="inline-block h-2 w-2 rounded-full bg-accent animate-pulse" />
        Loading your voice
      </div>
    </div>
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-lg space-y-3 text-center">
        <h1 className="text-lg font-medium tracking-tight">Ghostwriter</h1>
        <p className="text-[13.5px] text-foreground/85 leading-relaxed">
          {message}
        </p>
      </div>
    </div>
  );
}
