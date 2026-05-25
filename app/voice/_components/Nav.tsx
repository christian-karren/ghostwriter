"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { useMobileNav } from "./MobileNav";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";
const LOGO_SRC = `${BASE}/ghostwriter.png`;

const TABS = [
  { href: "/voice/generate", label: "Generate" },
  { href: "/voice/samples", label: "Samples" },
  { href: "/voice/corrections", label: "Revisions" },
  { href: "/voice/settings", label: "Settings" },
];

export function Nav() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const { openHistory } = useMobileNav();

  // Close the mobile menu whenever the route changes
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const showHistoryItem =
    pathname === "/voice/generate" || pathname?.startsWith("/voice/generate/");

  return (
    <nav className="sticky top-0 z-40 bg-white border-b border-hairline">
      <div className="h-16 flex items-stretch">
        <Link
          href="/voice"
          className="md:w-[240px] shrink-0 flex items-center md:justify-center gap-2.5 pl-4 md:pl-0"
        >
          <Image
            src={LOGO_SRC}
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

        {/* Desktop tabs */}
        <div className="hidden md:flex flex-1 items-center justify-end px-6">
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

        {/* Mobile hamburger */}
        <div className="flex md:hidden flex-1 items-center justify-end pr-4">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Open menu"
            aria-expanded={menuOpen}
            className="inline-flex items-center justify-center w-10 h-10 text-ink"
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 22 22"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              aria-hidden
            >
              <line x1="3" y1="6" x2="19" y2="6" />
              <line x1="3" y1="11" x2="19" y2="11" />
              <line x1="3" y1="16" x2="19" y2="16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="md:hidden border-t border-hairline bg-white">
          {TABS.map((tab) => {
            const active =
              pathname === tab.href || pathname?.startsWith(tab.href + "/");
            return (
              <Link
                key={tab.href}
                href={tab.href}
                onClick={() => setMenuOpen(false)}
                className={`block px-6 py-3.5 text-[15px] transition-colors ${
                  active
                    ? "text-foreground bg-bg-raised"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
          {showHistoryItem && (
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                openHistory();
              }}
              className="block w-full text-left px-6 py-3.5 text-[15px] text-muted hover:text-foreground transition-colors border-t border-hairline"
            >
              Chat History
            </button>
          )}
        </div>
      )}
    </nav>
  );
}
