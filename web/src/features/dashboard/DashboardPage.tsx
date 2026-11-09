import { Link } from "react-router-dom";
import {
  LedgerNotice,
  LedgerRefresh,
  ledgerNumber,
  ledgerTime,
  PositionTable,
} from "../../components/ui/LedgerView";
import { PageHeader } from "../../components/ui/PageHeader";
import { useLedger } from "../../lib/ledger";

export function DashboardPage() {
  const { snapshot } = useLedger();
  const status = snapshot?.status;
  const cards = [
    { label: "未平仓数", value: ledgerNumber(status?.positions_open), note: "账本全局统计" },
    { label: "已平仓数", value: ledgerNumber(status?.positions_closed), note: "账本全局统计" },
    {
      label: "已平仓累计已实现（USDT）",
      value: ledgerNumber(status?.realized_closed),
      note: "服务端累计值 · 非今日收益",
    },
    {
      label: "最后信号时间",
      value: ledgerTime(status?.last_signal_at),
      note: "最近报送 · 非实时行情时间",
    },
  ];
  const open = snapshot?.positions.filter((p) => p.status === "open").slice(0, 8) ?? [];
  const closed = snapshot?.positions
    .filter((p) => p.status === "closed")
    .sort((a, b) => (b.closed_at ?? "").localeCompare(a.closed_at ?? ""))
    .slice(0, 8) ?? [];

  return (
    <div>
      <PageHeader title="监控总览" meta="交易员报送记录 · 只读监控" action={<LedgerRefresh />} />
      <LedgerNotice />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="panel rounded-xl px-4 py-3.5">
            <p className="text-xs text-mist-400">{card.label}</p>
            <p className="mt-1.5 break-words font-mono text-xl text-white">{card.value}</p>
            <p className="mt-1 text-[11px] text-mist-400">{card.note}</p>
          </div>
        ))}
      </section>

      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[1.55fr_1fr]">
        <section className="panel min-w-0 overflow-hidden rounded-xl">
          <div className="flex items-center justify-between border-b border-mist-400/10 px-4 py-3">
            <h2 className="text-sm font-semibold text-white">当前持仓</h2>
            <Link to="/positions" className="text-xs text-mist-400">查看仓位 →</Link>
          </div>
          {snapshot ? <PositionTable positions={open} emptyText="本次快照内暂无未平仓记录" /> : null}
        </section>
        <section className="panel min-w-0 overflow-hidden rounded-xl">
          <div className="border-b border-mist-400/10 px-4 py-3">
            <h2 className="text-sm font-semibold text-white">最近信号</h2>
            <p className="mt-1 text-[11px] text-mist-400">最近 20 条以内 · 报送累计盈亏不相加</p>
          </div>
          {snapshot ? (
            snapshot.signals.length ? (
              <ul className="divide-y divide-mist-400/10">
                {snapshot.signals.map((signal) => (
                  <li key={signal.id} className="px-4 py-3 text-xs text-mist-200">
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="font-medium text-white">
                        {signal.symbol} · {signal.side} · {signal.action || signal.kind}
                      </span>
                      <span className="text-mist-400">
                        {ledgerTime(signal.reported_at ?? signal.posted_at)}
                      </span>
                    </div>
                    <p className="mt-2">
                      数量 {ledgerNumber(signal.qty_after ?? signal.qty)} · 报送开仓价 {ledgerNumber(signal.entry)}
                    </p>
                    <p className="mt-1 text-mist-400">
                      累计已实现 {ledgerNumber(signal.realized)} USDT · 报送浮盈 {ledgerNumber(signal.floating)} USDT
                    </p>
                  </li>
                ))}
              </ul>
            ) : <p className="px-4 py-8 text-sm text-mist-400">暂无信号记录</p>
          ) : null}
        </section>
      </div>

      <section className="panel mt-4 overflow-hidden rounded-xl">
        <div className="border-b border-mist-400/10 px-4 py-3">
          <h2 className="text-sm font-semibold text-white">最近已平仓</h2>
          <p className="mt-1 text-[11px] text-mist-400">最近 100 条仓位快照内，最多展示 8 条</p>
        </div>
        {snapshot ? <PositionTable positions={closed} emptyText="本次快照内暂无已平仓记录" /> : null}
      </section>
    </div>
  );
}
