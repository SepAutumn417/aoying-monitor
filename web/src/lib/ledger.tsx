import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, type ApiCopyStatus, type ApiPosition, type ApiSignal } from "./api";
import { useAuth } from "./auth";
import { useLive } from "./live";
import type { LiveSocket } from "./socket";

interface LedgerSnapshot {
  status: ApiCopyStatus;
  positions: ApiPosition[];
  signals: ApiSignal[];
  fetchedAt: string;
}
interface LedgerState {
  snapshot: LedgerSnapshot | null;
  loading: boolean;
  error: string | null;
  stale: boolean;
  refresh: () => void;
}
const LedgerContext = createContext<LedgerState | null>(null);

/** Auth-scoped provider persists across routes, but never across user/device sessions. */
export function LedgerProvider({ children }: { children: ReactNode }) {
  const { status, user, device } = useAuth();
  const live = useLive();
  return <SessionLedger key={`${status}:${user?.id}:${device?.id}`} enabled={status === "authenticated"} live={live}>{children}</SessionLedger>;
}

function SessionLedger({ children, enabled, live }: { children: ReactNode; enabled: boolean; live: LiveSocket }) {
  const [snapshot, setSnapshot] = useState<LedgerSnapshot | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const mounted = useRef(false);
  const cursor = useRef(Math.max(0, ...live.events.map((event) => event.id)));
  const previousStatus = useRef(live.status);

  const refresh = useCallback(() => {
    if (!enabled || !mounted.current) return;
    const requestId = ++generation.current;
    setLoading(true);
    setError(null);
    // All three reads belong to one client snapshot; no partial UI updates.
    void Promise.all([
      api.copyStatus(),
      api.positions({ limit: 100, includeEvents: true }),
      api.signals({ limit: 20 }),
    ]).then(([status, positions, signals]) => {
      if (!mounted.current || requestId !== generation.current) return;
      setSnapshot({ status, positions: positions.positions, signals: signals.signals, fetchedAt: new Date().toISOString() });
    }).catch((reason: unknown) => {
      if (!mounted.current || requestId !== generation.current) return;
      setError(reason instanceof Error ? reason.message : "账本加载失败");
    }).finally(() => {
      if (mounted.current && requestId === generation.current) setLoading(false);
    });
  }, [enabled]);

  useEffect(() => {
    mounted.current = true;
    refresh();
    return () => { mounted.current = false; generation.current += 1; };
  }, [refresh]);

  useEffect(() => {
    const incoming = live.events.filter((event) => event.id > cursor.current);
    cursor.current = Math.max(cursor.current, ...incoming.map((event) => event.id));
    const invalidated = incoming.some((event) => event.payload.test !== true && (
      event.kind.startsWith("signal.") || event.kind === "telegram.message.edited" || event.kind === "telegram.message.deleted"
    ));
    const recovered = live.status === "live" && previousStatus.current !== "live";
    previousStatus.current = live.status;
    if (invalidated || recovered) refresh();
  }, [live.events, live.status, refresh]);

  const stale = snapshot !== null && (loading || error !== null || live.status !== "live");
  const value = useMemo(() => ({ snapshot, loading, error, stale, refresh }), [snapshot, loading, error, stale, refresh]);
  return <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>;
}

export function useLedger(): LedgerState {
  const value = useContext(LedgerContext);
  if (!value) throw new Error("useLedger 必须在 LedgerProvider 内使用");
  return value;
}
