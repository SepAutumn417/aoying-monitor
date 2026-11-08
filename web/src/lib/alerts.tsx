/**
 * The alert centre: turns live socket traffic into ringable signals.
 *
 * Two rules keep this from becoming noise:
 *
 * 1. The first batch we ever see is history, not news. On connect the server
 *    replays whatever we missed, which may be a hundred events; ringing for
 *    them would sound like an alarm clock. So the first non-empty batch only
 *    sets the cursor.
 * 2. A batch rings at most once. If five signals land in the same second, the
 *    phone plays the most consequential one (open beats close beats add beats
 *    reduce beats leverage) instead of five overlapping chimes.
 *
 * A third rule covers test signals (`发送测试信号` in Settings). They do ring,
 * because the point of a rehearsal is to prove the chime travels the real path
 * -- backend event, socket, speaker -- not to play a tone locally. What keeps
 * them harmless is that they never count as unread and the feed labels them
 * 测试, so a rehearsal cannot be mistaken for a trade.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useLive } from "./live";
import { mergeSignalAlerts, type SignalAction, type SignalAlert } from "./signals";
import { isMuted, play, setMuted as setSoundMuted, unlock } from "./sound";

/** When several actions arrive together, the loudest one wins. */
const RING_PRIORITY: SignalAction[] = ["open", "close", "add", "reduce", "leverage"];

function loudest(alerts: SignalAlert[]): SignalAlert | null {
  for (const action of RING_PRIORITY) {
    const match = alerts.find((alert) => alert.action === action);
    if (match) return match;
  }
  return null;
}

export type NotifyPermission = "unsupported" | "default" | "granted" | "denied";

export interface AlertCentre {
  alerts: SignalAlert[];
  latest: SignalAlert | null;
  unread: number;
  markRead: () => void;
  muted: boolean;
  toggleMuted: () => void;
  /** Replays the chime for one action — used by the sound picker. */
  preview: (action: SignalAction) => boolean;
  permission: NotifyPermission;
  requestPermission: () => void;
  desktopNotify: boolean;
  toggleDesktopNotify: () => void;
  /** Set when the browser refused to make any sound at all. */
  soundBlocked: boolean;
}

const AlertContext = createContext<AlertCentre | null>(null);

function currentPermission(): NotifyPermission {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission as NotifyPermission;
}

export function AlertProvider({ children }: { children: ReactNode }) {
  const { events } = useLive();
  const [alerts, setAlerts] = useState<SignalAlert[]>([]);
  const [readUpTo, setReadUpTo] = useState(0);
  const [muted, setMutedState] = useState(isMuted());
  const [permission, setPermission] = useState<NotifyPermission>(currentPermission);
  const [desktopNotify, setDesktopNotify] = useState(false);
  const [soundBlocked, setSoundBlocked] = useState(false);

  const cursorRef = useRef(0);
  const primedRef = useRef(false);

  useEffect(() => {
    if (!events.length) return;
    const next = mergeSignalAlerts(events);
    setAlerts(next);

    const newest = next.length ? next[0].id : 0;
    if (!primedRef.current) {
      // History: adopt the cursor silently.
      primedRef.current = true;
      cursorRef.current = newest;
      setReadUpTo(newest);
      return;
    }
    if (newest <= cursorRef.current) return;

    // Test signals are included on purpose: a rehearsal that skips the ring
    // would not prove the speaker works. They stay out of `unread` instead,
    // which is where a fake trade could actually mislead someone.
    const fresh = next.filter((alert) => alert.id > cursorRef.current);
    cursorRef.current = Math.max(cursorRef.current, newest);
    if (!fresh.length) return;

    const alert = loudest(fresh);
    if (!alert) return;
    const played = play(alert.action);
    if (!played && !muted) setSoundBlocked(true);
    if (!played && muted) setSoundBlocked(false);

    if (desktopNotify && typeof Notification !== "undefined" && Notification.permission === "granted") {
      try {
        new Notification(alert.headline, {
          body: alert.summary,
          tag: `signal-${alert.id}`,
          silent: true, // the chime above already fired
        });
      } catch {
        // Some browsers throw when constructing notifications outside a
        // service worker; the in-app feed is still correct, so stay quiet.
      }
    }
  }, [events, desktopNotify, muted]);

  // Browsers gate audio behind a gesture. Grab the first one the user makes.
  useEffect(() => {
    const handler = () => unlock();
    window.addEventListener("pointerdown", handler, { once: true });
    window.addEventListener("keydown", handler, { once: true });
    return () => {
      window.removeEventListener("pointerdown", handler);
      window.removeEventListener("keydown", handler);
    };
  }, []);

  // Leaving the tab is exactly when a desktop notification earns its keep.
  const unread = useMemo(
    () => alerts.filter((alert) => alert.id > readUpTo && !alert.test).length,
    [alerts, readUpTo],
  );

  const markRead = useCallback(() => {
    setReadUpTo((previous) => Math.max(previous, alerts.length ? alerts[0].id : previous));
  }, [alerts]);

  const toggleMuted = useCallback(() => {
    setMutedState((previous) => {
      const next = !previous;
      setSoundMuted(next);
      return next;
    });
  }, []);

  const preview = useCallback((action: SignalAction) => {
    unlock();
    return play(action, { force: true });
  }, []);

  const requestPermission = useCallback(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPermission("unsupported");
      return;
    }
    void Notification.requestPermission().then((result) => {
      setPermission(result as NotifyPermission);
      if (result === "granted") setDesktopNotify(true);
    });
  }, []);

  const toggleDesktopNotify = useCallback(() => {
    setDesktopNotify((previous) => {
      if (!previous && typeof Notification !== "undefined" && Notification.permission !== "granted") {
        requestPermission();
        return previous;
      }
      return !previous;
    });
  }, [requestPermission]);

  const value: AlertCentre = {
    alerts,
    latest: alerts[0] ?? null,
    unread,
    markRead,
    muted,
    toggleMuted,
    preview,
    permission,
    requestPermission,
    desktopNotify,
    toggleDesktopNotify,
    soundBlocked,
  };

  return <AlertContext.Provider value={value}>{children}</AlertContext.Provider>;
}

export function useAlerts(): AlertCentre {
  const value = useContext(AlertContext);
  if (!value) throw new Error("useAlerts 必须在 AlertProvider 内使用");
  return value;
}
