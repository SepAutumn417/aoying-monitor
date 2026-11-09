import { Fragment, useState } from "react";
import type { ApiPosition } from "../../lib/api";
import { useLedger } from "../../lib/ledger";

export function ledgerNumber(value: number | null | undefined): string {
  return value == null ? "—" : value.toLocaleString("en-US", { maximumFractionDigits: 8 });
}
export function ledgerTime(value: string | null | undefined): string {
  return value == null ? "—" : new Date(value).toLocaleString("zh-CN", { hour12: false });
}
export function LedgerNotice() {
  const { snapshot, loading, error, stale, refresh } = useLedger();
  return <div className="my-3 space-y-2 text-xs text-mist-400" aria-live="polite">
    <p>Telegram 信号账本 · 最后信号时间 {ledgerTime(snapshot?.status.last_signal_at)}</p>
    <p>仅为交易员报送记录，不代表我方余额或交易所实时行情。仓位列表为最近 100 条以内，不是完整历史。</p>
    {loading ? <p role="status">{snapshot ? "正在刷新账本…" : "正在加载账本…"}</p> : null}
    {stale ? <p className="text-amber-signal">数据已过期 / 待同步 · 上次快照 {ledgerTime(snapshot?.fetchedAt)}</p> : null}
    {error ? <div role="alert" className="flex flex-wrap items-center gap-3 text-amber-signal"><p>账本加载失败：{error}</p><button type="button" className="rounded-lg border border-mist-400/25 px-3 py-2 text-mist-200" onClick={refresh}>重试</button></div> : null}
  </div>;
}
export function LedgerRefresh() {
  const { refresh, loading } = useLedger();
  return <button type="button" onClick={refresh} disabled={loading} className="rounded-lg border border-signal-400/25 bg-signal-400/10 px-3 py-2 text-xs text-signal-300 disabled:opacity-50">刷新账本</button>;
}
export function PositionTable({ positions, emptyText = "暂无仓位记录" }: { positions: ApiPosition[]; emptyText?: string }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  if (!positions.length) return <p className="px-4 py-8 text-sm text-mist-400">{emptyText}</p>;
  return <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs">
    <thead><tr className="border-b border-mist-400/10 text-mist-400">
      {["币种 / 方向", "状态", "开仓价（报送）", "当前数量", "杠杆", "累计已实现（USDT）", "开仓 / 平仓时间", "生命周期"].map((label) => <th key={label} scope="col" className="px-4 py-3 font-normal">{label}</th>)}
    </tr></thead>
    <tbody>{positions.map((position) => <Fragment key={position.id}>
      <tr data-testid={`position-${position.id}`} className="border-b border-mist-400/10 text-mist-200">
        <td className="px-4 py-3"><span className="font-medium text-white">{position.symbol}</span><br />{position.side === "long" ? "多" : position.side === "short" ? "空" : position.side}</td>
        <td className="px-4 py-3">{position.status === "open" ? "未平仓" : position.status === "closed" ? "已平仓" : position.status}</td>
        <td className="px-4 py-3 font-mono">{ledgerNumber(position.entry)}</td>
        <td className="px-4 py-3 font-mono">{ledgerNumber(position.qty_current)}</td>
        <td className="px-4 py-3 font-mono">{position.lev == null ? "—" : `${ledgerNumber(position.lev)}x`}</td>
        <td className="px-4 py-3 font-mono">{ledgerNumber(position.realized)}</td>
        <td className="px-4 py-3 text-[11px]">{ledgerTime(position.opened_at)}<br />{ledgerTime(position.closed_at)}</td>
        <td className="px-4 py-3"><button type="button" aria-expanded={expanded === position.id} aria-label={`${expanded === position.id ? "收起" : "展开"} ${position.symbol} 生命周期`} className="rounded border border-mist-400/20 px-2 py-2" onClick={() => setExpanded(expanded === position.id ? null : position.id)}>{expanded === position.id ? "收起" : "展开"} ({position.events.length})</button></td>
      </tr>
      {expanded === position.id ? <tr><td colSpan={8} className="px-4 py-3">
        <p className="mb-2 text-xs text-mist-400">生命周期 · 已实现为仓位累计值，浮盈为当次快照，均不跨事件相加；价格不是实时行情。</p>
        {position.events.length ? <table className="w-full text-xs text-mist-200"><thead><tr>{["事件 / 时间", "数量（前 → 后）", "报送开仓 / 标记价", "报送浮盈（USDT）", "累计已实现（USDT）"].map((label) => <th scope="col" key={label} className="py-2 text-left font-normal text-mist-400">{label}</th>)}</tr></thead><tbody>{position.events.map((event) => <tr key={event.id} className="border-t border-mist-400/10"><td className="py-2">{event.kind}<br />{ledgerTime(event.at)}</td><td>{ledgerNumber(event.qty_before)} → {ledgerNumber(event.qty_after)}</td><td>{ledgerNumber(event.entry)} / {ledgerNumber(event.mark)}</td><td>{ledgerNumber(event.floating)}</td><td>{ledgerNumber(event.realized)}</td></tr>)}</tbody></table> : <p className="text-mist-400">暂无生命周期事件</p>}
      </td></tr> : null}
    </Fragment>)}</tbody>
  </table></div>;
}
