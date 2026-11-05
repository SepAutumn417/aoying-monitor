type Tone = "ok" | "pending" | "warn";

const toneClass: Record<Tone, string> = {
  ok: "border-signal-400/30 bg-signal-400/10 text-signal-300",
  pending: "border-mist-400/25 bg-mist-400/10 text-mist-200",
  warn: "border-amber-signal/30 bg-amber-signal/10 text-amber-signal",
};

export function StatusPill({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] ${toneClass[tone]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}
