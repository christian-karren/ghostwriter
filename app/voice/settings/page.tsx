"use client";

import { useState } from "react";

import { openDataDir, saveSettings } from "../_lib/storage";
import { useData } from "../_lib/DataProvider";
import type { Settings } from "../_lib/types";
import {
  Card,
  FieldLabel,
  Hint,
  PageHeader,
  SecondaryButton,
  inputClass,
} from "../_components/ui";

export default function SettingsPage() {
  const { settings, refreshSettings } = useData();
  const [draft, setDraft] = useState<Settings>(settings);
  const [revealKey, setRevealKey] = useState(false);
  const [saved, setSaved] = useState(false);

  async function update(patch: Partial<Settings>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    await saveSettings(next);
    await refreshSettings();
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1200);
  }

  return (
    <div className="pt-14 pb-16 space-y-12">
      <PageHeader
        eyebrow="Settings"
        title="Your configuration"
        description={
          <>
            The Gemini API key is stored in your macOS Keychain. Everything else lives
            on disk in your app data folder.
          </>
        }
      />

      <Card className="space-y-4">
        <div className="flex items-baseline justify-between">
          <div className="space-y-0.5">
            <h2 className="text-[14px] font-medium tracking-tight2">Gemini API key</h2>
            <p className="text-[12px] text-muted">
              Required. Stored in macOS Keychain, never on disk.
            </p>
          </div>
          {saved && (
            <span className="inline-flex items-center gap-1.5 text-[11.5px] text-accent">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
              Saved
            </span>
          )}
        </div>
        <div className="space-y-1.5">
          <FieldLabel htmlFor="api-key">Key</FieldLabel>
          <div className="relative">
            <input
              id="api-key"
              type={revealKey ? "text" : "password"}
              value={draft.apiKey}
              onChange={(e) => update({ apiKey: e.target.value.trim() })}
              placeholder="AIza..."
              spellCheck={false}
              autoComplete="off"
              className={`${inputClass} pr-16 font-mono text-[13px]`}
            />
            <button
              onClick={() => setRevealKey((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-md text-[11px] text-muted hover:text-foreground hover:bg-surface transition-colors"
            >
              {revealKey ? "Hide" : "Show"}
            </button>
          </div>
        </div>
        <Hint>
          Get a free key at{" "}
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground underline decoration-hairline-strong underline-offset-4 hover:decoration-accent"
          >
            aistudio.google.com/apikey
          </a>
          . Sign in with a Google account and click &ldquo;Create API key&rdquo;.
        </Hint>
      </Card>

      <Card className="space-y-4">
        <div className="flex items-baseline justify-between">
          <div className="space-y-0.5">
            <h2 className="text-[14px] font-medium tracking-tight2">Temperature</h2>
            <p className="text-[12px] text-muted">
              Lower stays close to your samples. Higher takes more creative risk.
            </p>
          </div>
          <span className="font-mono text-[14px] tabular-nums text-foreground/90">
            {draft.temperature.toFixed(2)}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={draft.temperature}
          onChange={(e) => update({ temperature: Number(e.target.value) })}
          className="w-full accent-[var(--accent)]"
        />
        <div className="flex justify-between text-[11px] font-mono text-muted">
          <span>0.00</span>
          <span>0.50</span>
          <span>1.00</span>
        </div>
      </Card>

      <Card className="space-y-4">
        <div className="space-y-0.5">
          <h2 className="text-[14px] font-medium tracking-tight2">Your data folder</h2>
          <p className="text-[12px] text-muted">
            Samples, voice profile, corrections, and generation history all live on disk
            as plain files. Edit them in your favorite editor, run git on the folder,
            back them up however you want.
          </p>
        </div>
        <div>
          <SecondaryButton onClick={openDataDir}>Open data folder</SecondaryButton>
        </div>
      </Card>
    </div>
  );
}
