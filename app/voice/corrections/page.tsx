"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Banner,
  Card,
  Eyebrow,
  GhostButton,
  Hint,
  PageHeader,
  SecondaryButton,
} from "../_components/ui";
import {
  consolidateDigest,
  formatRelativeTime,
  removeCorrection,
} from "../_lib/corrections";
import {
  clearCorrections,
  loadCorrections,
  loadSettings,
  saveCorrections,
} from "../_lib/storage";
import type { Correction, CorrectionsLog, Settings } from "../_lib/types";

export default function CorrectionsPage() {
  const [log, setLog] = useState<CorrectionsLog | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [status, setStatus] = useState<{
    state: "idle" | "rebuilding" | "error";
    message?: string;
  }>({ state: "idle" });
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    setLog(loadCorrections());
    setSettings(loadSettings());
  }, []);

  async function handleRebuildDigest() {
    if (!log || !settings?.apiKey) {
      setStatus({
        state: "error",
        message: "Add your Gemini API key in Settings first.",
      });
      return;
    }
    if (log.corrections.length === 0) {
      setStatus({
        state: "error",
        message: "No corrections to consolidate.",
      });
      return;
    }
    setStatus({ state: "rebuilding" });
    try {
      const digest = await consolidateDigest({
        apiKey: settings.apiKey,
        model: settings.model,
        corrections: log.corrections,
      });
      const next: CorrectionsLog = {
        ...log,
        digest,
        digestUpdatedAt: Date.now(),
      };
      saveCorrections(next);
      setLog(next);
      setStatus({ state: "idle" });
    } catch (err) {
      setStatus({
        state: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function handleDelete(id: string) {
    if (!log) return;
    if (!confirm("Delete this correction? Future generations will lose this lesson.")) return;
    const next = removeCorrection(log, id);
    saveCorrections(next);
    setLog(next);
    if (expandedId === id) setExpandedId(null);
  }

  function handleClearAll() {
    if (!confirm("Clear ALL corrections? The digest will be wiped too. This cannot be undone.")) return;
    clearCorrections();
    setLog({ corrections: [], digest: "", digestUpdatedAt: 0 });
  }

  if (!log) {
    return (
      <div className="pt-14 pb-16">
        <p className="text-[14px] text-muted">Loading…</p>
      </div>
    );
  }

  const hasCorrections = log.corrections.length > 0;
  const hasDigest = log.digest.trim().length > 0;

  return (
    <div className="pt-14 pb-16 space-y-12">
      <PageHeader
        eyebrow="Corrections"
        title="Lessons the model has learned from your rewrites"
        description="Every time you submit a rewrite on the Generate page, the model extracts concrete lessons about what you want. Those lessons get consolidated into a digest that's injected into every future generation."
      />

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-4">
          <div className="space-y-1">
            <Eyebrow>Active digest</Eyebrow>
            <p className="text-[13px] text-muted leading-relaxed max-w-prose">
              This text is injected at the top of every generation&apos;s system
              prompt, right after the voice profile. The model treats it as explicit
              instructions about what you want.
            </p>
          </div>
          {log.digestUpdatedAt > 0 && (
            <span className="font-mono text-[11px] text-muted shrink-0">
              {formatRelativeTime(log.digestUpdatedAt)}
            </span>
          )}
        </div>
        <Card className="space-y-4">
          {hasDigest ? (
            <p className="text-[14.5px] leading-relaxed whitespace-pre-wrap text-foreground/90">
              {log.digest}
            </p>
          ) : (
            <p className="text-[14px] text-muted leading-relaxed italic">
              No digest yet. Submit a rewrite on the{" "}
              <Link
                href="/voice/generate"
                className="text-foreground underline underline-offset-4 not-italic"
              >
                Generate page
              </Link>{" "}
              to seed one.
            </p>
          )}
          {hasCorrections && (
            <div className="flex items-center gap-2 pt-1 flex-wrap">
              <SecondaryButton
                onClick={handleRebuildDigest}
                disabled={status.state === "rebuilding"}
              >
                {status.state === "rebuilding" ? "Rebuilding…" : "Rebuild digest"}
              </SecondaryButton>
              <GhostButton onClick={handleClearAll}>Clear all corrections</GhostButton>
            </div>
          )}
          {status.state === "error" && status.message && (
            <Banner tone="error">{status.message}</Banner>
          )}
        </Card>
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <Eyebrow>History</Eyebrow>
          <p className="text-[14px] text-foreground/80">
            <span className="font-medium">
              {log.corrections.length}{" "}
              {log.corrections.length === 1 ? "correction" : "corrections"}
            </span>
            {log.corrections.length > 0 && (
              <span className="text-muted">
                {" · "}
                {log.corrections.reduce((a, c) => a + c.lessons.length, 0)} lessons total
              </span>
            )}
          </p>
        </div>

        {!hasCorrections && (
          <Card className="text-center py-10">
            <p className="text-[14px] text-muted">
              No corrections yet. Head to{" "}
              <Link
                href="/voice/generate"
                className="text-foreground underline underline-offset-4"
              >
                Generate
              </Link>
              , draft something, then submit a rewrite to start teaching the model
              your preferences.
            </p>
          </Card>
        )}

        <ul className="space-y-3">
          {log.corrections.map((c) => (
            <CorrectionCard
              key={c.id}
              correction={c}
              expanded={expandedId === c.id}
              onToggle={() => setExpandedId(expandedId === c.id ? null : c.id)}
              onDelete={() => handleDelete(c.id)}
            />
          ))}
        </ul>

        {hasCorrections && (
          <Hint>
            Recent corrections weigh slightly more in the digest. Older ones still
            count, just less.
          </Hint>
        )}
      </section>
    </div>
  );
}

function CorrectionCard({
  correction,
  expanded,
  onToggle,
  onDelete,
}: {
  correction: Correction;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const shortRequest =
    correction.request.length > 96
      ? correction.request.slice(0, 96) + "…"
      : correction.request || "(no request recorded)";

  return (
    <Card as="li" className="space-y-3">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-[14px] font-medium tracking-tight2 truncate">
          {shortRequest}
        </h3>
        <span className="font-mono text-[11px] text-muted shrink-0">
          {formatRelativeTime(correction.createdAt)}
        </span>
      </div>
      <div>
        <p className="text-[12px] text-muted uppercase tracking-eyebrow mb-2">
          {correction.lessons.length}{" "}
          {correction.lessons.length === 1 ? "lesson" : "lessons"}
        </p>
        <ul className="space-y-1.5">
          {correction.lessons.map((lesson, i) => (
            <li
              key={i}
              className="text-[13.5px] text-foreground/85 leading-relaxed pl-4 relative"
            >
              <span className="absolute left-0 top-[8px] inline-block h-1 w-1 rounded-full bg-accent" />
              {lesson}
            </li>
          ))}
        </ul>
      </div>
      {expanded && (
        <div className="space-y-4 pt-2 border-t border-hairline">
          <div className="space-y-1.5">
            <p className="text-[11px] text-muted uppercase tracking-eyebrow">
              AI draft
            </p>
            <p className="text-[13px] text-foreground/75 leading-relaxed whitespace-pre-wrap">
              {correction.draft}
            </p>
          </div>
          <div className="space-y-1.5">
            <p className="text-[11px] text-muted uppercase tracking-eyebrow">
              Your rewrite
            </p>
            <p className="text-[13px] text-foreground/90 leading-relaxed whitespace-pre-wrap">
              {correction.rewrite}
            </p>
          </div>
          {correction.note && (
            <div className="space-y-1.5">
              <p className="text-[11px] text-muted uppercase tracking-eyebrow">
                Your note
              </p>
              <p className="text-[13px] text-foreground/80 leading-relaxed italic">
                {correction.note}
              </p>
            </div>
          )}
        </div>
      )}
      <div className="flex items-center gap-4 pt-1">
        <GhostButton onClick={onToggle}>
          {expanded ? "Hide draft + rewrite" : "Show draft + rewrite"}
        </GhostButton>
        <GhostButton
          onClick={onDelete}
          className="!text-red-600 dark:!text-red-400 hover:!text-red-700 dark:hover:!text-red-300"
        >
          Delete
        </GhostButton>
      </div>
    </Card>
  );
}
