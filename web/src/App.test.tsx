import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import { AuthProvider } from "./lib/auth";
import type { ApiSession } from "./lib/api";

const session: ApiSession = {
  access_token: "access-token",
  token_type: "bearer",
  expires_in: 1800,
  refresh_token: "refresh-token",
  user: { id: 1, username: "admin", display_name: "管理员" },
  device: {
    id: 7,
    name: "测试浏览器",
    platform: "web",
    fingerprint: "web-browser",
    app_version: "0.4.0",
    push_mode: "browser",
    created_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
    revoked_at: null,
  },
};

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

function renderAt(path: string, loggedIn = true) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider initialSession={loggedIn ? session : undefined}>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/copy/status")) return json({ positions_open: 0, positions_closed: 0, realized_closed: 0, signals: 0, events: 0, last_signal_at: null });
      if (url.startsWith("/api/positions")) return json({ positions: [], count: 0 });
      if (url.startsWith("/api/signals")) return json({ signals: [], count: 0 });
      if (url.startsWith("/api/devices")) {
        return json([
          {
            id: 7,
            name: "测试浏览器",
            platform: "web",
            fingerprint: "web-browser",
            app_version: "0.4.0",
            push_mode: "browser",
            created_at: new Date().toISOString(),
            last_seen_at: new Date(Date.now() - 120_000).toISOString(),
            revoked_at: null,
          },
        ]);
      }
      if (url.startsWith("/api/ws/ticket")) {
        return json({ ticket: "t", expires_in: 60, ws_url: "ws://x" });
      }
      if (url.startsWith("/api/events")) {
        return json({ events: [], count: 0, latest_id: 0 });
      }
      if (url.startsWith("/api/telegram/messages")) {
        return json({
          messages: [
            {
              id: 1,
              chat_id: -1002568478710,
              dialog_title: "熬鹰书友会",
              topic_id: 926111,
              topic_title: "熬鹰交易信号推送",
              sender_id: 8797733775,
              sender_role: "signal_bot",
              message_id: 10,
              sender_name: "熬鹰 资本",
              text: "开多 BTC 2x",
              media_kind: "",
              posted_at: new Date().toISOString(),
              edited_at: null,
              deleted_at: null,
              revisions: [],
            },
          ],
          count: 1,
        });
      }
      if (url.startsWith("/api/telegram/topics")) {
        return json([
          { id: 1, chat_id: -1002568478710, topic_id: 926111, title: "熬鹰交易信号推送", enabled: true, last_message_id: 10, last_synced_at: new Date().toISOString(), messages: 20, last_error: "" },
          { id: 2, chat_id: -1002568478710, topic_id: 748, title: "禁言群", enabled: true, last_message_id: 9, last_synced_at: null, messages: 0, last_error: "" },
          { id: 3, chat_id: -1002568478710, topic_id: 1, title: "聊天群", enabled: true, last_message_id: 8, last_synced_at: null, messages: 0, last_error: "" },
          { id: 4, chat_id: -1002568478710, topic_id: 1006930, title: "消息通知", enabled: true, last_message_id: 7, last_synced_at: null, messages: 0, last_error: "" },
        ]);
      }
      if (url.startsWith("/api/telegram/status")) {
        return json({ collector: { state: "running", detail: "", started_at: null, last_message_at: null, messages_total: 20, dialogs: 1 }, account: { id: 1, label: "测试账号", display_name: "测试账号", username: "", phone: "", last_connected_at: null, last_error: "" }, dialogs: 1, followed: 1, messages: 20 });
      }
      if (url.startsWith("/api/telegram/dialogs")) {
        return json([]);
      }
      if (url.startsWith("/api/auth/login")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as { password?: string };
        if (body.password === "good") return json(session);
        return json({ detail: "用户名或密码不正确" }, 401);
      }
      return json({ detail: "not found" }, 404);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Telegram-only runtime", () => {
  it.each(["/", "/workspace", "/positions", "/timeline"])("never requests inferred ledger data at %s", async (path) => {
    await act(async () => { renderAt(path); });
    await screen.findByText("开多 BTC 2x");
    const urls = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
    expect(urls.some((url) => /^\/api\/(copy\/status|positions|signals)(?:[?]|$)/.test(url))).toBe(false);
    expect(screen.queryByText("当前仓位")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "持仓" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Telegram 信号账本/)).not.toBeInTheDocument();
  });

  it("removes the historical ledger prototype entry", async () => {
    await act(async () => { renderAt("/"); });
    expect(screen.queryByRole("link", { name: "总览原型" })).not.toBeInTheDocument();
  });

  it("keeps the workspace original-message filters and snapshots", async () => {
    renderAt("/workspace");
    await screen.findByText("开多 BTC 2x");
    expect(screen.getByRole("button", { name: "本人发言" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "已删除" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "已编辑" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "禁言群" })).toBeInTheDocument();
  });
});

