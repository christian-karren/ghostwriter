"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/voice/generate", label: "Generate" },
  { href: "/voice/samples", label: "Samples" },
  { href: "/voice/settings", label: "Settings" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-40 backdrop-blur-md bg-background/70 border-b border-hairline">
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link
          href="/voice"
          className="group flex items-center gap-2.5"
        >
          <span className="relative inline-flex h-2.5 w-2.5">
            <span className="absolute inset-0 rounded-full bg-accent opacity-60 blur-[3px]" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
          </span>
          <span className="font-semibold tracking-tight2 text-[15px]">Voice</span>
        </Link>
        <div className="flex items-center">
          {TABS.map((tab) => {
            const active =
              pathname === tab.href || pathname?.startsWith(tab.href + "/");
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`relative px-3.5 h-14 inline-flex items-center text-[13.5px] transition-colors ${
                  active
                    ? "text-foreground"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {tab.label}
                {active && (
                  <span className="absolute left-3 right-3 bottom-0 h-px bg-accent" />
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
