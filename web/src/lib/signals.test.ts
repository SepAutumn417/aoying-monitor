import { describe, expect, it } from "vitest";

import type { ApiEvent } from "./api";
import {
  ACTION_LABEL,
  SIGNAL_ACTIONS,
  actionOf,
  countByAction,
  mergeSignalAlerts,
  toSignalAlert,
} from "./signals";
import { PATTERNS, SOUND_LABEL } from "./sound";

function event(id: number, kind: string, payload: Record<string, unknown> = {}): ApiEvent {
  return { id, kind, payload, created_at: "2026-11-09T01:00:00Z" };
}

const OPEN = {
  signal_id: 11,
  action: "open",
  headline: "新开仓 空 BTCUSDT 5x",
  summary: "开仓价 84,768.06 · 数量 11.46",
  symbol: "BTCUSDT",
  side_label: "空",
  leverage: 5,
  entry: 84768.06,
  realized: 0,
  floating: -143.3,
};

describe("actionOf", () => {
  it("reads the action out of the event kind", () => {
    expect(actionOf("signal.open")).toBe("open");
    expect(actionOf("signal.leverage")).toBe("leverage");
  });

  it("ignores every other event kind", () => {
    expect(actionOf("telegram.message")).toBeNull();
    expect(actionOf("signal.")).toBeNull();
    expect(actionOf("signal.bogus")).toBeNull();
  });
});

describe("toSignalAlert", () => {
  it("keeps the wording the server sent instead of reformatting it", () => {
    const alert = toSignalAlert(event(5, "signal.open", OPEN));
    expect(alert).not.toBeNull();
    expect(alert!.headline).toBe("新开仓 空 BTCUSDT 5x");
    expect(alert!.summary).toBe("开仓价 84,768.06 · 数量 11.46");
    expect(alert!.action).toBe("open");
    expect(alert!.leverage).toBe(5);
    expect(alert!.entry).toBe(84768.06);
  });

  it("survives a payload that is missing optional fields", () => {
    const alert = toSignalAlert(event(6, "signal.close", { symbol: "ZECUSDT" }));
    expect(alert).not.toBeNull();
    expect(alert!.leverage).toBeNull();
    expect(alert!.realized).toBeNull();
    // With no headline from the server, fall back to the symbol rather than an
    // empty row.
    expect(alert!.headline).toBe("平仓 ZECUSDT");
    expect(alert!.summary).toBe("");
  });

  it("drops telegram chatter", () => {
    expect(toSignalAlert(event(7, "telegram.message", OPEN))).toBeNull();
  });

  it("marks test pushes so they stay out of the unread count", () => {
    const alert = toSignalAlert(event(8, "signal.open", { ...OPEN, test: true }));
    expect(alert!.test).toBe(true);
  });
});

describe("mergeSignalAlerts", () => {
  it("keeps only signals, newest first", () => {
    const alerts = mergeSignalAlerts([
      event(1, "telegram.message"),
      event(2, "signal.open", OPEN),
      event(9, "signal.close", { headline: "平仓 多 ZECUSDT" }),
      event(4, "signal.reduce", { headline: "减仓 多 ZECUSDT" }),
    ]);
    expect(alerts.map((alert) => alert.id)).toEqual([9, 4, 2]);
  });

  it("trims to the newest N", () => {
    const events = Array.from({ length: 12 }, (_, index) => event(index + 1, "signal.open", OPEN));
    expect(mergeSignalAlerts(events, 5)).toHaveLength(5);
  });

  it("counts by action", () => {
    const alerts = mergeSignalAlerts([
      event(1, "signal.open", OPEN),
      event(2, "signal.open", OPEN),
      event(3, "signal.close", OPEN),
    ]);
    const counts = countByAction(alerts);
    expect(counts.open).toBe(2);
    expect(counts.close).toBe(1);
    expect(counts.add).toBe(0);
  });
});

describe("sounds", () => {
  it("gives every action its own label", () => {
    for (const action of SIGNAL_ACTIONS) {
      expect(SOUND_LABEL[action]).toBeTruthy();
      expect(ACTION_LABEL[action]).toBeTruthy();
    }
  });

  it("gives every action a distinct sound shape", () => {
    // The requirement is that each operation sounds different. Two actions that
    // shared both their pitches and their rhythm would be indistinguishable on
    // a phone speaker, so compare the whole signature, not just the first note.
    const signatures = SIGNAL_ACTIONS.map((action) =>
      PATTERNS[action].map((note) => `${note.frequency}@${note.at}`).join("|"),
    );
    expect(new Set(signatures).size).toBe(SIGNAL_ACTIONS.length);
  });

  it("plays notes in time order", () => {
    for (const action of SIGNAL_ACTIONS) {
      const times = PATTERNS[action].map((note) => note.at);
      expect([...times].sort((a, b) => a - b)).toEqual(times);
      expect(PATTERNS[action].length).toBeGreaterThan(0);
    }
  });
});
