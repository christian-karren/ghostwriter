import Link from "next/link";

export default function VoiceHome() {
  return (
    <div className="pb-8">
      <section className="pt-24 pb-20 flex flex-col items-center text-center">
        <h1 className="text-[44px] sm:text-[56px] font-semibold tracking-tight2 leading-[1.02] max-w-3xl">
          Write in your own voice,
          <br />
          not an LLM&apos;s.
        </h1>
        <p className="mt-6 text-[17px] leading-relaxed text-muted max-w-xl">
          Upload writing you are proud of. Ask the model to draft something new. Anything
          that smells like AI gets caught and flagged before it lands in your draft.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/voice/generate"
            className="inline-flex items-center justify-center gap-1.5 rounded-full bg-foreground text-background px-5 py-2.5 text-[13.5px] font-medium tracking-tight transition-all hover:opacity-95 hover:shadow-card-lift active:translate-y-px"
          >
            Open the generator
            <span aria-hidden className="ml-0.5">→</span>
          </Link>
          <Link
            href="/voice/settings"
            className="inline-flex items-center justify-center rounded-full border border-hairline bg-background px-4 py-2.5 text-[13px] text-foreground/80 transition-colors hover:border-hairline-strong hover:text-foreground"
          >
            Set up your key
          </Link>
        </div>
      </section>

      <section className="pb-24">
        <div className="grid sm:grid-cols-3 gap-4">
          <FeatureCard
            n="01"
            title="Bring your key"
            body="Free Gemini API key from Google AI Studio. Stored locally in your browser. Each user supplies their own, so the tool stays free."
            href="/voice/settings"
            cta="Configure"
          />
          <FeatureCard
            n="02"
            title="Feed it your voice"
            body="Paste or upload essays, blog posts, emails, anything you have written that sounds like you. The more, the better the match."
            href="/voice/samples"
            cta="Add samples"
          />
          <FeatureCard
            n="03"
            title="Generate. Then refine."
            body="Tell it what to write. The draft comes back with em dashes, colons, long sentences, and the &ldquo;not X, it&rsquo;s Y&rdquo; pattern flagged in red."
            href="/voice/generate"
            cta="Generate"
          />
        </div>
      </section>
    </div>
  );
}

function FeatureCard({
  n,
  title,
  body,
  href,
  cta,
}: {
  n: string;
  title: string;
  body: string;
  href: string;
  cta: string;
}) {
  return (
    <Link
      href={href}
      className="group block rounded-2xl border border-hairline bg-surface/40 p-6 transition-all hover:border-hairline-strong hover:bg-surface hover:shadow-card-lift hover:-translate-y-0.5"
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] tracking-eyebrow text-muted">{n}</span>
        <span className="text-muted text-sm transition-transform group-hover:translate-x-0.5 group-hover:text-foreground">
          →
        </span>
      </div>
      <h3 className="mt-6 text-[16px] font-medium tracking-tight2">{title}</h3>
      <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{body}</p>
      <p className="mt-5 text-[12px] text-foreground/70 font-medium">{cta}</p>
    </Link>
  );
}
