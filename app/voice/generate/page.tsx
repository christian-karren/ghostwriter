"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import {
  AccentButton,
  Banner,
  Card,
  Eyebrow,
  FieldLabel,
  GhostButton,
  Hint,
  PageHeader,
  SecondaryButton,
  textareaClass,
} from "../_components/ui";
import { DEFAULT_MODEL, generateText } from "../_lib/gemini";
import { buildRetryPrompt, buildSystemPrompt, buildUserPrompt } from "../_lib/prompt";
import { archiveGeneration, hydrateSamples } from "../_lib/storage";
import { recordCorrection } from "../_lib/corrections";
import {
  checkLength,
  findViolations,
  parseTargetWordCount,
  scrubDashes,
  type LengthFeedback,
} from "../_lib/styleGuard";
import { useData } from "../_lib/DataProvider";
import type { Sample, Violation } from "../_lib/types";

type Status =
  | { state: "idle" }
  | { state: "generating"; attempt: number }
  | { state: "done" }
  | { state: "error"; message: string };

const LOW_SAMPLE_WORDS = 300;
const TRUNCATION_REASONS = new Set(["MAX_TOKENS", "LENGTH"]);
const MAX_ATTEMPTS = 5;

type Attempt = {
  text: string;
  scrubbed: string;
  violations: Violation[];
  length: LengthFeedback | null;
  finishReason: string;
};

function attemptScore(a: Attempt): number {
  const lengthPenalty = a.length && a.length.status !== "ok" ? Math.min(a.length.delta, 500) : 0;
  return a.violations.length * 100 + lengthPenalty;
}

