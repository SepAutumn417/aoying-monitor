/**
 * Trading signals carried over the live socket.
 *
 * The backend encodes the action in the event *kind* (`signal.open`,
 * `signal.close`, …) rather than only inside the payload, so a client can pick
 * a sound from the kind alone and never has to parse a message to decide
 * whether something is worth ringing for.
 *
 * Everything here is pure: no sockets, no audio, no DOM. The alert centre and
 * the alerts page both read from these helpers so the two can never disagree
 * about what counts as a signal.
 */

import type { ApiEvent } from "./api";

export type SignalAction = "open" | "add" | "reduce" | "close" | "leverage";

export const SIGNAL_ACTIONS: readonly SignalAction[] = [
  "open",
  "add",
  "reduce",
  "close",
  "leverage",
] as const;

export const SIGNAL_EVENT_PREFIX = "signal.";

export const ACTION_LABEL: Record<SignalAction, string> = {
  open: "新开仓",
  add: "加仓",
  reduce: "减仓",
  close: "平仓",
  leverage: "调杠杆",
};

/** One line of plain language, used where the label alone is too terse. */
export const ACTION_HINT: Record<SignalAction, string> = {
  open: "他开了一笔新仓",
  add: "他在原有仓位上加大",
  reduce: "他减掉了一部分仓位",
  close: "他把这笔平掉了",
  leverage: "只调了杠杆，仓位没变",
};

const ACTION_TONE: Record<SignalAction, string> = {
  open: "border-signal-400/40 bg-signal-400/10 text-signal-300",
  add: "border-signal-400/30 bg-signal-400/[0.07] text-signal-300",
  reduce: "border-amber-signal/40 bg-amber-signal/10 text-amber-signal",
  close: "border-mist-400/30 bg-white/[0.05] text-mist-200",
  leverage: "border-mist-400/25 bg-white/[0.03] text-mist-400",
};

export function actionTone(action: SignalAction): string {
  return ACTION_TONE[action];
}

export function isSignalAction(value: unknown): value is SignalAction {
  return typeof value === "string" && (SIGNAL_ACTIONS as readonly string[]).includes(value);
}

/** `signal.close` → `close`; anything else → null. */
export function actionOf(kind: string): SignalAction | null {
  if (!kind.startsWith(SIGNAL_EVENT_PREFIX)) return null;
  const action = kind.slice(SIGNAL_EVENT_PREFIX.length);
  return isSignalAction(action) ? action : null;
}

export interface SignalAlert {
  /** Event id — stable, monotonic, and what the socket de-duplicates on. */
  id: number;
  action: SignalAction;
  headline: string;
  summary: string;
  symbol: string;
  sideLabel: string;
  leverage: number | null;
  entry: number | null;
  realized: number | null;
  floating: number | null;
  createdAt: string;
  /** Published by the "发送测试信号" button; shown but never rung for. */
  test: boolean;
}

function text(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  return typeof value === "string" ? value : "";
}

function num(payload: Record<string, unknown>, key: string): number | null {
  const value = payload[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Turn one socket event into an alert, or null when it is not a signal.
 *
 * The headline and summary are copied from the payload rather than rebuilt
 * here: the backend already owns the Chinese wording and the number formatting,
 * and a second formatter would drift from it.
 */
export function toSignalAlert(event: ApiEvent): SignalAlert | null {
  const action = actionOf(event.kind);
  if (!action) return null;
  const payload = event.payload ?? {};
  const symbol = text(payload, "symbol");
  const fallback = symbol ? `${ACTION_LABEL[action]} ${symbol}` : ACTION_LABEL[action];
  return {
    id: event.id,
    action,
    headline: text(payload, "headline") || fallback,
    summary: text(payload, "summary"),
    symbol,
    sideLabel: text(payload, "side_label"),
    leverage: num(payload, "leverage"),
    entry: num(payload, "entry"),
    realized: num(payload, "realized"),
    floating: num(payload, "floating"),
    createdAt: event.created_at,
    test: payload.test === true,
  };
}

/** Newest first, capped so a long session cannot grow the page without bound. */
export function mergeSignalAlerts(events: ApiEvent[], limit = 200): SignalAlert[] {
  const alerts: SignalAlert[] = [];
  for (const event of events) {
    const alert = toSignalAlert(event);
    if (alert) alerts.push(alert);
  }
  alerts.sort((a, b) => b.id - a.id);
  return alerts.slice(0, limit);
}

export function countByAction(alerts: SignalAlert[]): Record<SignalAction, number> {
  const counts: Record<SignalAction, number> = {
    open: 0,
    add: 0,
    reduce: 0,
    close: 0,
    leverage: 0,
  };
  for (const alert of alerts) counts[alert.action] += 1;
  return counts;
}
