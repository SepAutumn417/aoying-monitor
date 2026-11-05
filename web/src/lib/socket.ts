/**
 * Live event socket.
 *
 * One connection per tab. The server hands out a single-use ticket, we redeem
 * it, then keep the socket alive with a ping every 25s (the server drops idle
 * sockets after 75s). On any drop we reconnect with exponential backoff and
 * replay from the last event id we saw, so nothing is silently lost.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { api, getAccessToken, wsUrlFor, type ApiEvent } from "./api";

export type SocketStatus = "idle" | "connecting" | "live" | "retrying" | "offline";

const PING_INTERVAL_MS = 25_000;
const MAX_BACKOFF_MS = 30_000;

export interface LiveSocket {
  status: SocketStatus;
  events: ApiEvent[];
  lastEventId: number;
  reconnect: () => void;
}

export function useLiveSocket(enabled: boolean): LiveSocket {
  const [status, setStatus] = useState<SocketStatus>("idle");
  const [events, setEvents] = useState<ApiEvent[]>([]);
  const [lastEventId, setLastEventId] = useState(0);

  const socketRef = useRef<WebSocket | null>(null);
  const pingRef = useRef<number | null>(null);
  const retryRef = useRef<number | null>(null);
  const cursorRef = useRef(0);
  const attemptRef = useRef(0);
  const closedByUs = useRef(false);

  const remember = useCallback((incoming: ApiEvent[]) => {
    if (!incoming.length) return;
    cursorRef.current = Math.max(cursorRef.current, ...incoming.map((event) => event.id));
    setLastEventId(cursorRef.current);
    setEvents((previous) => {
      const seen = new Set(previous.map((event) => event.id));
      const merged = [...incoming.filter((event) => !seen.has(event.id)), ...previous];
      return merged.sort((a, b) => b.id - a.id).slice(0, 200);
    });
  }, []);

  const stop = useCallback(() => {
    closedByUs.current = true;
    if (pingRef.current) window.clearInterval(pingRef.current);
    if (retryRef.current) window.clearTimeout(retryRef.current);
    pingRef.current = null;
    retryRef.current = null;
    socketRef.current?.close();
    socketRef.current = null;
  }, []);

  const connect = useCallback(async () => {
    if (!getAccessToken()) {
      setStatus("offline");
      return;
    }
    stop();
    closedByUs.current = false;
    setStatus("connecting");

    try {
      const ticket = await api.ticket();
      const socket = new WebSocket(wsUrlFor(ticket));
      socketRef.current = socket;

      socket.onopen = () => {
        attemptRef.current = 0;
        setStatus("live");
        // Announce where we left off; the server replies with a replay frame
        // only when events are actually missing.
        socket.send(JSON.stringify({ type: "hello", last_event_id: cursorRef.current }));
        pingRef.current = window.setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "ping" }));
        }, PING_INTERVAL_MS);
      };

      socket.onmessage = (message) => {
        let frame: Record<string, unknown>;
        try {
          frame = JSON.parse(String(message.data)) as Record<string, unknown>;
        } catch {
          return;
        }
        if (frame.type === "hello") {
          const latest = Number(frame.last_event_id ?? 0);
          if (!cursorRef.current) cursorRef.current = Math.max(0, latest - 1);
        } else if (frame.type === "event") {
          remember([frame.event as ApiEvent]);
        } else if (frame.type === "replay") {
          remember((frame.events as ApiEvent[]) ?? []);
        } else if (frame.type === "error") {
          console.warn("[ws]", frame.message);
        }
      };

      socket.onclose = () => {
        if (pingRef.current) window.clearInterval(pingRef.current);
        pingRef.current = null;
        if (closedByUs.current) return;
        attemptRef.current += 1;
        const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** (attemptRef.current - 1));
        setStatus("retrying");
        retryRef.current = window.setTimeout(() => {
          void connect();
        }, delay);
      };
    } catch {
      setStatus("retrying");
      attemptRef.current += 1;
      retryRef.current = window.setTimeout(
        () => void connect(),
        Math.min(MAX_BACKOFF_MS, 1000 * 2 ** (attemptRef.current - 1)),
      );
    }
  }, [remember, stop]);

  useEffect(() => {
    if (!enabled) {
      stop();
      setStatus("idle");
      return;
    }
    void connect();
    return stop;
  }, [enabled, connect, stop]);

  return { status, events, lastEventId, reconnect: () => void connect() };
}
