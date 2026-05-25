"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  AccentButton,
  Banner,
  Card,
  Eyebrow,
  PageHeader,
  SecondaryButton,
  textareaClass,
} from "../_components/ui";
import { DEFAULT_MODEL, generateText } from "../_lib/gemini";
import {
  buildRetryPrompt,
  buildSystemPrompt,
  buildUserPrompt,
} from "../_lib/prompt";
import {
  archiveGeneration,
  deleteGeneration,
  hydrateSamples,
  readGeneration,
} from "../_lib/storage";
import { recordCorrection } from "../_lib/corrections";
import { extractPdfText, isPdfFile } from "../_lib/pdf";
import {
  checkLength,
  findViolations,
  parseTargetWordCount,
  scrubDashes,
  type LengthFeedback,
} from "../_lib/styleGuard";
import { useData } from "../_lib/DataProvider";
import { formatRelativeTime } from "../_lib/profile";
import type {
  GenerationFull,
  LastDraft,
  Sample,
  Violation,
} from "../_lib/types";

type Status =
  | { state: "idle" }
  | { state: "generating"; attempt: number }
  | { state: "done" }
  | { state: "error"; message: string };

type UploadStatus =
  | { state: "idle" }
  | { state: "processing"; message: string }
  | { state: "error"; message: string };

type AttachedFile = {
  id: string;
  name: string;
  text: string;
};

type OverlaySource =
  | { kind: "latest"; draft: LastDraft }
  | { kind: "historical"; generation: GenerationFull };

const LOW_SAMPLE_WORDS = 300;
const TRUNCATION_REASONS = new Set(["MAX_TOKENS", "LENGTH"]);
const MAX_ATTEMPTS = 5;

const PROMPT_PLACEHOLDERS = [
  "Write an essay about Moby Dick…",
  "Write a technical article about context in agent harnesses…",
  "Write a newsletter on behalf of my non-profit…",
];
const PLACEHOLDER_INTERVAL_MS = 5000;

type Attempt = {
  text: string;
  scrubbed: string;
  violations: Violation[];
  length: LengthFeedback | null;
  finishReason: string;
};

function attemptScore(a: Attempt): number {
  const lengthPenalty =
    a.length && a.length.status !== "ok" ? Math.min(a.length.delta, 500) : 0;
  return a.violations.length * 100 + lengthPenalty;
}

