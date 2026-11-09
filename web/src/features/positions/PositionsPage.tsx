import { useState } from "react";
import {
  LedgerNotice,
  LedgerRefresh,
  ledgerNumber,
  PositionTable,
} from "../../components/ui/LedgerView";
import { PageHeader } from "../../components/ui/PageHeader";
import { useLedger } from "../../lib/ledger";

const filters = [
  { value: "all", label: "全部" },
  { value: "open", label: "未平仓" },
  { value: "closed", label: "已平仓" },
] as const;

export function PositionsPage() {
  const { snapshot } = useLedger();
  const [status, setStatus] = useState<string>("all");
  const [symbol, setSymbol] = useState("");
  const positions = snapshot?.positions ?? [];
  const rows = positions.filter((p) =>
    (status === "all" || p.status === status) &&
    p.symbol.toUpperCase().includes(symbol.trim().toUpperCase()),
  );

  return (
    <div>
      <PageHeader
        title="持仓"
        meta={`全局未平仓 ${ledgerNumber(snapshot?.status.positions_open)} · 已平仓 ${ledgerNumber(snapshot?.status.positions_closed)} · 已平仓累计已实现 ${ledgerNumber(snapshot?.status.realized_closed)} USDT`}
        action={<LedgerRefresh />}
      />
      <LedgerNotice />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1.5" role="group" aria-label="仓位状态">
          {filters.map((filter) => (
            <button
              key={filter.value}
              type="button"
              aria-pressed={status === filter.value}
              onClick={() => setStatus(filter.value)}
              className={`rounded-lg border px-3 py-2 text-xs ${status === filter.value
                ? "border-signal-400/30 bg-signal-400/10 text-signal-300"
                : "border-mist-400/15 text-mist-200"}`}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-mist-400">
          币种筛选
          <input
            value={symbol}
            onChange={(event) => setSymbol(event.target.value)}
            placeholder="输入币种"
            className="w-40 rounded-lg border border-mist-400/20 bg-transparent px-3 py-2 text-mist-200"
          />
        </label>
        <span className="text-xs text-mist-400">仅筛选本次最近 100 条以内 · {rows.length} 条</span>
      </div>
      <section className="panel overflow-hidden rounded-xl">
        {snapshot ? (
          <PositionTable
            positions={rows}
            emptyText={positions.length ? "当前筛选无匹配仓位" : "暂无仓位记录"}
          />
        ) : null}
      </section>
    </div>
  );
}
