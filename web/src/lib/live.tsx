/**
 * One live socket for the whole app.
 *
 * Mounted once under the authenticated area; the sidebar status indicator, the
 * alert feed and the settings page all read the same connection instead of each
 * opening their own.
 */

import { createContext, useContext, type ReactNode } from "react";

import { useAuth } from "./auth";
import { useLiveSocket, type LiveSocket } from "./socket";

const LiveContext = createContext<LiveSocket | null>(null);

export function LiveProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const socket = useLiveSocket(status === "authenticated");
  return <LiveContext.Provider value={socket}>{children}</LiveContext.Provider>;
}

export function useLive(): LiveSocket {
  const value = useContext(LiveContext);
  if (!value) throw new Error("useLive 必须在 LiveProvider 内使用");
  return value;
}
