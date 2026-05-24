import type { Config } from "tailwindcss";

export default {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        "bg-raised": "var(--bg-raised)",
        "bg-band": "var(--bg-band)",
        "bg-sunken": "var(--bg-sunken)",
        ink: "var(--ink)",
        muted: "var(--muted)",
        faint: "var(--faint)",
        "text-hi": "var(--text-hi)",
        "text-mid": "var(--text-mid)",
        "text-low": "var(--text-low)",
        line: "var(--line)",
        "line-strong": "var(--line-strong)",
        lavender: "var(--lavender)",
        violet: "var(--violet)",
        "violet-deep": "var(--violet-deep)",
        indigo: "var(--indigo)",
        blue: "var(--blue)",
        plum: "var(--plum)",
        accent: "var(--accent)",
        "accent-deep": "var(--accent-deep)",
        background: "var(--background)",
        foreground: "var(--foreground)",
        surface: "var(--surface)",
        hairline: "var(--hairline)",
        "hairline-strong": "var(--hairline-strong)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Hanken Grotesk", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "ui-serif", "Georgia", "Times New Roman", "serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SF Mono", "Menlo", "monospace"],
      },
      letterSpacing: {
        eyebrow: "0.26em",
      },
      boxShadow: {
        bloom: "0 24px 60px -28px rgba(40, 28, 80, 0.5)",
      },
    },
  },
  plugins: [],
} satisfies Config;
