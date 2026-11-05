import { useMemo, useState } from "react";

import { PageHeader } from "../../components/ui/PageHeader";
import { demoChanges, demoPositions, demoKpis } from "../../lib/demo";
import { compactUsd, pnlTone, price, signedPct } from "../../lib/format";

const venueOptions = ["全部场所", "币安", "OKX", "fomo"] as const;

export function PositionsPage() {
  const [venue, setVenue] = useState<(typeof venueOptions)[number]>("全部场所");

  const rows = useMemo(
    () => (venue === "全部场所" ? demoPositions : demoPositions.filter((p) => p.venue === venue)),
    [venue],
  );

  const notional = rows.reduce((sum, p) => sum + p.notional, 0);
  const avgPnl = rows.length
    ? rows.reduce((sum, p) => sum + p.pnlPct * p.notional, 0) / notional
    : 0;

  return (
    <div>
      <PageHeader
        title="持仓"
        meta={
          <>
            {rows.length} 个持仓 · 名义 {compactUsd(notional)} · 加权盈亏 {signedPct(avgPnl)} ·{" "}
            <span className="rounded border border-amber-signal/30 bg-amber-signal/10 px-1.5 py-0.5 font-mono text-[10px] text-amber-signal">
              示例数据
            </span>
          </>
        }
        action={
          <div className="flex gap-1.5">
            {venueOptions.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setVenue(option)}
                className={`rounded-lg border px-2.5 py-1.5 text-xs transition ${
                  venue === option
                    ? "border-signal-400/30 bg-signal-400/10 text-signal-300"
                    : "border-mist-400/15 bg-white/[0.02] text-mist-200 hover:border-mist-400/30"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        }
      />

      <section className="panel overflow-hidden rounded-xl">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <thead>
              <tr className="border-b border-mist-400/10 text-[11px] text-mist-400">
                <th className="px-4 py-2.5 font-normal">场所</th>
                <th className="px-4 py-2.5 font-normal">币种</th>
                <th className="px-4 py-2.5 font-normal">方向</th>
                <th className="px-4 py-2.5 text-right font-normal">名义价值</th>
                <th className="px-4 py-2.5 text-right font-normal">开仓价</th>
                <th className="px-4 py-2.5 text-right font-normal">标记价</th>
                <th className="px-4 py-2.5 text-right font-normal">盈亏</th>
                <th className="px-4 py-2.5 text-right font-normal">置信度</th>
                <th className="px-4 py-2.5 text-right font-normal">更新时间</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((position) => (
                <tr
                  key={position.id}
                  className="border-b border-mist-400/[0.07] last:border-0 hover:bg-white/[0.02]"
                >
                  <td className="px-4 py-3 text-xs text-mist-200">{position.venue}</td>
                  <td className="px-4 py-3 text-xs font-medium text-white">{position.symbol}</td>
                  <td className="px-4 py-3 text-xs text-mist-200">
                    {position.side}
                    {position.leverage ? (
                      <span className="ml-1 font-mono text-[10px] text-mist-400">
                        {position.leverage}x
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-mist-200">
                    {compactUsd(position.notional)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-[11px] text-mist-400">
                    {price(position.entry)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-[11px] text-mist-200">
                    {price(position.mark)}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-mono text-xs ${pnlTone(position.pnlPct)}`}
                  >
                    {signedPct(position.pnlPct)}
                  </td>
                  <td className="px-4 py-3 text-right text-[11px] text-mist-400">
                    {position.confidence}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-[11px] text-mist-400">
                    {position.updated}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel mt-4 overflow-hidden rounded-xl">
        <div className="flex items-center justify-between border-b border-mist-400/10 px-4 py-3">
          <h2 className="text-sm font-semibold text-white">今日仓位变化</h2>
          <span className="font-mono text-[11px] text-mist-400">
            {demoChanges.length} 次 · 已实现 {demoKpis.realizedToday}
          </span>
        </div>
        <ul className="divide-y divide-mist-400/[0.07]">
          {demoChanges.map((change) => (
            <li key={change.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="flex items-center gap-2.5">
                <span className="font-mono text-[11px] text-mist-400">{change.time}</span>
                <span className="text-xs font-medium text-mist-200">{change.action}</span>
                <span className="text-xs text-white">{change.symbol}</span>
                <span className="font-mono text-[10px] text-mist-400">{change.venue}</span>
                <span className="text-[11px] text-mist-400">{change.detail}</span>
              </div>
              <span className="font-mono text-xs text-mist-200">{change.amount}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
