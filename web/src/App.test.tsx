import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    app_version: "0.2.0",
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
      if (url.startsWith("/api/devices")) {
        return json([
          {
            id: 7,
            name: "测试浏览器",
            platform: "web",
            fingerprint: "web-browser",
            app_version: "0.2.0",
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

describe("App shell", () => {
  it("renders the dashboard with positions and changes", () => {
    renderAt("/");

    expect(screen.getByText("监控总览")).toBeInTheDocument();
    expect(screen.getByText("当前持仓")).toBeInTheDocument();
    expect(screen.getByText("仓位变化")).toBeInTheDocument();
    expect(screen.getByText("最新发言")).toBeInTheDocument();
  });

  it("labels demo data visibly", () => {
    renderAt("/");
    expect(screen.getAllByText("示例数据").length).toBeGreaterThan(0);
  });

  it("renders positions with a venue filter", () => {
    renderAt("/positions");

    expect(screen.getByRole("heading", { name: "持仓" })).toBeInTheDocument();
    expect(screen.getAllByText("BTCUSDT").length).toBeGreaterThan(0);
    expect(screen.getByText("全部场所")).toBeInTheDocument();
  });

  it("renders statements on the timeline", () => {
    renderAt("/timeline");

    expect(screen.getByText("发言与事件")).toBeInTheDocument();
    expect(screen.getByText(/ETH 这里 3510/)).toBeInTheDocument();
  });

  it("renders alerts", () => {
    renderAt("/alerts");

    expect(screen.getByRole("heading", { name: "提醒" })).toBeInTheDocument();
    expect(screen.getByText("OKX ETHUSDT 加仓")).toBeInTheDocument();
  });

  it("falls back to the dashboard for unknown routes", () => {
    renderAt("/does-not-exist");

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

    expect(await screen.findByRole("heading", { name: "持仓" })).toBeInTheDocument();
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
