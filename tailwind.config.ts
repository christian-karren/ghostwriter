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
        background: "var(--background)",
        foreground: "var(--foreground)",
        muted: "var(--muted)",
        surface: "var(--surface)",
        hairline: "var(--hairline)",
        "hairline-strong": "var(--hairline-strong)",
        accent: "var(--accent)",
        "accent-soft": "var(--accent-soft)",
      },
      letterSpacing: {
        eyebrow: "0.16em",
        tight2: "-0.022em",
      },
      boxShadow: {
        card: "0 1px 2px rgba(15, 23, 42, 0.04), 0 4px 14px -8px rgba(15, 23, 42, 0.06)",
        "card-lift":
          "0 1px 2px rgba(15, 23, 42, 0.04), 0 12px 28px -12px rgba(15, 23, 42, 0.14)",
      },
    },
  },
  plugins: [],
} satisfies Config;
