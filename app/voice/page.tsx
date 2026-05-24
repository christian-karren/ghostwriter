"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useData } from "./_lib/DataProvider";

export default function VoiceEntry() {
  const router = useRouter();
  const { settings } = useData();

  useEffect(() => {
    if (settings.onboardingComplete) {
      router.replace("/voice/generate");
    } else {
      router.replace("/voice/onboarding");
    }
  }, [router, settings.onboardingComplete]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <span className="text-[13px] text-muted">Opening Ghostwriter…</span>
    </div>
  );
}
