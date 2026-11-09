import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
import type { ApiEvent, ApiPosition, ApiPositionEvent } from "./api";
import type { SocketStatus } from "./socket";
import { LedgerProvider, useLedger } from "./ledger";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { PositionsPage } from "../features/positions/PositionsPage";

const context = vi.hoisted(() => ({ userId: 1, events: [] as ApiEvent[], status: "live" as SocketStatus }));
vi.mock("./auth", () => ({ useAuth: () => ({ status: "authenticated", user: { id: context.userId }, device: { id: 7 } }) }));
vi.mock("./live", () => ({ useLive: () => ({ events: context.events, status: context.status }) }));
const summary = { positions_open: 12, positions_closed: 34, realized_closed: 123.45, signals: 50, events: 70, last_signal_at: "2026-11-09T01:00:00Z" };
const eventFields: Omit<ApiPositionEvent, "id" | "kind" | "at" | "realized"> = { qty_before: null, qty_after: 0, entry: null, mark: 0, margin: null, lev: null, floating: null };
const position: ApiPosition = { id: 1, symbol: "REALUSDT", side: "long", status: "open", opened_at: "2026-11-08T01:00:00Z", closed_at: null, entry: null, qty_open: 2, qty_current: 0, lev: null, margin: 0, realized: 15, held_seconds: 12, events: [{ ...eventFields, id: 1, kind: "open", at: "2026-11-08T01:00:00Z", realized: 10 }, { ...eventFields, id: 2, kind: "reduce", at: "2026-11-09T01:00:00Z", realized: 15 }] };
function Probe() { const ledger = useLedger(); return <><output>{ledger.snapshot?.status.realized_closed ?? "none"}</output><button onClick={ledger.refresh}>refresh</button>{ledger.error}</>; }
function tree(child = <Probe />) { return <MemoryRouter><LedgerProvider>{child}</LedgerProvider></MemoryRouter>; }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; }
function event(id: number, kind = "signal.open", payload = {}): ApiEvent { return { id, kind, payload, created_at: "2026-11-09T01:00:00Z" }; }

beforeEach(() => {
  context.userId = 1; context.events = []; context.status = "live";
  vi.restoreAllMocks();
  vi.spyOn(api, "copyStatus").mockResolvedValue(summary);
  vi.spyOn(api, "positions").mockResolvedValue({ positions: [position], count: 1 });
  vi.spyOn(api, "signals").mockResolvedValue({ signals: [], count: 0 });
});

describe("shared ledger", () => {
  it("loads in parallel and renders server totals rather than row or event sums", async () => {
    render(tree(<DashboardPage />));
    expect(screen.getByText("正在加载账本…")).toBeInTheDocument();
    expect(await screen.findByText("123.45")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("34")).toBeInTheDocument();
    expect(screen.getByText("REALUSDT")).toBeInTheDocument();
    expect(screen.queryByText("示例数据")).not.toBeInTheDocument();
    expect(api.positions).toHaveBeenCalledWith({ limit: 100, includeEvents: true });
  });
  it("shows initial error with retry and accepts an empty snapshot", async () => {
    vi.mocked(api.copyStatus).mockRejectedValueOnce(new Error("network failed"));
    vi.mocked(api.positions).mockResolvedValue({ positions: [], count: 0 });
    render(tree(<PositionsPage />));
    expect(await screen.findByText(/network failed/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(await screen.findByText("暂无仓位记录")).toBeInTheDocument();
    expect(screen.queryByText("BTCUSDT")).not.toBeInTheDocument();
  });
  it("preserves null versus zero and expands cumulative event values without summing", async () => {
    render(tree(<PositionsPage />));
    await screen.findByText("REALUSDT");
    const row = screen.getByTestId("position-1");
    expect(row).toHaveTextContent("—");
    expect(row).toHaveTextContent("0");
    fireEvent.click(screen.getByRole("button", { name: "展开 REALUSDT 生命周期" }));
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getAllByText("15").length).toBe(2);
    expect(screen.queryByText("25")).not.toBeInTheDocument();
  });
  it("invalidates once per new real signal/edit/delete and on live recovery", async () => {
    const view = render(tree()); await screen.findByText("123.45");
    context.events = [event(1)]; view.rerender(tree());
    await waitFor(() => expect(api.copyStatus).toHaveBeenCalledTimes(2));
    context.events = [event(1)]; view.rerender(tree());
    context.events = [event(2, "signal.open", { test: true }), event(1)]; view.rerender(tree());
    expect(api.copyStatus).toHaveBeenCalledTimes(2);
    context.events = [event(3, "telegram.message.edited"), ...context.events]; view.rerender(tree());
    await waitFor(() => expect(api.copyStatus).toHaveBeenCalledTimes(3));
    context.events = [event(4, "telegram.message.deleted"), ...context.events]; view.rerender(tree());
    await waitFor(() => expect(api.copyStatus).toHaveBeenCalledTimes(4));
    context.status = "retrying"; view.rerender(tree());
    context.status = "live"; view.rerender(tree());
    await waitFor(() => expect(api.copyStatus).toHaveBeenCalledTimes(5));
  });
  it("rejects old responses after a newer refresh and after account changes", async () => {
    const old = deferred<typeof summary>();
    vi.mocked(api.copyStatus).mockReturnValueOnce(old.promise);
    const view = render(tree());
    fireEvent.click(screen.getByText("refresh"));
    await screen.findByText("123.45");
    await act(async () => old.resolve({ ...summary, realized_closed: 999 }));
    expect(screen.queryByText("999")).not.toBeInTheDocument();
    const pending = deferred<typeof summary>(); vi.mocked(api.copyStatus).mockReturnValueOnce(pending.promise);
    fireEvent.click(screen.getByText("refresh"));
    context.userId = 2;
    const next = deferred<typeof summary>(); vi.mocked(api.copyStatus).mockReturnValueOnce(next.promise);
    view.rerender(tree());
    expect(screen.getByText("none")).toBeInTheDocument();
    await act(async () => pending.resolve({ ...summary, realized_closed: 888 }));
    expect(screen.queryByText("888")).not.toBeInTheDocument();
    view.unmount();
    await act(async () => next.resolve(summary));
  });
  it("keeps the previous snapshot visibly stale on refresh error", async () => {
    render(tree(<DashboardPage />)); await screen.findByText("123.45");
    vi.mocked(api.copyStatus).mockRejectedValueOnce(new Error("offline"));
    fireEvent.click(screen.getByRole("button", { name: "刷新账本" }));
    expect(await screen.findByText(/数据已过期/)).toBeInTheDocument();
    expect(screen.getByText("123.45")).toBeInTheDocument();
  });
});
