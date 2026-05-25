"use client";

import { useEffect } from "react";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";
const TARGET = `${BASE}/voice/`;

export default function Home() {
  useEffect(() => {
    window.location.replace(TARGET);
  }, []);

  return (
    <>
      <noscript>
        <meta httpEquiv="refresh" content={`0; url=${TARGET}`} />
        <p>
          <a href={TARGET}>Continue to Ghostwriter</a>
        </p>
      </noscript>
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-[13px] text-muted">Opening Ghostwriter…</div>
      </div>
    </>
  );
}
