"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/voice/generate", label: "Generate" },
  { href: "/voice/samples", label: "Samples" },
  { href: "/voice/corrections", label: "Revisions" },
  { href: "/voice/settings", label: "Settings" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-40 bg-white border-b border-hairline">
      <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/voice" className="flex items-center gap-2.5">
          <Image
            src="/ghostwriter.png"
            alt="Ghostwriter"
            width={40}
            height={40}
            priority
            className="h-10 w-10 object-contain"
          />
          <span className="font-wordmark text-[20px] leading-none tracking-[0.04em] text-foreground/90">
            GHOSTWRITER
          </span>
        </Link>
        <div className="flex items-center">
          {TABS.map((tab) => {
            const active =
              pathname === tab.href || pathname?.startsWith(tab.href + "/");
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`relative px-3.5 h-16 inline-flex items-center text-[13.5px] transition-colors ${
                  active
                    ? "text-foreground"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {tab.label}
                {active && (
                  <span className="absolute left-3 right-3 bottom-0 h-px bg-foreground/80" />
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
