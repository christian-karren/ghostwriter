"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  addSample,
  deleteSample,
  hydrateSamples,
  updateSample,
} from "../_lib/storage";
import { useData } from "../_lib/DataProvider";
import { extractPdfText, isPdfFile } from "../_lib/pdf";
import { formatRelativeTime, isProfileStale } from "../_lib/profile";
import type { Sample } from "../_lib/types";
import {
  Banner,
  Card,
  Eyebrow,
  FieldLabel,
  GhostButton,
  Hint,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  inputClass,
  textareaClass,
} from "../_components/ui";

const PREVIEW_LEN = 320;

export default function SamplesPage() {
  const {
    samples,
    settings,
    profile,
    profileSyncing,
    profileSyncError,
    refreshSamples,
    regenerateProfile,
  } = useData();

  const [hydrated, setHydrated] = useState<Map<string, string>>(new Map());
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{
    state: "idle" | "processing" | "error" | "warn";
    message?: string;
  }>({ state: "idle" });
  const [dragDepth, setDragDepth] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isDragging = dragDepth > 0;
  const isProcessing = uploadStatus.state === "processing";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ids = samples.map((s) => s.id);
      const missing = ids.filter((id) => !hydrated.has(id));
      if (missing.length === 0) return;
      const metaToHydrate = samples.filter((s) => missing.includes(s.id));
      const hydratedSamples = await hydrateSamples(metaToHydrate);
      if (cancelled) return;
      setHydrated((prev) => {
        const next = new Map(prev);
        for (const s of hydratedSamples) {
          next.set(s.id, s.content);
        }
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [samples, hydrated]);

  async function handleAdd() {
    if (!content.trim()) return;
    const text = content.trim();
    const bytes = new TextEncoder().encode(text);
    await addSample({
      name: name || "Untitled",
      kind: "own",
      bytes,
      mimeType: "text/markdown",
    });
    setName("");
    setContent("");
    await refreshSamples();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this sample?")) return;
    await deleteSample(id);
    if (editingId === id) setEditingId(null);
    setHydrated((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
    await refreshSamples();
  }

  async function startEdit(s: Sample | { id: string; name: string; extractedPath: string | null }) {
    setEditingId(s.id);
    setEditName(s.name);
    if (s.extractedPath) {
      setEditContent("");
      setEditLoading(false);
      return;
    }
    setEditLoading(true);
    const cached = hydrated.get(s.id);
    if (cached !== undefined) {
      setEditContent(cached);
      setEditLoading(false);
      return;
    }
    const [full] = await hydrateSamples(samples.filter((x) => x.id === s.id));
    setEditContent(full?.content ?? "");
    setEditLoading(false);
  }

  async function saveEdit() {
    if (!editingId) return;
    const sample = samples.find((s) => s.id === editingId);
    const isPdf = !!sample?.extractedPath;
    await updateSample(editingId, {
      name: editName,
      text: isPdf ? undefined : editContent,
    });
    setEditingId(null);
    setHydrated((prev) => {
      const next = new Map(prev);
      if (!isPdf) next.set(editingId, editContent);
      return next;
    });
    await refreshSamples();
  }

  async function processFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;

    setUploadStatus({
      state: "processing",
      message: `Reading ${list.length} ${list.length === 1 ? "file" : "files"}…`,
    });

    const errors: string[] = [];
    const empty: string[] = [];
    let added = 0;

    for (const file of list) {
      const cleanName = file.name.replace(/\.(pdf|txt|md|markdown)$/i, "");
      try {
        let text: string;
        let extracted: string | undefined;
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        if (isPdfFile(file)) {
          text = await extractPdfText(file);
          extracted = text;
        } else {
          text = await file.text();
        }
        if (!text.trim()) {
          empty.push(file.name);
          continue;
        }
        await addSample({
          name: cleanName,
          kind: "own",
          bytes,
          mimeType: file.type || (isPdfFile(file) ? "application/pdf" : "text/plain"),
          extractedText: extracted,
        });
        added += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${file.name}: ${msg}`);
      }
    }

    await refreshSamples();
    if (fileInputRef.current) fileInputRef.current.value = "";

    if (errors.length > 0) {
      setUploadStatus({
        state: "error",
        message: `Some files failed. ${errors.join(" | ")}`,
      });
    } else if (empty.length > 0) {
      setUploadStatus({
        state: "warn",
        message: `${empty.length} file(s) had no extractable text (probably image-only or scanned PDFs): ${empty.join(", ")}.${
          added > 0 ? ` ${added} added successfully.` : ""
        }`,
      });
    } else {
      setUploadStatus({ state: "idle" });
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) processFiles(e.target.files);
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes("Files")) {
      setDragDepth((d) => d + 1);
    }
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragDepth((d) => Math.max(0, d - 1));
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragDepth(0);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  }

  const totalWords = useMemo(
    () => samples.reduce((acc, s) => acc + s.wordCount, 0),
    [samples],
  );

  const previewWordCount = content.trim()
    ? content.trim().split(/\s+/).filter(Boolean).length
    : 0;

  const profileStale =
    profile && samples.length > 0 && isProfileStale(profile, samples);
  const hasKey = !!settings.apiKey;

  return (
    <div className="pt-8 pb-24 space-y-12">
      <PageHeader
        eyebrow="Samples"
        title="Your writing library."
        description="Anything you've written that sounds like you. The more you add, the sharper the voice match. A few thousand words across multiple pieces is the sweet spot."
      />

      <section
        className="space-y-5 reveal"
        style={{ animationDelay: "80ms" }}
      >
        <div className="flex items-baseline justify-between gap-4">
          <div className="space-y-2">
            <Eyebrow>Voice profile</Eyebrow>
            <p className="text-[14px] text-muted leading-[1.6] max-w-[60ch]">
              A distilled description of your voice, updated automatically whenever
              your samples change.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {profile && !profileSyncing && (
              <span className="mono text-[11px] text-faint tracking-wide">
                {formatRelativeTime(profile.generatedAt)}
              </span>
            )}
            {profileSyncing && (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-violet">
                <span className="h-1.5 w-1.5 rounded-full bg-violet animate-pulse" />
                Distilling…
              </span>
            )}
            {profile &&
              !profileSyncing &&
              hasKey &&
              samples.length > 0 &&
              !profile.userEdited && (
                <GhostButton
                  onClick={() => {
                    regenerateProfile().catch((err) =>
                      console.error("regenerate profile failed", err),
                    );
                  }}
                >
                  Regenerate
                </GhostButton>
              )}
          </div>
        </div>
        <Card className="space-y-5">
          {!profile && samples.length === 0 && (
            <p className="text-[14px] text-muted leading-relaxed">
              Add samples below and a voice profile will be distilled automatically.
            </p>
          )}
          {!profile && samples.length > 0 && !hasKey && (
            <p className="text-[14px] text-muted leading-relaxed">
              Add your Gemini API key in Settings and the profile will distill
              itself.
            </p>
          )}
          {!profile && samples.length > 0 && hasKey && (
            <p className="text-[14px] text-muted italic leading-relaxed">
              Reading your samples…
            </p>
          )}
          {profile && (
            <>
              {profile.userEdited && (
                <Banner tone="warn">
                  This profile was edited by hand in voice/profile.md. Auto-updates
                  paused. Delete the file (in your data folder) to resume.
                </Banner>
              )}
              {profileStale && !profileSyncing && !hasKey && (
                <Banner tone="info">
                  Your samples have changed. Add your Gemini API key in Settings to
                  refresh the profile.
                </Banner>
              )}
              <p className="text-[15px] leading-[1.7] whitespace-pre-wrap text-ink/90">
                {profile.profile}
              </p>
            </>
          )}
          {profileSyncError && (
            <Banner tone="error">
              Couldn&apos;t refresh voice profile: {profileSyncError}
            </Banner>
          )}
        </Card>
      </section>

      <section
        className="space-y-3 reveal"
        style={{ animationDelay: "160ms" }}
      >
        <label
          htmlFor="voice-file-input"
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className={`dropzone flex flex-col items-center justify-center gap-3 px-6 py-14 text-center cursor-pointer ${
            isProcessing ? "cursor-wait" : ""
          } ${isDragging ? "dropzone-active" : ""}`}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full text-text-mid">
            {isProcessing ? <UploadSpinner /> : <UploadIcon />}
          </div>
          <div className="space-y-1.5">
            <p className="text-[15px] font-medium text-text-hi tracking-[-0.005em]">
              {isProcessing
                ? uploadStatus.message
                : isDragging
                  ? "Release to upload"
                  : "Drop files or click to browse"}
            </p>
            {!isProcessing && !isDragging && (
              <p className="text-[11.5px] text-text-low mono tracking-wider uppercase">
                pdf · txt · md · multiple supported
              </p>
            )}
          </div>
          <input
            id="voice-file-input"
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,.md,.markdown,application/pdf,text/plain,text/markdown"
            multiple
            disabled={isProcessing}
            onChange={handleInputChange}
            className="sr-only"
          />
        </label>
        {uploadStatus.state === "error" && uploadStatus.message && (
          <Banner tone="error">{uploadStatus.message}</Banner>
        )}
        {uploadStatus.state === "warn" && uploadStatus.message && (
          <Banner tone="warn">{uploadStatus.message}</Banner>
        )}
      </section>

      <Card
        className="space-y-6 reveal"
        as="section"
        style={{ animationDelay: "240ms" }}
      >
        <div className="flex items-baseline justify-between gap-4">
          <div className="space-y-2">
            <Eyebrow>Add a sample</Eyebrow>
            <p className="text-[14px] text-text-mid leading-relaxed">
              Paste writing directly, or use the upload above.
            </p>
          </div>
          {previewWordCount > 0 && (
            <span className="mono text-[11px] text-text-low">
              {previewWordCount.toLocaleString()} words
            </span>
          )}
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <FieldLabel>Title</FieldLabel>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Optional. Helps you find it later."
              className={inputClass}
            />
          </div>
          <div className="space-y-2">
            <FieldLabel>Content</FieldLabel>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Paste your writing here…"
              rows={9}
              className={textareaClass}
            />
          </div>
        </div>
        <div className="flex items-center gap-2 pt-1 flex-wrap">
          <PrimaryButton onClick={handleAdd} disabled={!content.trim()}>
            Save sample
          </PrimaryButton>
        </div>
      </Card>

      <section
        className="space-y-5 reveal"
        style={{ animationDelay: "320ms" }}
      >
        <div className="flex items-baseline justify-between gap-4">
          <div className="space-y-2">
            <Eyebrow>Library</Eyebrow>
            <p className="text-[14px] text-text-hi">
              <span className="font-medium text-text-hi">
                {samples.length} {samples.length === 1 ? "piece" : "pieces"}
              </span>
              {totalWords > 0 && (
                <span className="text-text-mid">
                  {" · "}
                  {totalWords.toLocaleString()} words total
                </span>
              )}
            </p>
          </div>
        </div>

        {samples.length === 0 && (
          <Card className="text-center py-12">
            <p className="text-[14px] text-text-low">No samples yet.</p>
          </Card>
        )}

        <ul className="space-y-3">
          {samples.map((s) => {
            const isEditing = editingId === s.id;
            const fullText = hydrated.get(s.id) ?? "";
            const preview = fullText.slice(0, PREVIEW_LEN);
            const isPdf = !!s.extractedPath;

            if (isEditing) {
              return (
                <Card as="li" key={s.id} className="space-y-3">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className={inputClass}
                  />
                  {isPdf ? (
                    <Hint>
                      This sample was extracted from a PDF. You can rename it but the
                      text is read-only here. Edit the source file directly if needed.
                    </Hint>
                  ) : editLoading ? (
                    <Hint>Loading content…</Hint>
                  ) : (
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={12}
                      className={textareaClass}
                    />
                  )}
                  <div className="flex items-center gap-2">
                    <PrimaryButton onClick={saveEdit} disabled={editLoading}>
                      Save
                    </PrimaryButton>
                    <SecondaryButton onClick={() => setEditingId(null)}>
                      Cancel
                    </SecondaryButton>
                  </div>
                </Card>
              );
            }

            return (
              <Card
                as="li"
                key={s.id}
                className="space-y-3 transition-shadow duration-200 hover:shadow-bloom"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="text-[16px] font-medium tracking-[-0.012em] text-text-hi">
                    {s.name}
                    {isPdf && (
                      <span className="ml-2 inline-block mono text-[10px] text-text-low uppercase tracking-wider">
                        pdf
                      </span>
                    )}
                  </h3>
                  <span className="mono text-[11px] text-text-low shrink-0">
                    {s.wordCount.toLocaleString()} words
                  </span>
                </div>
                <p className="text-[13.5px] text-text-mid leading-relaxed whitespace-pre-wrap">
                  {preview || (
                    <span className="text-text-low">Loading preview…</span>
                  )}
                  {fullText.length > preview.length && (
                    <span className="text-text-low">…</span>
                  )}
                </p>
                <div className="flex items-center gap-4 pt-1">
                  <GhostButton onClick={() => startEdit(s)}>Edit</GhostButton>
                  <GhostButton
                    onClick={() => handleDelete(s.id)}
                    className="!text-rose-300/70 hover:!text-rose-200"
                  >
                    Delete
                  </GhostButton>
                </div>
              </Card>
            );
          })}
        </ul>

        {totalWords > 0 && totalWords < 1000 && (
          <Hint>
            Voice matching gets noticeably better past 1,000 words. Keep adding.
          </Hint>
        )}
      </section>
    </div>
  );
}

function UploadSpinner() {
  return (
    <svg
      className="animate-spin h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
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

function UploadIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M5 16v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

