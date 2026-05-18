"use client";

import { useEffect, useState } from "react";
import { loadSettings, saveSettings } from "../_lib/storage";
import type { Settings } from "../_lib/types";
import {
  Card,
  FieldLabel,
  Hint,
  PageHeader,
  inputClass,
} from "../_components/ui";

const MODEL_OPTIONS = [
  { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash", note: "Free tier, fast" },
  { value: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite", note: "Fastest" },
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash", note: "Newer, if available" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro", note: "Slower, smarter" },
  { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash", note: "Legacy fallback" },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [revealKey, setRevealKey] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  function update(patch: Partial<Settings>) {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1200);
  }

  if (!settings) {
    return (
      <div className="pt-14 pb-16">
        <p className="text-[14px] text-muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="pt-14 pb-16 space-y-12">
      <PageHeader
        eyebrow="Settings"
        title="Your configuration"
        description={
          <>
            Everything lives in your browser&apos;s localStorage. Nothing leaves your machine
            except calls to the Gemini API itself.
          </>
        }
      />

      <Card className="space-y-4">
        <div className="flex items-baseline justify-between">
          <div className="space-y-0.5">
            <h2 className="text-[14px] font-medium tracking-tight2">Gemini API key</h2>
            <p className="text-[12px] text-muted">Required. Stored only in your browser.</p>
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
              value={settings.apiKey}
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
        <div className="space-y-0.5">
          <h2 className="text-[14px] font-medium tracking-tight2">Model</h2>
          <p className="text-[12px] text-muted">
            If one errors out, try another. Google rotates availability.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-2">
          {MODEL_OPTIONS.map((m) => {
            const active = settings.model === m.value;
            return (
              <button
                key={m.value}
                onClick={() => update({ model: m.value })}
                className={`text-left rounded-xl border px-3.5 py-3 transition-all ${
                  active
                    ? "border-accent/40 bg-accent-soft ring-2 ring-accent/15"
                    : "border-hairline hover:border-hairline-strong hover:bg-surface"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[13.5px] font-medium tracking-tight2">{m.label}</span>
                  {active && (
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
                  )}
                </div>
                <p className="mt-1 text-[11.5px] text-muted">{m.note}</p>
              </button>
            );
          })}
        </div>
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
            {settings.temperature.toFixed(2)}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={settings.temperature}
          onChange={(e) => update({ temperature: Number(e.target.value) })}
          className="w-full accent-[var(--accent)]"
        />
        <div className="flex justify-between text-[11px] font-mono text-muted">
          <span>0.00</span>
          <span>0.50</span>
          <span>1.00</span>
        </div>
      </Card>
    </div>
  );
}
