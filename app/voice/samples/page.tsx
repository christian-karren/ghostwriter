"use client";

import { useEffect, useRef, useState } from "react";
import type { Sample } from "../_lib/types";
import {
  addSample,
  deleteSample,
  loadSamples,
  updateSample,
} from "../_lib/storage";
import { extractPdfText, isPdfFile } from "../_lib/pdf";
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

export default function SamplesPage() {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editContent, setEditContent] = useState("");
  const [uploadStatus, setUploadStatus] = useState<{
    state: "idle" | "processing" | "error" | "warn";
    message?: string;
  }>({ state: "idle" });
  const [dragDepth, setDragDepth] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isDragging = dragDepth > 0;
  const isProcessing = uploadStatus.state === "processing";

  useEffect(() => {
    setSamples(loadSamples());
  }, []);

  function refresh() {
    setSamples(loadSamples());
  }

  function handleAdd() {
    if (!content.trim()) return;
    addSample(name || "Untitled", content);
    setName("");
    setContent("");
    refresh();
  }

  function handleDelete(id: string) {
    if (!confirm("Delete this sample?")) return;
    deleteSample(id);
    if (editingId === id) setEditingId(null);
    refresh();
  }

  function startEdit(s: Sample) {
    setEditingId(s.id);
    setEditName(s.name);
    setEditContent(s.content);
  }

  function saveEdit() {
    if (!editingId) return;
    updateSample(editingId, { name: editName, content: editContent });
    setEditingId(null);
    refresh();
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
        if (isPdfFile(file)) {
          text = await extractPdfText(file);
        } else {
          text = await file.text();
        }
        if (!text.trim()) {
          empty.push(file.name);
          continue;
        }
        addSample(cleanName, text);
        added += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${file.name}: ${msg}`);
      }
    }

    refresh();
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

  const totalWords = samples.reduce(
    (acc, s) => acc + s.content.split(/\s+/).filter(Boolean).length,
    0,
  );

  const previewWordCount = content.trim()
    ? content.trim().split(/\s+/).filter(Boolean).length
    : 0;

  return (
    <div className="pt-14 pb-16 space-y-12">
      <PageHeader
        eyebrow="Samples"
        title="Your writing library"
        description="Anything you have written that sounds like you. The more you add, the better the voice match. Aim for a few thousand words across multiple pieces."
      />

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
            const preview = s.content.slice(0, 320);
            const wordCount = s.content.split(/\s+/).filter(Boolean).length;

            if (isEditing) {
              return (
                <Card as="li" key={s.id} className="space-y-3">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className={inputClass}
                  />
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={12}
                    className={textareaClass}
                  />
                  <div className="flex items-center gap-2">
                    <PrimaryButton onClick={saveEdit}>Save</PrimaryButton>
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
                  <h3 className="text-[15px] font-medium tracking-tight2">{s.name}</h3>
                  <span className="font-mono text-[11px] text-muted shrink-0">
                    {wordCount.toLocaleString()} words
                  </span>
                </div>
                <p className="text-[13.5px] text-muted leading-relaxed whitespace-pre-wrap">
                  {preview}
                  {s.content.length > preview.length && (
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
