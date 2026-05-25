"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { DataProvider } from "../_lib/DataProvider";
import { Atmosphere } from "./Atmosphere";
import { MobileNavProvider } from "./MobileNav";
import { Nav } from "./Nav";

export function VoiceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isOnboarding = pathname?.startsWith("/voice/onboarding") ?? false;

  return (
    <DataProvider>
      <Atmosphere />
      {isOnboarding ? (
        children
      ) : (
        <MobileNavProvider>
          <Nav />
          <main className="max-w-5xl mx-auto px-6 pb-16 relative">{children}</main>
        </MobileNavProvider>
      )}
    </DataProvider>
  );
}
