import type { ReactNode } from "react";

export function Eyebrow({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <p className={`eyebrow ${className}`}>{children}</p>;
}

export function Accent({ children }: { children: ReactNode }) {
  return <span className="italic font-serif">{children}</span>;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  align = "left",
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  align?: "left" | "center";
}) {
  const alignClass =
    align === "center" ? "items-center text-center" : "items-start";
  return (
    <header className={`relative flex flex-col gap-5 ${alignClass} reveal`}>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h1 className="font-serif text-[44px] sm:text-[56px] md:text-[64px] font-[400] tracking-[-0.015em] leading-[1.04] text-ink whitespace-nowrap">
        {title}
      </h1>
      {description && (
        <p className="text-[16px] text-muted leading-[1.6] max-w-[60ch]">
          {description}
        </p>
      )}
    </header>
  );
}

export function Card({
  children,
  className = "",
  as: As = "div",
  style,
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "li";
  style?: React.CSSProperties;
}) {
  return (
    <As className={`surface p-6 sm:p-7 ${className}`} style={style}>
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
    <label htmlFor={htmlFor} className="eyebrow block">
      {children}
    </label>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return (
    <p className="text-[12.5px] text-faint leading-relaxed">{children}</p>
  );
}

export const inputClass = "field";
export const textareaClass = "field leading-relaxed resize-y";

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
      className={`cta-primary inline-flex items-center justify-center gap-1.5 px-5 py-2.5 text-[14px] ${className}`}
    >
      {children}
    </button>
  );
}

export function AccentButton(props: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return <PrimaryButton {...props} />;
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
      className={`cta-secondary inline-flex items-center justify-center gap-1.5 px-4 py-2 text-[13.5px] font-medium ${className}`}
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
      className={`text-[12.5px] text-muted hover:text-ink transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
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
    info: "text-muted border-line",
    warn: "text-amber-700 border-amber-300/40",
    error: "text-rose-700 border-rose-300/40",
    success: "text-violet-700 border-violet-300/40",
  };
  return (
    <div
      className={`flex items-start gap-2.5 rounded-xl border bg-white/60 backdrop-blur px-4 py-3 text-[13px] leading-relaxed ${styles[tone]}`}
    >
      <span className="mt-[5px] inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-70" />
      <span>{children}</span>
    </div>
  );
}
