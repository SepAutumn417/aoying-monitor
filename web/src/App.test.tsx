import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import App from "./App";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

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
