"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { extractPdfText, isPdfFile } from "../_lib/pdf";
import { addSample, saveSettings } from "../_lib/storage";
import { useData } from "../_lib/DataProvider";

const WELCOME_AUTO_ADVANCE_MS = 3000;
const FADE_MS = 160;

type Step = "welcome" | "samples" | "apiKey";

function wait(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

export default function OnboardingPage() {
  const router = useRouter();
  const { settings, refreshSamples, refreshSettings } = useData();
  const [step, setStep] = useState<Step>("welcome");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setVisible(true), 20);
    return () => window.clearTimeout(t);
  }, []);

  async function transitionTo(next: Step) {
    setVisible(false);
    await wait(FADE_MS);
    setStep(next);
    await wait(20);
    setVisible(true);
  }

  async function fadeOutAndNavigate(href: string) {
    setVisible(false);
    await wait(FADE_MS);
    router.replace(href);
  }

  async function finish() {
    await saveSettings({ ...settings, onboardingComplete: true });
    await refreshSettings();
    await fadeOutAndNavigate("/voice/generate");
  }

  const content = (() => {
    if (step === "welcome") {
      return <WelcomeStep onAdvance={() => transitionTo("samples")} />;
    }
    if (step === "samples") {
      return (
        <SamplesStep
          onUploaded={async () => {
            await refreshSamples();
            await transitionTo("apiKey");
          }}
          onSkip={() => transitionTo("apiKey")}
        />
      );
    }
    return (
      <ApiKeyStep
        currentKey={settings.apiKey}
        onContinue={async (key) => {
          await saveSettings({ ...settings, apiKey: key, onboardingComplete: true });
          await refreshSettings();
          await fadeOutAndNavigate("/voice/generate");
        }}
        onSkip={finish}
      />
    );
  })();

  return (
    <div
      className="fixed inset-0 transition-opacity ease-out"
      style={{
        opacity: visible ? 1 : 0,
        transitionDuration: `${FADE_MS}ms`,
      }}
    >
      {content}
    </div>
  );
}

