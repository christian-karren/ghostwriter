import type { ReactNode } from "react";

export function Eyebrow({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`text-[11px] font-medium uppercase tracking-eyebrow text-accent ${className}`}
    >
      {children}
    </p>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  align = "left",
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  align?: "left" | "center";
}) {
  const alignClass = align === "center" ? "items-center text-center" : "items-start";
  return (
    <header className={`flex flex-col gap-3 ${alignClass}`}>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h1 className="text-[28px] sm:text-[32px] font-semibold tracking-tight2 leading-[1.1]">
        {title}
      </h1>
      {description && (
        <p className="text-[15px] text-muted leading-relaxed max-w-prose">{description}</p>
      )}
    </header>
  );
}

export function Card({
  children,
  className = "",
  as: As = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "li";
}) {
  return (
    <As
      className={`rounded-2xl border border-hairline bg-surface/40 backdrop-blur-[2px] p-6 shadow-card ${className}`}
    >
      {children}
    </As>
  );
}

export function FieldLabel({
  children,
  htmlFor,
}: {
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-[13px] font-medium text-foreground/90"
    >
      {children}
    </label>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="text-[12.5px] text-muted leading-relaxed">{children}</p>;
}

const inputBase =
  "w-full px-3.5 py-2.5 rounded-lg bg-background border border-hairline text-[14px] " +
  "transition-colors placeholder:text-foreground/35 hover:border-hairline-strong " +
  "focus:outline-none focus:border-accent/60 focus:ring-4 focus:ring-accent/10 " +
  "disabled:opacity-50 disabled:cursor-not-allowed";

export const inputClass = inputBase;
export const textareaClass = `${inputBase} leading-relaxed resize-y`;

export function PrimaryButton({
  children,
  onClick,
  disabled,
  type = "button",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded-full bg-foreground text-background px-5 py-2.5 text-[13.5px] font-medium tracking-tight transition-all hover:opacity-95 hover:shadow-card-lift active:translate-y-px disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none ${className}`}
    >
      {children}
    </button>
  );
}

export function AccentButton({
  children,
  onClick,
  disabled,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded-full bg-accent text-background px-5 py-2.5 text-[13.5px] font-medium tracking-tight transition-all hover:brightness-105 hover:shadow-card-lift active:translate-y-px disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none ${className}`}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  onClick,
  disabled,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded-full border border-hairline bg-background px-4 py-2 text-[13px] text-foreground/80 transition-colors hover:border-hairline-strong hover:text-foreground hover:bg-surface disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  onClick,
  disabled,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`text-[12.5px] text-muted hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
    >
      {children}
    </button>
  );
}

export function Banner({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "warn" | "error" | "success";
}) {
  const styles: Record<typeof tone, string> = {
    info: "border-hairline bg-surface/40 text-foreground/80",
    warn: "border-amber-500/25 bg-amber-500/[0.04] text-amber-700 dark:text-amber-200",
    error: "border-red-500/25 bg-red-500/[0.04] text-red-700 dark:text-red-300",
    success:
      "border-accent/30 bg-accent-soft text-emerald-700 dark:text-emerald-300",
  };
  return (
    <div
      className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-[13px] leading-relaxed ${styles[tone]}`}
    >
      <span className="mt-[5px] inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-70" />
      <span>{children}</span>
    </div>
  );
}
