import type { Metadata } from "next";
import { Nav } from "./_components/Nav";

export const metadata: Metadata = {
  title: "Ghostwriter — write in your own voice",
  description:
    "Upload your writing samples, then have an LLM draft new prose that actually sounds like you.",
};

export default function VoiceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="voice-root min-h-screen relative isolate">
      <div className="voice-hero-bg pointer-events-none absolute inset-x-0 top-0 h-[420px] -z-10" />
      <Nav />
      <main className="max-w-5xl mx-auto px-6 pb-16">{children}</main>
    </div>
  );
}