function WelcomeStep({ onAdvance }: { onAdvance: () => void }) {
  const advancedRef = useRef(false);
  const safeAdvance = () => {
    if (advancedRef.current) return;
    advancedRef.current = true;
    onAdvance();
  };

  useEffect(() => {
    const t = window.setTimeout(safeAdvance, WELCOME_AUTO_ADVANCE_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <button
      type="button"
      onClick={safeAdvance}
      className="fixed inset-0 min-h-screen w-full bg-white text-neutral-700 flex flex-col items-center justify-center px-8 cursor-pointer focus:outline-none"
      aria-label="Continue"
    >
      <h1 className="text-[44px] sm:text-[64px] md:text-[72px] font-semibold tracking-tight2 text-neutral-800 text-center leading-[1.02]">
        Welcome to Ghostwriter
      </h1>
      <p className="mt-5 text-[18px] sm:text-[20px] text-neutral-500 text-center">
        Teach AI to write in your voice
      </p>
      <Image
        src="/ghostwriter.png"
        alt="Ghostwriter"
        width={260}
        height={260}
        priority
        className="mt-12 w-56 h-56 sm:w-64 sm:h-64 object-contain"
      />
    </button>
  );
}

function SamplesStep({
  onUploaded,
  onSkip,
}: {
  onUploaded: () => void | Promise<void>;
  onSkip: () => void;
}) {
  const [dragDepth, setDragDepth] = useState(0);
  const [status, setStatus] = useState<{
    state: "idle" | "processing" | "error";
    message?: string;
  }>({ state: "idle" });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isDragging = dragDepth > 0;
  const isProcessing = status.state === "processing";

  async function processFiles(files: FileList | File[]) {
    const list = Array.from(files).filter(isPdfFile);
    if (list.length === 0) {
      setStatus({
        state: "error",
        message: "Only PDF files for now. You can add other formats later from Samples.",
      });
      return;
    }
    setStatus({
      state: "processing",
      message: `Reading ${list.length} ${list.length === 1 ? "PDF" : "PDFs"}…`,
    });

    let added = 0;
    const errors: string[] = [];
    for (const file of list) {
      try {
        const cleanName = file.name.replace(/\.pdf$/i, "");
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const text = await extractPdfText(file);
        if (!text.trim()) {
          errors.push(`${file.name}: no extractable text`);
          continue;
        }
        await addSample({
          name: cleanName,
          kind: "own",
          bytes,
          mimeType: "application/pdf",
          extractedText: text,
        });
        added += 1;
      } catch (err) {
        errors.push(`${file.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (fileInputRef.current) fileInputRef.current.value = "";

    if (added > 0) {
      setStatus({ state: "idle" });
      await onUploaded();
      return;
    }
    setStatus({
      state: "error",
      message: errors.join(" | ") || "No PDFs uploaded. Try again.",
    });
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes("Files")) setDragDepth((d) => d + 1);
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
  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) processFiles(e.target.files);
  }

  return (
    <div className="fixed inset-0 min-h-screen w-full bg-white text-neutral-800 flex flex-col">
      <div className="flex items-center justify-end px-8 pt-6 sm:pt-8">
        <button
          type="button"
          onClick={onSkip}
          disabled={isProcessing}
          className="rounded-full border border-neutral-300 px-5 py-2 text-[13.5px] text-neutral-600 hover:text-neutral-900 hover:border-neutral-400 transition-colors disabled:opacity-50 disabled:pointer-events-none"
        >
          Do it later
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-12 max-w-2xl mx-auto w-full">
        <h2 className="text-[32px] sm:text-[40px] font-semibold tracking-tight2 text-neutral-800 text-center leading-[1.1]">
          Upload a writing sample
        </h2>
        <p className="mt-4 text-[15px] sm:text-[16px] text-neutral-500 text-center max-w-lg leading-relaxed">
          Drop in at least one PDF you wrote, or a piece of writing you admire. The more
          samples you add, the better the voice match. You can add more later.
        </p>

        <label
          htmlFor="onboarding-file"
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className={`mt-10 w-full flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-16 text-center transition-all ${
            isProcessing
              ? "cursor-wait border-neutral-300 bg-neutral-50"
              : isDragging
                ? "cursor-copy border-neutral-800 bg-neutral-50 scale-[1.01]"
                : "cursor-pointer border-neutral-300 bg-neutral-50/40 hover:border-neutral-400 hover:bg-neutral-50"
          }`}
        >
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
              isDragging ? "bg-neutral-200 text-neutral-800" : "bg-neutral-100 text-neutral-500"
            }`}
          >
            {isProcessing ? <Spinner big /> : <UploadIcon />}
          </div>
          <p className="text-[15px] font-medium text-neutral-700">
            {isProcessing
              ? status.message
              : isDragging
                ? "Release to upload"
                : "Drop PDFs here, or click to browse"}
          </p>
          {!isProcessing && !isDragging && (
            <p className="text-[12.5px] text-neutral-500 font-mono">PDF only</p>
          )}
          <input
            id="onboarding-file"
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            multiple
            disabled={isProcessing}
            onChange={handleInputChange}
            className="sr-only"
          />
        </label>

        {status.state === "error" && status.message && (
          <p className="mt-4 text-[13px] text-red-600 text-center max-w-md">
            {status.message}
          </p>
        )}
      </div>
    </div>
  );
}

function ApiKeyStep({
  currentKey,
  onContinue,
  onSkip,
}: {
  currentKey: string;
  onContinue: (key: string) => void | Promise<void>;
  onSkip: () => void | Promise<void>;
}) {
  const [key, setKey] = useState(currentKey);
  const [reveal, setReveal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleContinue() {
    if (!key.trim()) return;
    setSubmitting(true);
    try {
      await onContinue(key.trim());
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 min-h-screen w-full bg-white text-neutral-800 flex flex-col">
      <div className="flex items-center justify-end px-8 pt-6 sm:pt-8">
        <button
          type="button"
          onClick={onSkip}
          disabled={submitting}
          className="rounded-full border border-neutral-300 px-5 py-2 text-[13.5px] text-neutral-600 hover:text-neutral-900 hover:border-neutral-400 transition-colors disabled:opacity-50 disabled:pointer-events-none"
        >
          Do it later
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-12 max-w-xl mx-auto w-full">
        <h2 className="text-[32px] sm:text-[40px] font-semibold tracking-tight2 text-neutral-800 text-center leading-[1.1]">
          Add your Gemini API key
        </h2>
        <p className="mt-4 text-[15px] sm:text-[16px] text-neutral-500 text-center leading-relaxed">
          Ghostwriter uses Google&apos;s free Gemini API to draft for you. Grab a free key
          from{" "}
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="text-neutral-900 underline decoration-neutral-300 underline-offset-4 hover:decoration-neutral-800"
          >
            aistudio.google.com/apikey
          </a>{" "}
          (sign in, click &ldquo;Create API key&rdquo;).
        </p>

        <div className="mt-10 w-full">
          <label
            htmlFor="onboarding-api-key"
            className="block text-[11.5px] uppercase tracking-eyebrow text-neutral-500 mb-2"
          >
            API key
          </label>
          <div className="relative">
            <input
              id="onboarding-api-key"
              type={reveal ? "text" : "password"}
              value={key}
              onChange={(e) => setKey(e.target.value.trim())}
              placeholder="AIza..."
              spellCheck={false}
              autoComplete="off"
              className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 pr-16 font-mono text-[13.5px] text-neutral-800 placeholder-neutral-400 outline-none transition-colors focus:border-neutral-500"
            />
            <button
              type="button"
              onClick={() => setReveal((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-md text-[11px] text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 transition-colors"
            >
              {reveal ? "Hide" : "Show"}
            </button>
          </div>
          <p className="mt-2 text-[12px] text-neutral-500">
            Stored in your macOS Keychain. Never touches disk.
          </p>
        </div>

        <button
          type="button"
          onClick={handleContinue}
          disabled={!key.trim() || submitting}
          className="mt-8 inline-flex items-center justify-center gap-1.5 rounded-full bg-neutral-900 text-white px-6 py-3 text-[14px] font-medium tracking-tight transition-all hover:bg-neutral-800 disabled:opacity-40 disabled:pointer-events-none"
        >
          {submitting ? (
            <>
              <Spinner />
              Saving…
            </>
          ) : (
            <>
              Continue
              <span aria-hidden className="ml-0.5">→</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function Spinner({ big = false }: { big?: boolean }) {
  const size = big ? "h-5 w-5" : "h-3.5 w-3.5";
  return (
    <svg
      className={`animate-spin ${size}`}
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