describe("Source monitor layout", () => {
  beforeEach(() => { localStorage.removeItem("aoying-theme"); });
  afterEach(() => { localStorage.removeItem("aoying-theme"); });

  it("defaults to light, persists a toggle and has one top navigation", async () => {
    await act(async () => { renderAt("/"); });
    expect(document.documentElement.dataset.theme).toBe("light");
    const nav = screen.getByRole("navigation", { name: "主导航" });
    expect(nav.closest("header")).not.toBeNull();
    expect(screen.getAllByRole("navigation")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "工作台" })).toHaveAttribute("href", "/workspace");
    expect(screen.queryByRole("link", { name: "发言" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "切换到深色主题" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("aoying-theme")).toBe("dark");
  });

  it("honours a persisted dark preference", async () => {
    localStorage.setItem("aoying-theme", "dark");
    await act(async () => { renderAt("/"); });
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("puts actual source sync data before important originals", async () => {
    await act(async () => { renderAt("/"); });
    const source = screen.getByRole("complementary", { name: "来源与同步" });
    const originals = screen.getByRole("region", { name: "重要消息" });
    expect(source.compareDocumentPosition(originals) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(await within(source).findByText("熬鹰交易信号推送")).toBeInTheDocument();
    expect(screen.getByText("采集中")).toBeInTheDocument();
    expect(screen.getAllByText("尚未完成同步")).toHaveLength(3);
    expect(source).toHaveTextContent("20 条");
  });

  it.each(["/workspace", "/timeline"])("keeps topics in the left source pane at %s", async (path) => {
    await act(async () => { renderAt(path); });
    const source = screen.getByRole("complementary", { name: "会话与分区" });
    expect(source).toContainElement(await screen.findByRole("button", { name: "禁言群" }));
    expect(screen.getByRole("region", { name: "原文列表" })).toHaveTextContent("开多 BTC 2x");
    fireEvent.change(screen.getByRole("textbox", { name: "搜索发言" }), { target: { value: "not found" } });
    expect(screen.getByText(/当前筛选下没有消息/)).toBeInTheDocument();
  });
});

describe("App shell", () => {
  it("renders the dashboard with Telegram originals", async () => {
    await act(async () => { renderAt("/"); });

    expect(screen.getByText("监控总览")).toBeInTheDocument();
    expect(screen.queryByText("当前仓位")).not.toBeInTheDocument();
    expect(screen.getByText("重要消息")).toBeInTheDocument();
    expect(screen.getByText("会话")).toBeInTheDocument();
  });

  it("labels the original source without demo fallback", async () => {
    await act(async () => { renderAt("/"); });
    expect(screen.getByText(/Telegram 原文与编辑快照/)).toBeInTheDocument();
    expect(screen.queryByText("示例数据")).not.toBeInTheDocument();
  });

  it("redirects the retired positions route to original messages", async () => {
    renderAt("/positions");
    expect(await screen.findByRole("heading", { name: "发言" })).toBeInTheDocument();
    expect(await screen.findByText("开多 BTC 2x")).toBeInTheDocument();
    expect(screen.queryByText("BTCUSDT")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "全部" })).toBeInTheDocument();
  });

  it("renders statements on the timeline", async () => {
    renderAt("/timeline");

    expect(screen.getByRole("heading", { name: "发言" })).toBeInTheDocument();
    expect(await screen.findByText("开多 BTC 2x")).toBeInTheDocument();
    expect(screen.getByText("含媒体")).toBeInTheDocument();
    expect(screen.getByText("近 7 天")).toBeInTheDocument();
  });

  it("defaults to important messages and combines focus with topic filters", async () => {
    renderAt("/timeline");
    await screen.findByText("开多 BTC 2x");
    expect(screen.getByText("交易机器人报告")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("focus=important"), expect.anything());
    fireEvent.click(await screen.findByRole("button", { name: "禁言群" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/topic_id=748.*focus=important/), expect.anything()));
    fireEvent.click(screen.getByRole("button", { name: "本人发言" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/topic_id=748.*focus=owner/), expect.anything()));
    fireEvent.click(screen.getByRole("button", { name: "全部原文" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/topic_id=748.*focus=all/), expect.anything()));
  });

  it("shows all four topic sync states in sources", async () => {
    renderAt("/sources");
    expect(await screen.findByText("四个分区 · 仅监控熬鹰书友会")).toBeInTheDocument();
    expect(screen.getByText("熬鹰交易信号推送")).toBeInTheDocument();
    expect(screen.getByText("禁言群")).toBeInTheDocument();
    expect(screen.getByText("聊天群")).toBeInTheDocument();
    expect(screen.getByText("消息通知")).toBeInTheDocument();
    expect(screen.getAllByText(/尚未完成同步/).length).toBe(3);
  });

  it("renders the signal centre and its sound legend", async () => {
    await act(async () => { renderAt("/alerts"); });

    expect(screen.getByRole("heading", { name: "信号提醒" })).toBeInTheDocument();
    // No socket traffic in jsdom, so the centre must explain itself rather than
    // show placeholder trades.
    expect(screen.getByText(/还没有收到信号/)).toBeInTheDocument();
    expect(screen.getByText("声音对照")).toBeInTheDocument();
    for (const label of ["新开仓", "加仓", "减仓", "平仓", "调杠杆"]) {
      expect(screen.getByRole("button", { name: `试听${label}` })).toBeInTheDocument();
    }
  });

  it("falls back to the dashboard for unknown routes", async () => {
    await act(async () => { renderAt("/does-not-exist"); });

    expect(screen.getByText("监控总览")).toBeInTheDocument();
  });
});

describe("Session gate", () => {
  it("redirects anonymous visitors to the login form", () => {
    renderAt("/positions", false);

    expect(screen.getByRole("heading", { name: "登录" })).toBeInTheDocument();
    expect(screen.queryByText("监控总览")).not.toBeInTheDocument();
  });

  it("shows the reason when credentials are rejected", async () => {
    renderAt("/", false);

    fireEvent.change(screen.getByLabelText("用户名"), { target: { value: "admin" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "bad" } });
    fireEvent.click(screen.getByRole("button", { name: "进入监控台" }));

    expect(await screen.findByText("用户名或密码不正确")).toBeInTheDocument();
  });

  it("logs in and lands on the requested page", async () => {
    renderAt("/positions", false);

    fireEvent.change(screen.getByLabelText("用户名"), { target: { value: "admin" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "good" } });
    fireEvent.click(screen.getByRole("button", { name: "进入监控台" }));

    expect(await screen.findByRole("heading", { name: "发言" })).toBeInTheDocument();
  });
});

describe("Settings devices", () => {
  it("lists signed-in devices from the API", async () => {
    renderAt("/settings");

    expect(await screen.findByText("测试浏览器")).toBeInTheDocument();
    expect(screen.getByText("已登录设备")).toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/devices", expect.anything()));
  });
});
