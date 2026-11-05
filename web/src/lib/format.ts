export function usd(value: number, digits = 0): string {
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function compactUsd(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

export function signedPct(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function price(value: number): string {
  if (value >= 1000) return value.toLocaleString("en-US", { maximumFractionDigits: 1 });
  if (value >= 1) return value.toFixed(2);
  return value.toFixed(4);
}

export function pnlTone(value: number): string {
  return value >= 0 ? "text-signal-300" : "text-danger";
}
