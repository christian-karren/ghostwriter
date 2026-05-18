import type { Metadata } from "next";
import { Nav } from "./_components/Nav";

export const metadata: Metadata = {
  title: "Voice — write in your own voice",
  description:
    "Upload your writing samples, then have an LLM generate new prose that actually sounds like you.",
};

export default function VoiceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="voice-root min-h-screen relative isolate">
      <div className="voice-hero-bg pointer-events-none absolute inset-x-0 top-0 h-[420px] -z-10" />
      <Nav />
      <main className="max-w-5xl mx-auto px-6">{children}</main>
      <footer className="max-w-5xl mx-auto px-6 py-12 mt-12 border-t border-hairline">
        <p className="text-[12px] text-muted">
          Voice. A personal tool. All data lives in your browser.
        </p>
      </footer>
    </div>
  );
}