export default function GeneratePage() {
  const {
    samples,
    settings,
    profile,
    corrections,
    refreshCorrections,
  } = useData();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(samples.map((s) => s.id)));
  const [request, setRequest] = useState("");
  const [source, setSource] = useState("");
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const [output, setOutput] = useState("");
  const [lastRequest, setLastRequest] = useState("");
  const [lastSource, setLastSource] = useState("");
  const [attemptsUsed, setAttemptsUsed] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [copied, setCopied] = useState(false);
  const [rewriteOpen, setRewriteOpen] = useState(false);
  const [rewriteText, setRewriteText] = useState("");
  const [rewriteNote, setRewriteNote] = useState("");
  const [rewriteStatus, setRewriteStatus] = useState<{
    state: "idle" | "submitting" | "done" | "error";
    message?: string;
    lessons?: string[];
  }>({ state: "idle" });

  const selectedMetas = useMemo(
    () => samples.filter((s) => selectedIds.has(s.id)),
    [samples, selectedIds],
  );

  function toggleSample(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(samples.map((s) => s.id)));
  }

  function selectNone() {
    setSelectedIds(new Set());
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

    setOutput("");
    setAttemptsUsed(0);
    setTruncated(false);
    setRewriteOpen(false);
    setRewriteText("");
    setRewriteNote("");
    setRewriteStatus({ state: "idle" });
    setStatus({ state: "generating", attempt: 1 });

    const startedAt = performance.now();
    const target = parseTargetWordCount(request);

    try {
      const fullSamples: Sample[] = await hydrateSamples(selectedMetas);

      const systemPrompt = buildSystemPrompt(
        fullSamples,
        profile?.profile,
        corrections.digest,
      );
      const userPrompt = buildUserPrompt(request, source);
      setLastRequest(request);
      setLastSource(source);

      const allAttempts: Attempt[] = [];
      let best: Attempt | null = null;

      async function runOnce(promptText: string, attempt: number): Promise<Attempt> {
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
        (best.violations.length > 0 || (best.length && best.length.status !== "ok"))
      ) {
        attemptNum += 1;
        const retryPrompt = buildRetryPrompt(
          request,
          source,
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

      setOutput(best.scrubbed);
      setAttemptsUsed(allAttempts.length);
      setTruncated(TRUNCATION_REASONS.has(best.finishReason));
      setStatus({ state: "done" });

      archiveGeneration({
        request,
        source,
        systemPrompt,
        draftV1: allAttempts[0].text,
        violationsV1: allAttempts[0].violations,
        draftV2: allAttempts.length > 1 ? allAttempts[allAttempts.length - 1].text : undefined,
        violationsV2:
          allAttempts.length > 1
            ? allAttempts[allAttempts.length - 1].violations
            : undefined,
        finalText: best.scrubbed,
        meta: {
          model: DEFAULT_MODEL,
          temperature: settings.temperature,
          finishReason: best.finishReason,
          ms: elapsed,
          accepted: false,
          retried: allAttempts.length > 1,
        },
      }).catch((err) => console.error("archive failed", err));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus({ state: "error", message });
    }
  }

  function openRewrite() {
    setRewriteText(output);
    setRewriteNote("");
    setRewriteOpen(true);
    setRewriteStatus({ state: "idle" });
  }

  function closeRewrite() {
    setRewriteOpen(false);
    setRewriteStatus({ state: "idle" });
  }

  async function submitRewrite() {
    if (!settings.apiKey) {
      setRewriteStatus({
        state: "error",
        message: "No Gemini API key. Add one in Settings.",
      });
      return;
    }
    if (!rewriteText.trim()) {
      setRewriteStatus({
        state: "error",
        message: "Rewrite is empty.",
      });
      return;
    }
    if (rewriteText.trim() === output.trim()) {
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
        request: lastRequest,
        draft: output,
        rewrite: rewriteText,
        note: rewriteNote,
      });
      await refreshCorrections();
      setRewriteStatus({
        state: "done",
        lessons: correction.lessons,
      });
    } catch (err) {
      setRewriteStatus({
        state: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(output);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
    if (lastRequest) {
      archiveGeneration({
        request: lastRequest,
        source: lastSource,
        systemPrompt: "(see paired draft folder)",
        draftV1: output,
        violationsV1: [],
        finalText: output,
        meta: {
          model: DEFAULT_MODEL,
          temperature: settings.temperature,
          finishReason: "COPIED",
          ms: 0,
          accepted: true,
          retried: attemptsUsed > 1,
        },
      }).catch((err) => console.error("archive accept failed", err));
    }
  }

  const hasKey = settings.apiKey.length > 0;
  const hasSamples = samples.length > 0;
  const selectedWordCount = selectedMetas.reduce((acc, s) => acc + s.wordCount, 0);
  const lowSampleVolume = hasSamples && selectedWordCount < LOW_SAMPLE_WORDS;
  const isWorking = status.state === "generating";
  const outputWordCount = output ? output.split(/\s+/).filter(Boolean).length : 0;

  return (
    <div className="pt-14 pb-16 space-y-10">
      <PageHeader
        eyebrow="Generate"
        title="Draft something in your voice"
        description="Tell the model what to write. It drafts in your voice and self-revises until the output passes the style guard and hits the requested length."
      />

      {hasKey && hasSamples && (
        <div className="flex items-center gap-2 -mt-4 text-[12px] flex-wrap">
          {profile ? (
            <>
              <span className="inline-flex items-center gap-1.5 text-accent">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
                Voice profile active
              </span>
              <span className="text-muted">·</span>
              <Link
                href="/voice/samples"
                className="text-muted hover:text-foreground underline underline-offset-4"
              >
                View on Samples
              </Link>
              {corrections.corrections.length > 0 && (
                <>
                  <span className="text-muted">·</span>
                  <span className="inline-flex items-center gap-1.5 text-accent">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
                    {corrections.corrections.length}{" "}
                    {corrections.corrections.length === 1 ? "revision" : "revisions"}{" "}
                    learned
                  </span>
                </>
              )}
            </>
          ) : (
            <>
              <span className="text-muted">No voice profile extracted yet.</span>
              <Link
                href="/voice/samples"
                className="text-foreground/80 hover:text-foreground underline underline-offset-4 font-medium"
              >
                Extract one
              </Link>
              <span className="text-muted">for stronger imitation.</span>
            </>
          )}
        </div>
      )}

      <div className="space-y-3">
        {!hasKey && (
          <Banner tone="error">
            <span>
              You need a Gemini API key first.{" "}
              <Link href="/voice/settings" className="font-medium underline underline-offset-4">
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
              <Link href="/voice/samples" className="font-medium underline underline-offset-4">
                Add some samples
              </Link>{" "}
              for a real match.
            </span>
          </Banner>
        )}
        {lowSampleVolume && (
          <Banner tone="warn">
            Only {selectedWordCount} words selected across your samples. Voice modeling
            needs more text to lock in. Aim for {LOW_SAMPLE_WORDS}+ words minimum.
          </Banner>
        )}
      </div>

      <Card className="space-y-5">
        <div className="space-y-2">
          <FieldLabel htmlFor="request">What should the model write?</FieldLabel>
          <textarea
            id="request"
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            placeholder="A 300-word blog post about why I switched from Vim to Helix..."
            rows={4}
            className={textareaClass}
          />
        </div>

        <details className="group rounded-xl border border-hairline bg-background overflow-hidden">
          <summary className="cursor-pointer px-4 py-3 text-[13.5px] font-medium tracking-tight2 select-none flex items-center justify-between hover:bg-surface/50 transition-colors">
            <span>Source material</span>
            <span className="text-[11.5px] text-muted font-normal group-open:hidden">
              Optional
            </span>
          </summary>
          <div className="px-4 pb-4 pt-1 space-y-2 border-t border-hairline">
            <Hint>Notes, an outline, or a rough draft to rewrite in your voice.</Hint>
            <textarea
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="Paste notes or a draft..."
              rows={6}
              className={textareaClass}
            />
          </div>
        </details>

        {samples.length > 0 && (
          <details className="group rounded-xl border border-hairline bg-background overflow-hidden">
            <summary className="cursor-pointer px-4 py-3 text-[13.5px] font-medium tracking-tight2 select-none flex items-center justify-between hover:bg-surface/50 transition-colors">
              <span>Voice samples</span>
              <span className="text-[11.5px] text-muted font-normal">
                {selectedIds.size} of {samples.length} selected
              </span>
            </summary>
            <div className="px-4 pb-4 pt-3 space-y-3 border-t border-hairline">
              <div className="flex items-center gap-3">
                <GhostButton onClick={selectAll}>Select all</GhostButton>
                <span className="text-muted text-[11px]">·</span>
                <GhostButton onClick={selectNone}>Select none</GhostButton>
              </div>
              <ul className="space-y-1 max-h-64 overflow-y-auto pr-1">
                {samples.map((s) => (
                  <li key={s.id}>
                    <label className="flex items-center gap-2.5 py-1.5 text-[13.5px] cursor-pointer group/item">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(s.id)}
                        onChange={() => toggleSample(s.id)}
                        className="h-3.5 w-3.5 accent-[var(--accent)]"
                      />
                      <span className="flex-1">{s.name}</span>
                      <span className="font-mono text-[11px] text-muted">
                        {s.wordCount} words
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          </details>
        )}

        <div className="flex items-center gap-3 pt-1">
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
                <span aria-hidden className="ml-0.5">→</span>
              </>
            )}
          </AccentButton>
          {status.state === "error" && (
            <span className="text-[12.5px] text-red-600 dark:text-red-400">
              {status.message}
            </span>
          )}
        </div>
      </Card>

      {output && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between flex-wrap gap-3">
            <div className="flex items-baseline gap-3">
              <Eyebrow>Draft</Eyebrow>
              <span className="font-mono text-[11px] text-muted">
                {outputWordCount.toLocaleString()} words
              </span>
              {attemptsUsed > 1 && (
                <span className="text-[11.5px] text-muted">
                  self-revised {attemptsUsed - 1} time{attemptsUsed - 1 === 1 ? "" : "s"}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <SecondaryButton onClick={handleCopy}>
                {copied ? "Copied" : "Copy"}
              </SecondaryButton>
            </div>
          </div>

          <Card className="bg-background">
            <div className="text-[15px] leading-[1.65] whitespace-pre-wrap">
              {output}
            </div>
          </Card>

          {truncated && (
            <Banner tone="warn">
              The model hit its output limit and the response was cut off mid-thought. Try
              again, or ask for a shorter piece. If your samples are very long, deselecting
              some can free up room for output.
            </Banner>
          )}

          <div className="pt-4 border-t border-hairline">
            {!rewriteOpen && rewriteStatus.state !== "done" && (
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <div className="space-y-1">
                  <p className="text-[13.5px] text-foreground/85">
                    Did this miss the mark? Show me how you would write it.
                  </p>
                  <p className="text-[12px] text-muted leading-relaxed">
                    Edit the draft into the version you actually want. The model will
                    extract concrete lessons and apply them on every future generation.
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
                    <span className="font-mono text-[11px] text-muted">
                      {rewriteText
                        ? rewriteText.split(/\s+/).filter(Boolean).length.toLocaleString()
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
                    disabled={rewriteStatus.state === "submitting" || !rewriteText.trim()}
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
                  {rewriteStatus.lessons?.length === 1 ? "lesson" : "lessons"} from your
                  rewrite. The digest has been updated and will apply to your next
                  generation.
                </Banner>
                {rewriteStatus.lessons && rewriteStatus.lessons.length > 0 && (
                  <Card className="space-y-2">
                    <Eyebrow>What the model learned</Eyebrow>
                    <ul className="space-y-1.5 pt-1">
                      {rewriteStatus.lessons.map((lesson, i) => (
                        <li
                          key={i}
                          className="text-[13.5px] text-foreground/85 leading-relaxed pl-4 relative"
                        >
                          <span className="absolute left-0 top-[8px] inline-block h-1 w-1 rounded-full bg-accent" />
                          {lesson}
                        </li>
                      ))}
                    </ul>
                    <div className="pt-2">
                      <Link
                        href="/voice/corrections"
                        className="text-[12.5px] text-muted hover:text-foreground underline underline-offset-4"
                      >
                        View all revisions →
                      </Link>
                    </div>
                  </Card>
                )}
              </div>
            )}
          </div>
        </section>
      )}
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

