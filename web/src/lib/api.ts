/**
 * Typed HTTP client for the monitor API.
 *
 * Access tokens live in memory only (30 min TTL); the refresh token sits in
 * localStorage because a browser tab reload must not force a re-login. Every
 * request funnels through `request()` so a 401 triggers exactly one refresh and
 * then one retry — never a refresh storm.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiUser {
  id: number;
  username: string;
  display_name: string;
}

export interface ApiDevice {
  id: number;
  name: string;
  platform: string;
  fingerprint: string;
  app_version: string;
  push_mode: string;
  created_at: string;
  last_seen_at: string;
  revoked_at: string | null;
}

export interface ApiSession {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  user: ApiUser;
  device: ApiDevice;
}

export interface ApiEvent {
  id: number;
  kind: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface ApiTicket {
  ticket: string;
  expires_in: number;
  ws_url: string;
}

const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";
const REFRESH_KEY = "aoying.refresh_token";

let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function readRefreshToken(): string | null {
  try {
    return window.localStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

export function writeRefreshToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(REFRESH_KEY, token);
    else window.localStorage.removeItem(REFRESH_KEY);
  } catch {
    // Private mode with storage disabled: the session simply won't survive reload.
  }
}

async function parse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const body = text ? (JSON.parse(text) as unknown) : null;
  if (!response.ok) {
    const detail =
      body && typeof body === "object" && "detail" in body
        ? String((body as { detail: unknown }).detail)
        : `请求失败（${response.status}）`;
    throw new ApiError(response.status, detail);
  }
  return body as T;
}

export async function refreshSession(): Promise<ApiSession | null> {
  const refreshToken = readRefreshToken();
  if (!refreshToken) return null;
  try {
    const response = await fetch(`${BASE}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!response.ok) {
      writeRefreshToken(null);
      return null;
    }
    const session = (await response.json()) as ApiSession;
    accessToken = session.access_token;
    writeRefreshToken(session.refresh_token);
    return session;
  } catch {
    return null;
  }
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = readRefreshToken();
  if (!refreshToken) return null;
  try {
    const response = await fetch(`${BASE}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!response.ok) {
      writeRefreshToken(null);
      return null;
    }
    const session = (await response.json()) as ApiSession;
    accessToken = session.access_token;
    writeRefreshToken(session.refresh_token);
    return session.access_token;
  } catch {
    return null;
  }
}

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, "无法连接服务器");
  }

  if (response.status === 401 && retry) {
    refreshPromise ??= refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
    const token = await refreshPromise;
    if (token) return request<T>(path, init, false);
  }
  return parse<T>(response);
}

export const api = {
  login(username: string, password: string, device: Partial<ApiDevice>) {
    return request<ApiSession>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password, device }),
    });
  },
  me() {
    return request<{ user: ApiUser }>("/api/auth/me");
  },
  logout(refreshToken: string) {
    return request<{ ok: boolean }>("/api/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  },
  devices() {
    return request<ApiDevice[]>("/api/devices");
  },
  revokeDevice(id: number) {
    return request<{ ok: boolean }>(`/api/devices/${id}`, { method: "DELETE" });
  },
  events(after = 0, limit = 50) {
    return request<{ events: ApiEvent[]; count: number; latest_id: number }>(
      `/api/events?after=${after}&limit=${limit}`,
    );
  },
  ticket() {
    return request<ApiTicket>("/api/ws/ticket", { method: "POST" });
  },
  publishTestEvent() {
    return request<{ ok: boolean; event: ApiEvent }>("/api/events/test", { method: "POST" });
  },
};

export function wsUrlFor(ticket: ApiTicket): string {
  if (!BASE) return ticket.ws_url;
  const base = BASE.replace(/^http/, "ws");
  return `${base}/ws?ticket=${encodeURIComponent(ticket.ticket)}`;
}
