import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AlertsPage } from "./AlertsPage";
import { SignalToast } from "./SignalToast";
import { toSignalAlert } from "../../lib/signals";

const context = vi.hoisted(() => ({ markRead: vi.fn(), toggleMuted: vi.fn(), preview: vi.fn() }));
const alert = toSignalAlert({
  id: 42, kind: "signal.leverage", created_at: "2026-11-16T01:00:00Z",
  payload: { signal_id: null, position_id: null, position_state: null, headline: "TG 调杠杆消息", summary: "原文：调到 3x", leverage: 3, realized: 1234, floating: 5678 },
})!;
vi.mock("../../lib/alerts", () => ({ useAlerts: () => ({ alerts: [alert], muted: false, unread: 1, soundBlocked: false, ...context }) }));
beforeEach(() => vi.clearAllMocks());

describe("source-message notifications", () => {
  it("retains message actions and read/sound controls with null ledger ids", () => {
    render(<AlertsPage />);
    expect(screen.getByText("TG 调杠杆消息")).toBeInTheDocument();
    expect(screen.getByText("原文：调到 3x")).toBeInTheDocument();
    expect(context.markRead).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "声音开" }));
    expect(context.toggleMuted).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "试听调杠杆" }));
    expect(context.preview).toHaveBeenCalledWith("leverage");
  });
  it("does not present historical inferred PnL or position-state claims", () => {
    render(<AlertsPage />);
    expect(screen.queryAllByText(/已实现|浮盈亏|仓位没变/)).toHaveLength(0);
    expect(screen.queryAllByText(/1,234|5,678/)).toHaveLength(0);
  });
  it("still shows toast notifications identified by event id", () => {
    render(<MemoryRouter><SignalToast latest={alert} muted={false} /></MemoryRouter>);
    expect(screen.getByText("TG 调杠杆消息")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "查看全部信号" })).toHaveAttribute("href", "/alerts");
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(screen.queryByText("TG 调杠杆消息")).not.toBeInTheDocument();
  });
});
