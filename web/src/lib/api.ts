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

export interface ApiCollectorStatus {
  state: "stopped" | "connecting" | "running" | "error";
  detail: string;
  started_at: string | null;
  last_message_at: string | null;
  messages_total: number;
  dialogs: number;
}

export interface ApiTelegramStatus {
  collector: ApiCollectorStatus;
  account: {
    id: number;
    label: string;
    phone: string;
    username: string;
    display_name: string;
    last_connected_at: string | null;
    last_error: string;
  } | null;
  dialogs: number;
  followed: number;
  messages: number;
}

export interface ApiTelegramDialog {
  id: number;
  chat_id: number;
  title: string;
  kind: string;
  username: string;
  enabled: boolean;
  last_message_id: number;
  last_synced_at: string | null;
  messages: number;
}

export interface ApiTelegramTopic {
  id: number;
  chat_id: number;
  topic_id: number;
  title: string;
  enabled: boolean;
  last_message_id: number;
  last_synced_at: string | null;
  messages: number;
  last_error: string;
}

export type TelegramFocus = "important" | "owner" | "all";

export interface ApiMessageRevision {
  text: string;
  media_kind: string;
  replaced_at: string;
}

export interface ApiTelegramMessage {
  id: number;
  chat_id: number;
  dialog_title: string;
  topic_id: number | null;
  topic_title: string;
  sender_id: number | null;
  sender_role: "owner" | "signal_bot" | "assistant" | "member";
  message_id: number;
  sender_name: string;
  text: string;
  media_kind: string;
  posted_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  revisions: ApiMessageRevision[];
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
  telegramStatus() {
    return request<ApiTelegramStatus>("/api/telegram/status");
  },
  telegramDialogs() {
    return request<ApiTelegramDialog[]>("/api/telegram/dialogs");
  },
  telegramTopics(chatId?: number) {
    const query = chatId === undefined ? "" : `?chat_id=${chatId}`;
    return request<ApiTelegramTopic[]>(`/api/telegram/topics${query}`);
  },
  telegramDiscover() {
    return request<
      { chat_id: number; title: string; kind: string; username: string; followed: boolean }[]
    >("/api/telegram/discover");
  },
  followDialog(chatId: number) {
    return request<{ ok: boolean; dialog_id: number; enabled: boolean }>(
      `/api/telegram/dialogs/${chatId}/follow`,
      { method: "POST" },
    );
  },
  unfollowDialog(chatId: number) {
    return request<{ ok: boolean; enabled: boolean }>(`/api/telegram/dialogs/${chatId}/follow`, {
      method: "DELETE",
    });
  },
  telegramMessages(
    params: {
      limit?: number;
      chatId?: number;
      beforeId?: number;
      kind?: "media" | "edited" | "deleted";
      since?: string;
      includeRevisions?: boolean;
      topicId?: number;
      focus?: TelegramFocus;
    } = {},
  ) {
    const query = new URLSearchParams();
    query.set("limit", String(params.limit ?? 50));
    if (params.chatId) query.set("chat_id", String(params.chatId));
    if (params.beforeId) query.set("before_id", String(params.beforeId));
    if (params.kind) query.set("kind", params.kind);
    if (params.since) query.set("since", params.since);
    if (params.includeRevisions) query.set("include_revisions", "true");
    if (params.topicId !== undefined) query.set("topic_id", String(params.topicId));
    if (params.focus) query.set("focus", params.focus);
    return request<{ messages: ApiTelegramMessage[]; count: number }>(
      `/api/telegram/messages?${query.toString()}`,
    );
  },
  startTelegram() {
    return request<{ ok: boolean; collector: ApiCollectorStatus }>("/api/telegram/start", {
      method: "POST",
    });
  },
  stopTelegram() {
    return request<{ ok: boolean; collector: ApiCollectorStatus }>("/api/telegram/stop", {
      method: "POST",
    });
  },
  syncTelegram() {
    return request<{ ok: boolean; dialogs: number; synced_at: string }>("/api/telegram/sync", {
      method: "POST",
    });
  },
};

export function wsUrlFor(ticket: ApiTicket): string {
  if (!BASE) return ticket.ws_url;
  const base = BASE.replace(/^http/, "ws");
  return `${base}/ws?ticket=${encodeURIComponent(ticket.ticket)}`;
}
