"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  addSample,
  clearProfile,
  deleteSample,
  hydrateSamples,
  saveProfile,
  updateSample,
} from "../_lib/storage";
import { useData } from "../_lib/DataProvider";
import { extractPdfText, isPdfFile } from "../_lib/pdf";
import {
  extractVoiceProfile,
  formatRelativeTime,
  isProfileStale,
} from "../_lib/profile";
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
  const { samples, settings, profile, refreshSamples, refreshProfile } = useData();

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
  const [profileStatus, setProfileStatus] = useState<{
    state: "idle" | "extracting" | "error";
    message?: string;
  }>({ state: "idle" });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isDragging = dragDepth > 0;
  const isProcessing = uploadStatus.state === "processing";
  const isExtractingProfile = profileStatus.state === "extracting";

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

  async function handleExtractProfile() {
    if (!settings.apiKey) {
      setProfileStatus({
        state: "error",
        message: "Add your Gemini API key in Settings first.",
      });
      return;
    }
    if (samples.length === 0) {
      setProfileStatus({
        state: "error",
        message: "Add at least one writing sample before extracting a profile.",
      });
      return;
    }
    setProfileStatus({ state: "extracting" });
    try {
      const full = await hydrateSamples(samples);
      const next = await extractVoiceProfile({
        apiKey: settings.apiKey,
        samples: full,
      });
      await saveProfile(next, profile?.userEdited ? true : false);
      await refreshProfile();
      setProfileStatus({ state: "idle" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setProfileStatus({ state: "error", message });
    }
  }

  async function handleClearProfile() {
    if (!confirm("Clear the voice profile? You can regenerate it later.")) return;
    await clearProfile();
    await refreshProfile();
    setProfileStatus({ state: "idle" });
  }

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
    <div className="pt-14 pb-16 space-y-12">
      <PageHeader
        eyebrow="Samples"
        title="Your writing library"
        description="Anything you have written that sounds like you. The more you add, the better the voice match. Aim for a few thousand words across multiple pieces."
      />

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-4">
          <div className="space-y-1">
            <Eyebrow>Voice profile</Eyebrow>
            <p className="text-[13px] text-muted leading-relaxed max-w-prose">
              A distilled description of your voice, extracted from your samples by the
              same model that will later imitate you. Injected at the top of every
              generation so the model has an explicit guide, not just raw examples.
            </p>
          </div>
          {profile && (
            <span className="font-mono text-[11px] text-muted shrink-0">
              {formatRelativeTime(profile.generatedAt)}
            </span>
          )}
        </div>
        <Card className="space-y-4">
          {!profile && (
            <div className="space-y-3">
              <p className="text-[13.5px] text-muted leading-relaxed">
                {samples.length === 0
                  ? "Add at least one writing sample below, then extract a profile."
                  : !hasKey
                    ? "Add your Gemini API key in Settings, then come back to extract."
                    : "No profile yet. Click to analyze your samples and build one."}
              </p>
              <PrimaryButton
                onClick={handleExtractProfile}
                disabled={
                  isExtractingProfile || !hasKey || samples.length === 0
                }
              >
                {isExtractingProfile ? (
                  <>
                    <ProfileSpinner />
                    Analyzing samples…
                  </>
                ) : (
                  "Extract voice profile"
                )}
              </PrimaryButton>
            </div>
          )}
          {profile && (
            <div className="space-y-4">
              {profileStale && (
                <Banner tone="warn">
                  Your samples have changed since this profile was extracted. Regenerate
                  for a refreshed read on your voice.
                </Banner>
              )}
              {profile.userEdited && (
                <Banner tone="warn">
                  This profile has been edited by hand in voice/profile.md. Regenerating
                  will overwrite your edits (the previous version is backed up under
                  voice/.history/).
                </Banner>
              )}
              <p className="text-[14.5px] leading-relaxed whitespace-pre-wrap text-foreground/90">
                {profile.profile}
              </p>
              <div className="flex items-center gap-2 pt-1 flex-wrap">
                <SecondaryButton
                  onClick={handleExtractProfile}
                  disabled={isExtractingProfile || !hasKey || samples.length === 0}
                >
                  {isExtractingProfile ? (
                    <>
                      <ProfileSpinner />
                      Regenerating…
                    </>
                  ) : (
                    "Regenerate"
                  )}
                </SecondaryButton>
                <GhostButton
                  onClick={handleClearProfile}
                  disabled={isExtractingProfile}
                >
                  Clear
                </GhostButton>
              </div>
            </div>
          )}
          {profileStatus.state === "error" && profileStatus.message && (
            <Banner tone="error">{profileStatus.message}</Banner>
          )}
        </Card>
      </section>

      <section className="space-y-3">
        <label
          htmlFor="voice-file-input"
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className={`relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-all ${
            isProcessing
              ? "cursor-wait border-hairline-strong bg-surface/50"
              : isDragging
                ? "cursor-copy border-accent bg-accent-soft scale-[1.01]"
                : "cursor-pointer border-hairline bg-surface/30 hover:border-hairline-strong hover:bg-surface/60"
          }`}
        >
          <div
            className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors ${
              isDragging ? "bg-accent/15 text-accent" : "bg-surface text-muted"
            }`}
          >
            {isProcessing ? <UploadSpinner /> : <UploadIcon />}
          </div>
          <div className="space-y-1">
            <p className="text-[14.5px] font-medium tracking-tight2">
              {isProcessing
                ? uploadStatus.message
                : isDragging
                  ? "Release to upload"
                  : "Drop files here, or click to browse"}
            </p>
            {!isProcessing && !isDragging && (
              <p className="text-[12.5px] text-muted">
                <span className="font-mono">PDF</span> ·{" "}
                <span className="font-mono">.txt</span> ·{" "}
                <span className="font-mono">.md</span> · multiple files supported
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

      <Card className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[14px] font-medium tracking-tight2">Add a sample</h2>
          {previewWordCount > 0 && (
            <span className="font-mono text-[11px] text-muted">
              {previewWordCount.toLocaleString()} words
            </span>
          )}
        </div>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <FieldLabel>Title</FieldLabel>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Optional. Helps you find it later."
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Content</FieldLabel>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Paste your writing here..."
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

      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <div className="space-y-1">
            <Eyebrow>Library</Eyebrow>
            <p className="text-[14px] text-foreground/80">
              <span className="font-medium">
                {samples.length} {samples.length === 1 ? "piece" : "pieces"}
              </span>
              {totalWords > 0 && (
                <span className="text-muted">
                  {" · "}
                  {totalWords.toLocaleString()} words total
                </span>
              )}
            </p>
          </div>
        </div>

        {samples.length === 0 && (
          <Card className="text-center py-10">
            <p className="text-[14px] text-muted">
              No samples yet. Add your first one above.
            </p>
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
              <Card as="li" key={s.id} className="space-y-3 transition-all hover:shadow-card-lift hover:border-hairline-strong">
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="text-[15px] font-medium tracking-tight2">
                    {s.name}
                    {isPdf && (
                      <span className="ml-2 inline-block font-mono text-[10px] text-muted uppercase tracking-wider">
                        pdf
                      </span>
                    )}
                  </h3>
                  <span className="font-mono text-[11px] text-muted shrink-0">
                    {s.wordCount.toLocaleString()} words
                  </span>
                </div>
                <p className="text-[13.5px] text-muted leading-relaxed whitespace-pre-wrap">
                  {preview || (
                    <span className="text-foreground/30">Loading preview…</span>
                  )}
                  {fullText.length > preview.length && (
                    <span className="text-foreground/30">…</span>
                  )}
                </p>
                <div className="flex items-center gap-4 pt-1">
                  <GhostButton onClick={() => startEdit(s)}>Edit</GhostButton>
                  <GhostButton
                    onClick={() => handleDelete(s.id)}
                    className="!text-red-600 dark:!text-red-400 hover:!text-red-700 dark:hover:!text-red-300"
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
            Voice matching gets noticeably better once you cross 1,000 words. Keep adding.
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

function ProfileSpinner() {
  return (
    <svg
      className="animate-spin h-3.5 w-3.5"
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
