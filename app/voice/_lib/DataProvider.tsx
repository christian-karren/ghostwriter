"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  loadCorrections,
  loadProfile,
  loadSamples,
  loadSettings,
} from "./storage";
import type {
  CorrectionsLog,
  SampleMeta,
  Settings,
  VoiceProfile,
} from "./types";

type DataContextValue = {
  samples: SampleMeta[];
  settings: Settings;
  profile: VoiceProfile | null;
  corrections: CorrectionsLog;
  refreshSamples: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshCorrections: () => Promise<void>;
  refreshAll: () => Promise<void>;
};

const DataContext = createContext<DataContextValue | null>(null);

type Phase =
  | { state: "loading" }
  | { state: "ready"; value: DataContextValue }
  | { state: "error"; message: string };

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [samples, setSamples] = useState<SampleMeta[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [profile, setProfile] = useState<VoiceProfile | null>(null);
  const [corrections, setCorrections] = useState<CorrectionsLog | null>(null);
  const [phase, setPhase] = useState<Phase>({ state: "loading" });

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

  const refreshAll = useCallback(async () => {
    const [s, set, p, c] = await Promise.all([
      loadSamples(),
      loadSettings(),
      loadProfile(),
      loadCorrections(),
    ]);
    setSamples(s);
    setSettings(set);
    setProfile(p);
    setCorrections(c);
  }, []);

  useEffect(() => {
    if (!isTauri()) {
      setPhase({
        state: "error",
        message:
          "Ghostwriter must be run as a desktop app. Use `npm run tauri:dev` for development or open the built `.app` bundle.",
      });
      return;
    }
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

  const value = useMemo<DataContextValue | null>(() => {
    if (settings === null || corrections === null) return null;
    return {
      samples,
      settings,
      profile,
      corrections,
      refreshSamples,
      refreshSettings,
      refreshProfile,
      refreshCorrections,
      refreshAll,
    };
  }, [
    samples,
    settings,
    profile,
    corrections,
    refreshSamples,
    refreshSettings,
    refreshProfile,
    refreshCorrections,
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
