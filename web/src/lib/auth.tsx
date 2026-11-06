/**
 * Session state for the Web client.
 *
 * The provider owns one truth: are we logged in, as whom, and with which
 * device. Everything else (route guards, the live socket, the sidebar status)
 * reads from here, so a revoked session logs out everywhere at once.
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

import {
  ApiError,
  api,
  readRefreshToken,
  refreshSession,
  setAccessToken,
  writeRefreshToken,
  type ApiDevice,
  type ApiSession,
  type ApiUser,
} from "./api";

export type AuthStatus = "loading" | "anonymous" | "authenticated";

interface AuthState {
  status: AuthStatus;
  user: ApiUser | null;
  device: ApiDevice | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

function deviceDescriptor(): Partial<ApiDevice> {
  const ua = navigator.userAgent;
  return {
    name: ua.includes("Edg") ? "Edge 浏览器" : ua.includes("Chrome") ? "Chrome 浏览器" : "浏览器",
    platform: "web",
    fingerprint: "web-browser",
    app_version: "0.3.0",
    push_mode: "browser",
  };
}

export function AuthProvider({
  children,
  initialSession,
}: {
  children: ReactNode;
  /** Test hook: skip the refresh round-trip and start logged in. */
  initialSession?: ApiSession;
}) {
  const [status, setStatus] = useState<AuthStatus>(initialSession ? "authenticated" : "loading");
  const [user, setUser] = useState<ApiUser | null>(initialSession?.user ?? null);
  const [device, setDevice] = useState<ApiDevice | null>(initialSession?.device ?? null);
  const bootstrapped = useRef(false);

  const applySession = useCallback((session: ApiSession) => {
    setAccessToken(session.access_token);
    writeRefreshToken(session.refresh_token);
    setUser(session.user);
    setDevice(session.device);
    setStatus("authenticated");
  }, []);

  const clear = useCallback(() => {
    setAccessToken(null);
    writeRefreshToken(null);
    setUser(null);
    setDevice(null);
    setStatus("anonymous");
  }, []);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    if (initialSession) {
      setAccessToken(initialSession.access_token);
      return;
    }

    if (!readRefreshToken()) {
      setStatus("anonymous");
      return;
    }
    // A stored refresh token means an earlier tab was logged in; exchange it
    // for a fresh access token and drop the user straight into the app.
    refreshSession()
      .then((session) => {
        if (session) applySession(session);
        else setStatus("anonymous");
      })
      .catch(() => setStatus("anonymous"));
  }, [initialSession]);

  const login = useCallback(
    async (username: string, password: string) => {
      const session = await api.login(username, password, deviceDescriptor());
      applySession(session);
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    const refreshToken = readRefreshToken();
    if (refreshToken) {
      try {
        await api.logout(refreshToken);
      } catch (error) {
        if (!(error instanceof ApiError)) throw error;
      }
    }
    clear();
  }, [clear]);

  const value = useMemo<AuthState>(
    () => ({ status, user, device, login, logout }),
    [status, user, device, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth 必须在 AuthProvider 内使用");
  return value;
}