export default function GeneratePage() {
  const {
    samples,
    settings,
    profile,
    corrections,
    generations,
    lastDraft,
    setLastDraft,
    refreshCorrections,
    refreshGenerations,
  } = useData();

  const [request, setRequest] = useState("");
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [placeholderPhase, setPlaceholderPhase] = useState<
    "idle" | "exiting" | "entering"
  >("idle");
  const [requestFocused, setRequestFocused] = useState(false);
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>({
    state: "idle",
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Overlay state
  const [overlayId, setOverlayId] = useState<null | "latest" | string>(null);
  const [overlaySource, setOverlaySource] = useState<OverlaySource | null>(null);
  const [overlayLoading, setOverlayLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [rewriteOpen, setRewriteOpen] = useState(false);
  const [rewriteText, setRewriteText] = useState("");
  const [rewriteNote, setRewriteNote] = useState("");
  const [rewriteStatus, setRewriteStatus] = useState<{
    state: "idle" | "submitting" | "done" | "error";
    message?: string;
    lessons?: string[];
  }>({ state: "idle" });

  useEffect(() => {
    if (request.length > 0 || requestFocused) {
      setPlaceholderPhase("idle");
      return;
    }
    const timers: number[] = [];
    const intervalId = window.setInterval(() => {
      setPlaceholderPhase("exiting");
      timers.push(
        window.setTimeout(() => {
          setPlaceholderIndex((i) => (i + 1) % PROMPT_PLACEHOLDERS.length);
          setPlaceholderPhase("entering");
          timers.push(
            window.setTimeout(() => {
              setPlaceholderPhase("idle");
            }, 30),
          );
        }, 260),
      );
    }, PLACEHOLDER_INTERVAL_MS);
    return () => {
      window.clearInterval(intervalId);
      timers.forEach((t) => window.clearTimeout(t));
      setPlaceholderPhase("idle");
    };
  }, [request, requestFocused]);

  // Resolve overlay content when id changes
  useEffect(() => {
    if (overlayId === null) {
      setOverlaySource(null);
      return;
    }
    if (overlayId === "latest") {
      if (lastDraft) {
        setOverlaySource({ kind: "latest", draft: lastDraft });
      }
      return;
    }
    let cancelled = false;
    setOverlayLoading(true);
    readGeneration(overlayId)
      .then((gen) => {
        if (cancelled) return;
        setOverlaySource({ kind: "historical", generation: gen });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("read generation failed", err);
        setOverlaySource(null);
      })
      .finally(() => {
        if (!cancelled) setOverlayLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [overlayId, lastDraft]);

  function resetOverlayState() {
    setCopied(false);
    setRewriteOpen(false);
    setRewriteText("");
    setRewriteNote("");
    setRewriteStatus({ state: "idle" });
  }

  function closeOverlay() {
    setOverlayId(null);
    setOverlaySource(null);
    resetOverlayState();
  }

  function openHistory(id: string) {
    resetOverlayState();
    setOverlayId(id);
  }

  async function handleUploadFiles(fileList: FileList | File[]) {
    const list = Array.from(fileList);
    if (list.length === 0) return;
    setUploadStatus({
      state: "processing",
      message: `Reading ${list.length} ${list.length === 1 ? "file" : "files"}…`,
    });

    const errors: string[] = [];
    const next: AttachedFile[] = [];
    for (const file of list) {
      try {
        const cleanName = file.name.replace(/\.(pdf|txt|md|markdown)$/i, "");
        let text: string;
        if (isPdfFile(file)) {
          text = await extractPdfText(file);
        } else {
          text = await file.text();
        }
        if (!text.trim()) {
          errors.push(`${file.name}: empty`);
          continue;
        }
        next.push({
          id: crypto.randomUUID(),
          name: cleanName,
          text,
        });
      } catch (err) {
        errors.push(
          `${file.name}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    if (fileInputRef.current) fileInputRef.current.value = "";

    if (next.length > 0) {
      setAttachments((prev) => [...prev, ...next]);
      setUploadStatus({ state: "idle" });
    } else if (errors.length > 0) {
      setUploadStatus({ state: "error", message: errors.join(" | ") });
    } else {
      setUploadStatus({ state: "idle" });
    }
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  async function handleGenerate() {
    if (!settings.apiKey) {
      setStatus({
        state: "error",
        message: "No Gemini API key. Add one in Settings.",
      });
      return;
    }
    if (!request.trim()) {
      setStatus({ state: "error", message: "Tell the model what to write." });
      return;
    }

    setStatus({ state: "generating", attempt: 1 });

    const startedAt = performance.now();
    const target = parseTargetWordCount(request);
    const sourceMaterial =
      attachments.length > 0
        ? attachments
            .map((a) => `## ${a.name}\n\n${a.text.trim()}`)
            .join("\n\n---\n\n")
        : "";

    try {
      const fullSamples: Sample[] = await hydrateSamples(samples);

      const systemPrompt = buildSystemPrompt(
        fullSamples,
        profile?.profile,
        corrections.digest,
      );
      const userPrompt = buildUserPrompt(request, sourceMaterial);

      const allAttempts: Attempt[] = [];
      let best: Attempt | null = null;

      async function runOnce(
        promptText: string,
        attempt: number,
      ): Promise<Attempt> {
        setStatus({ state: "generating", attempt });
        const result = await generateText({
          apiKey: settings.apiKey,
          systemPrompt,
          userPrompt: promptText,
          temperature: settings.temperature,
        });
        const scrubbed = scrubDashes(result.text);
        const violations = findViolations(scrubbed);
        const length = target ? checkLength(scrubbed, target) : null;
        return {
          text: result.text,
          scrubbed,
          violations,
          length,
          finishReason: result.finishReason,
        };
      }

      const first = await runOnce(userPrompt, 1);
      allAttempts.push(first);
      best = first;

      let attemptNum = 1;
      while (
        attemptNum < MAX_ATTEMPTS &&
        (best.violations.length > 0 ||
          (best.length && best.length.status !== "ok"))
      ) {
        attemptNum += 1;
        const retryPrompt = buildRetryPrompt(
          request,
          sourceMaterial,
          best.text,
          best.violations,
          best.length,
        );
        const next = await runOnce(retryPrompt, attemptNum);
        allAttempts.push(next);
        if (attemptScore(next) < attemptScore(best)) {
          best = next;
        }
      }

      const elapsed = Math.round(performance.now() - startedAt);
      const finalText = best.scrubbed;
      const attemptsUsed = allAttempts.length;
      const truncated = TRUNCATION_REASONS.has(best.finishReason);

      let archivedId: string | null = null;
      try {
        archivedId = await archiveGeneration({
          request,
          source: sourceMaterial || undefined,
          systemPrompt,
          draftV1: allAttempts[0].text,
          violationsV1: allAttempts[0].violations,
          draftV2:
            allAttempts.length > 1
              ? allAttempts[allAttempts.length - 1].text
              : undefined,
          violationsV2:
            allAttempts.length > 1
              ? allAttempts[allAttempts.length - 1].violations
              : undefined,
          finalText,
          meta: {
            model: DEFAULT_MODEL,
            temperature: settings.temperature,
            finishReason: best.finishReason,
            ms: elapsed,
            accepted: false,
            retried: allAttempts.length > 1,
          },
        });
      } catch (err) {
        console.error("archive failed", err);
      }

      const draft: LastDraft = {
        archivedId,
        request,
        output: finalText,
        attemptsUsed,
        truncated,
        finishedAt: Date.now(),
      };
      setLastDraft(draft);
      setStatus({ state: "done" });
      resetOverlayState();
      setOverlayId("latest");
      await refreshGenerations();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus({ state: "error", message });
    }
  }

  function openRewrite() {
    if (!overlaySource) return;
    const initial =
      overlaySource.kind === "latest"
        ? overlaySource.draft.output
        : overlaySource.generation.finalText;
    setRewriteText(initial);
    setRewriteNote("");
    setRewriteOpen(true);
    setRewriteStatus({ state: "idle" });
  }

  function closeRewrite() {
    setRewriteOpen(false);
    setRewriteStatus({ state: "idle" });
  }

  async function submitRewrite() {
    if (!overlaySource) return;
    if (!settings.apiKey) {
      setRewriteStatus({
        state: "error",
        message: "No Gemini API key. Add one in Settings.",
      });
      return;
    }
    const originalRequest =
      overlaySource.kind === "latest"
        ? overlaySource.draft.request
        : overlaySource.generation.request;
    const originalDraft =
      overlaySource.kind === "latest"
        ? overlaySource.draft.output
        : overlaySource.generation.finalText;
    if (!rewriteText.trim()) {
      setRewriteStatus({ state: "error", message: "Rewrite is empty." });
      return;
    }
    if (rewriteText.trim() === originalDraft.trim()) {
      setRewriteStatus({
        state: "error",
        message: "The rewrite is identical to the draft. Edit it first.",
      });
      return;
    }
    setRewriteStatus({ state: "submitting" });
    try {
      const { correction } = await recordCorrection({
        apiKey: settings.apiKey,
        request: originalRequest,
        draft: originalDraft,
        rewrite: rewriteText,
        note: rewriteNote,
      });
      await refreshCorrections();
      setRewriteStatus({ state: "done", lessons: correction.lessons });
    } catch (err) {
      setRewriteStatus({
        state: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function handleCopy() {
    if (!overlaySource) return;
    const text =
      overlaySource.kind === "latest"
        ? overlaySource.draft.output
        : overlaySource.generation.finalText;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  async function handleDeleteHistory(id: string) {
    if (!confirm("Delete this generation from history?")) return;
    try {
      await deleteGeneration(id);
      await refreshGenerations();
      if (overlayId === id) closeOverlay();
    } catch (err) {
      console.error("delete generation failed", err);
    }
  }

  const hasKey = settings.apiKey.length > 0;
  const hasSamples = samples.length > 0;
  const totalSampleWords = samples.reduce((acc, s) => acc + s.wordCount, 0);
  const lowSampleVolume = hasSamples && totalSampleWords < LOW_SAMPLE_WORDS;
  const isWorking = status.state === "generating";
  const isUploading = uploadStatus.state === "processing";

  return (
    <>
      <HistorySidebar
        items={generations}
        activeId={overlayId}
        onSelect={openHistory}
        onDelete={handleDeleteHistory}
      />

      <div className="pt-12 pb-16 space-y-8">
        <div className="max-w-3xl mx-auto px-6 space-y-8">
          <PageHeader align="center" title="Draft something in your voice" />

          <div className="space-y-3">
            {!hasKey && (
              <Banner tone="error">
                <span>
                  You need a Gemini API key first.{" "}
                  <Link
                    href="/voice/settings"
                    className="font-medium underline underline-offset-4"
                  >
                    Add one in Settings
                  </Link>
                  .
                </span>
              </Banner>
            )}
            {hasKey && !hasSamples && (
              <Banner tone="warn">
                <span>
                  No writing samples yet. The model will fall back to a plain voice.{" "}
                  <Link
                    href="/voice/samples"
                    className="font-medium underline underline-offset-4"
                  >
                    Add some samples
                  </Link>{" "}
                  for a real match.
                </span>
              </Banner>
            )}
            {lowSampleVolume && (
              <Banner tone="warn">
                Only {totalSampleWords} words across your samples. Voice modeling
                needs more text to lock in. Aim for {LOW_SAMPLE_WORDS}+ words minimum.
              </Banner>
            )}
          </div>

          <Card className="space-y-6 p-9">
            <div className="relative">
              <textarea
                id="request"
                value={request}
                onChange={(e) => setRequest(e.target.value)}
                onFocus={() => setRequestFocused(true)}
                onBlur={() => setRequestFocused(false)}
                rows={14}
                className={`${textareaClass} text-[16px]`}
              />
              {request.length === 0 && (
                <span
                  aria-hidden
                  className={`prompt-overlay ${
                    placeholderPhase === "exiting" ? "prompt-overlay-exit" : ""
                  } ${
                    placeholderPhase === "entering" ? "prompt-overlay-enter" : ""
                  }`}
                >
                  {PROMPT_PLACEHOLDERS[placeholderIndex]}
                </span>
              )}
            </div>

            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {attachments.map((att) => (
                  <span
                    key={att.id}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-bg-raised border border-line text-[12.5px] text-ink"
                  >
                    <PaperclipIcon />
                    <span className="max-w-[200px] truncate">{att.name}</span>
                    <button
                      type="button"
                      onClick={() => removeAttachment(att.id)}
                      className="text-faint hover:text-ink transition-colors"
                      aria-label={`Remove ${att.name}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,.md,.markdown,application/pdf,text/plain,text/markdown"
              multiple
              disabled={isUploading}
              onChange={(e) => {
                if (e.target.files) handleUploadFiles(e.target.files);
              }}
              className="sr-only"
            />

            <div className="flex items-center justify-between gap-3 pt-1 flex-wrap">
              <div className="flex items-center gap-3 flex-wrap">
                <SecondaryButton
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  <PaperclipIcon />
                  {isUploading ? uploadStatus.message : "Upload files"}
                </SecondaryButton>
                {uploadStatus.state === "error" && (
                  <span className="text-[12px] text-rose-600 dark:text-rose-400">
                    {uploadStatus.message}
                  </span>
                )}
              </div>

              <AccentButton
                onClick={handleGenerate}
                disabled={isWorking || !hasKey || !request.trim()}
              >
                {status.state === "generating" && (
                  <>
                    <Spinner />
                    {status.attempt === 1
                      ? "Drafting…"
                      : `Revising (attempt ${status.attempt} of ${MAX_ATTEMPTS})…`}
                  </>
                )}
                {!isWorking && (
                  <>
                    Generate
                    <span aria-hidden className="ml-0.5">
                      →
                    </span>
                  </>
                )}
              </AccentButton>
            </div>
            {status.state === "error" && (
              <span className="text-[12.5px] text-red-600 dark:text-red-400">
                {status.message}
              </span>
            )}
          </Card>

          {lastDraft && overlayId === null && (
            <div className="flex items-baseline justify-between gap-3 px-2">
              <span className="text-[13px] text-muted">
                Last draft ready ·{" "}
                <span className="text-ink">
                  {lastDraft.output.split(/\s+/).filter(Boolean).length} words
                </span>
                {lastDraft.attemptsUsed > 1 && (
                  <span className="text-faint">
                    {" · "}self-revised {lastDraft.attemptsUsed - 1}×
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => setOverlayId("latest")}
                className="text-[13px] text-violet hover:text-violet-deep underline underline-offset-4"
              >
                View →
              </button>
            </div>
          )}
        </div>
      </div>

      {overlayId !== null && (
        <OutputOverlay
          source={overlaySource}
          loading={overlayLoading}
          onClose={closeOverlay}
          onCopy={handleCopy}
          copied={copied}
          rewriteOpen={rewriteOpen}
          openRewrite={openRewrite}
          closeRewrite={closeRewrite}
          rewriteText={rewriteText}
          setRewriteText={setRewriteText}
          rewriteNote={rewriteNote}
          setRewriteNote={setRewriteNote}
          rewriteStatus={rewriteStatus}
          submitRewrite={submitRewrite}
        />
      )}
    </>
  );
}

function HistorySidebar({
  items,
  activeId,
  onSelect,
  onDelete,
}: {
  items: { id: string; createdAt: number; request: string }[];
  activeId: null | "latest" | string;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <aside
      className="fixed left-0 top-16 bottom-0 w-[240px] z-30 overflow-y-auto p-5 space-y-4"
      style={{
        background: "rgba(20, 18, 30, 0.05)",
        backdropFilter: "blur(20px) saturate(1.15)",
        WebkitBackdropFilter: "blur(20px) saturate(1.15)",
        borderRight: "1px solid var(--line)",
      }}
    >
      <Eyebrow>Chat History</Eyebrow>
      {items.length === 0 ? (
        <p className="text-[12.5px] text-faint">No drafts yet.</p>
      ) : (
        <ul className="space-y-1">
          {items.map((g) => {
            const isActive = activeId === g.id;
            const preview = g.request.trim().slice(0, 80);
            return (
              <li key={g.id} className="group/item relative">
                <button
                  type="button"
                  onClick={() => onSelect(g.id)}
                  className={`w-full text-left px-3 py-2 rounded-md transition-colors ${
                    isActive
                      ? "bg-white/40 border border-line"
                      : "hover:bg-white/30 border border-transparent"
                  }`}
                >
                  <p className="text-[13px] text-ink line-clamp-2 leading-snug">
                    {preview || "Untitled"}
                  </p>
                  <p className="mt-1 text-[10.5px] text-faint mono tracking-wide">
                    {formatRelativeTime(g.createdAt)}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(g.id);
                  }}
                  className="absolute top-2 right-2 text-faint hover:text-rose-500 opacity-0 group-hover/item:opacity-100 transition-opacity text-[12px]"
                  aria-label="Delete from history"
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}

function OutputOverlay({
  source,
  loading,
  onClose,
  onCopy,
  copied,
  rewriteOpen,
  openRewrite,
  closeRewrite,
  rewriteText,
  setRewriteText,
  rewriteNote,
  setRewriteNote,
  rewriteStatus,
  submitRewrite,
}: {
  source: OverlaySource | null;
  loading: boolean;
  onClose: () => void;
  onCopy: () => void | Promise<void>;
  copied: boolean;
  rewriteOpen: boolean;
  openRewrite: () => void;
  closeRewrite: () => void;
  rewriteText: string;
  setRewriteText: (s: string) => void;
  rewriteNote: string;
  setRewriteNote: (s: string) => void;
  rewriteStatus: {
    state: "idle" | "submitting" | "done" | "error";
    message?: string;
    lessons?: string[];
  };
  submitRewrite: () => void | Promise<void>;
}) {
  const text =
    source?.kind === "latest"
      ? source.draft.output
      : source?.kind === "historical"
        ? source.generation.finalText
        : "";
  const request =
    source?.kind === "latest"
      ? source.draft.request
      : source?.kind === "historical"
        ? source.generation.request
        : "";
  const attemptsUsed =
    source?.kind === "latest"
      ? source.draft.attemptsUsed
      : source?.kind === "historical"
        ? source.generation.meta?.retried
          ? 2
          : 1
        : 0;
  const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="output-overlay fixed inset-x-0 bottom-0 top-16 z-[80] bg-white overflow-y-auto">
      <div className="max-w-3xl mx-auto px-8 py-10 space-y-8">
        <div className="flex items-start justify-between gap-6">
          <div className="space-y-2 min-w-0">
            <p className="mono text-[10.5px] uppercase tracking-[0.18em] text-text-low">
              {wordCount.toLocaleString()} words
              {attemptsUsed > 1 && (
                <span className="text-faint">
                  {" · "}self-revised {attemptsUsed - 1}×
                </span>
              )}
            </p>
            <p className="text-[14px] text-muted line-clamp-2 leading-snug">
              {request}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <SecondaryButton onClick={onCopy}>
              {copied ? "Copied" : "Copy"}
            </SecondaryButton>
            <button
              type="button"
              onClick={onClose}
              className="text-faint hover:text-ink transition-colors text-[20px] leading-none px-2"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>

        {loading && (
          <p className="text-[14px] text-muted italic">Loading…</p>
        )}

        {!loading && text && (
          <article className="font-serif text-[18px] leading-[1.75] whitespace-pre-wrap text-ink">
            {text}
          </article>
        )}

        {!loading && text && (
          <div className="pt-6 border-t border-line">
            {!rewriteOpen && rewriteStatus.state !== "done" && (
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <div className="space-y-1">
                  <p className="text-[13.5px] text-ink">
                    Did this miss the mark? Show me how you would write it.
                  </p>
                  <p className="text-[12px] text-muted leading-relaxed">
                    Edit the draft into the version you actually want. The model
                    will extract concrete lessons and apply them on every future
                    generation.
                  </p>
                </div>
                <SecondaryButton onClick={openRewrite}>
                  Submit your version
                </SecondaryButton>
              </div>
            )}

            {rewriteOpen && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <Eyebrow>Your rewrite</Eyebrow>
                    <span className="font-mono text-[11px] text-faint">
                      {rewriteText
                        ? rewriteText
                            .split(/\s+/)
                            .filter(Boolean)
                            .length.toLocaleString()
                        : 0}{" "}
                      words
                    </span>
                  </div>
                  <textarea
                    value={rewriteText}
                    onChange={(e) => setRewriteText(e.target.value)}
                    rows={14}
                    className={textareaClass}
                  />
                </div>
                <div className="space-y-2">
                  <Eyebrow>Optional note</Eyebrow>
                  <textarea
                    value={rewriteNote}
                    onChange={(e) => setRewriteNote(e.target.value)}
                    placeholder="What did you change and why? Helps the model extract sharper lessons."
                    rows={3}
                    className={textareaClass}
                  />
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <AccentButton
                    onClick={submitRewrite}
                    disabled={
                      rewriteStatus.state === "submitting" ||
                      !rewriteText.trim()
                    }
                  >
                    {rewriteStatus.state === "submitting" ? (
                      <>
                        <Spinner />
                        Learning from your edits…
                      </>
                    ) : (
                      "Submit rewrite"
                    )}
                  </AccentButton>
                  <SecondaryButton
                    onClick={closeRewrite}
                    disabled={rewriteStatus.state === "submitting"}
                  >
                    Cancel
                  </SecondaryButton>
                </div>
                {rewriteStatus.state === "error" && rewriteStatus.message && (
                  <Banner tone="error">{rewriteStatus.message}</Banner>
                )}
              </div>
            )}

            {rewriteStatus.state === "done" && (
              <div className="space-y-3">
                <Banner tone="success">
                  Learned {rewriteStatus.lessons?.length ?? 0}{" "}
                  {rewriteStatus.lessons?.length === 1 ? "lesson" : "lessons"} from
                  your rewrite. The digest has been updated and will apply to
                  your next generation.
                </Banner>
                {rewriteStatus.lessons && rewriteStatus.lessons.length > 0 && (
                  <Card className="space-y-2">
                    <Eyebrow>What the model learned</Eyebrow>
                    <ul className="space-y-1.5 pt-1">
                      {rewriteStatus.lessons.map((lesson, i) => (
                        <li
                          key={i}
                          className="text-[13.5px] text-ink leading-relaxed pl-4 relative"
                        >
                          <span className="absolute left-0 top-[8px] inline-block h-1 w-1 rounded-full bg-accent" />
                          {lesson}
                        </li>
                      ))}
                    </ul>
                    <div className="pt-2">
                      <Link
                        href="/voice/corrections"
                        className="text-[12.5px] text-muted hover:text-ink underline underline-offset-4"
                      >
                        View all revisions →
                      </Link>
                    </div>
                  </Card>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z"
      />
    </svg>
  );
}

function PaperclipIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 17.99 8.7l-8.59 8.59a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}
