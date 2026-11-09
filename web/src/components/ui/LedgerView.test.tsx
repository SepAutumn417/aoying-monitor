import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { PositionTable } from "./LedgerView";

it("distinguishes reported floating PnL from cumulative realized PnL", () => {
  render(<PositionTable positions={[{
    id: 1, symbol: "BTCUSDT", side: "long", status: "open",
    opened_at: "2026-11-01T00:00:00Z", closed_at: null, entry: null, qty_open: 0,
    qty_current: 0, lev: null, margin: null, realized: 0, held_seconds: 0,
    events: [{ id: 1, kind: "open", at: "2026-11-01T00:00:00Z", qty_before: null, qty_after: 0,
      entry: null, mark: null, margin: null, lev: null, floating: 0, realized: 0 }],
  }]} />);
  fireEvent.click(screen.getByRole("button", { name: "展开 BTCUSDT 生命周期" }));
  expect(screen.getByRole("columnheader", { name: "报送浮盈（USDT）" })).toBeInTheDocument();
  expect(screen.queryByText("累计浮盈（USDT）")).not.toBeInTheDocument();
  expect(screen.getByText(/浮盈为当次快照/)).toBeInTheDocument();
});
