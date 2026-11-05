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
  it("renders the monitoring dashboard", () => {
    renderAt("/");

    expect(screen.getByText("监控总览")).toBeInTheDocument();
    expect(screen.getByText("系统骨架已就绪")).toBeInTheDocument();
  });

  it("marks every data source as not connected in I0", () => {
    renderAt("/");

    for (const name of ["Telegram", "Binance（TG 推断）", "OKX 实盘", "fomo 链上"]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    expect(screen.getAllByText("NOT CONNECTED")).toHaveLength(4);
  });

  it("renders the timeline empty state", () => {
    renderAt("/timeline");

    expect(screen.getByText("事件时间线")).toBeInTheDocument();
    expect(screen.getByText("时间线还没有数据")).toBeInTheDocument();
  });

  it("renders the positions table headers", () => {
    renderAt("/positions");

    expect(screen.getByText("持仓与仓位变化")).toBeInTheDocument();
    expect(screen.getByText("还没有持仓")).toBeInTheDocument();
  });

  it("falls back to the dashboard for unknown routes", () => {
    renderAt("/does-not-exist");

    expect(screen.getByText("监控总览")).toBeInTheDocument();
  });
});
