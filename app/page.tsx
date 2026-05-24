"use client";

import { useEffect } from "react";

export default function Home() {
  useEffect(() => {
    window.location.replace("/voice/");
  }, []);

  return (
    <>
      <noscript>
        <meta httpEquiv="refresh" content="0; url=/voice/" />
        <p>
          <a href="/voice/">Continue to Ghostwriter</a>
        </p>
      </noscript>
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-[13px] text-muted">Opening Ghostwriter…</div>
      </div>
    </>
  );
}
