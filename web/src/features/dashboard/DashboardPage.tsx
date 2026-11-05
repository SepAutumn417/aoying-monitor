import { ArrowDownRight, ArrowUpRight, Bell, MessageSquare, X } from "lucide-react";

import { PageHeader } from "../../components/ui/PageHeader";
import {
  demoAlerts,
  demoAllocation,
  demoChanges,
  demoKpis,
  demoPositions,
  demoStatements,
  demoWatchlist,
} from "../../lib/demo";
import { compactUsd, pnlTone, price, signedPct } from "../../lib/format";

const venueTone: Record<string, string> = {
  币安: "border-amber-signal/30 bg-amber-signal/10 text-amber-signal",
  OKX: "border-mist-400/25 bg-mist-400/10 text-mist-200",
  fomo: "border-signal-400/25 bg-signal-400/10 text-signal-300",
};

const venueBar: Record<string, string> = {
  币安: "bg-amber-signal",
  OKX: "bg-mist-400",
  fomo: "bg-signal-400",
};

const actionTone: Record<string, string> = {
  新开: "text-signal-300",
  加仓: "text-signal-300",
  减仓: "text-amber-signal",
  平仓: "text-mist-200",
};

export function DashboardPage() {
  const kpiCards = [
    {
      label: "总名义仓位",
      value: compactUsd(demoKpis.notional),
      note: `${demoKpis.openPositions} 个持仓 · 3 个场所`,
      tone: "text-white",
    },
    {
      label: "未实现盈亏",
      value: `${demoKpis.unrealized >= 0 ? "+" : ""}${compactUsd(demoKpis.unrealized)}`,
      note: `${signedPct(demoKpis.unrealizedPct)} · 按标记价`,
      tone: pnlTone(demoKpis.unrealized),
    },
    {
      label: "今日已实现",
      value: `+${compactUsd(demoKpis.realizedToday)}`,
      note: "含已平仓 2 笔",
      tone: "text-signal-300",
    },
    {
      label: "今日仓位变化",
      value: `${demoKpis.changesToday}`,
      note: `下方展示最近 ${demoChanges.length} 次`,
      tone: "text-white",
    },
  ];

  return (
    <div>
      <PageHeader
        title="监控总览"
        meta={
          <>
            最后更新 {demoKpis.updatedAt}
            <span className="ml-2 rounded border border-amber-signal/40 bg-amber-signal/10 px-1.5 py-0.5 font-mono text-[10px] text-amber-signal">
              示例数据
            </span>
          </>
        }
        action={
          <button
            type="button"
            className="rounded-lg border border-signal-400/25 bg-signal-400/10 px-3 py-1.5 text-xs text-signal-300"
          >
            仅看仓位变化
          </button>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpiCards.map((card) => (
          <div key={card.label} className="panel rounded-xl px-4 py-3.5">
            <p className="text-xs text-mist-400">{card.label}</p>
            <p className={`mt-1.5 font-mono text-xl ${card.tone}`}>{card.value}</p>
            <p className="mt-1 text-[11px] text-mist-400">{card.note}</p>
          </div>
        ))}
      </section>

      <section className="panel mt-3 rounded-xl px-4 py-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-mist-400">场所分布</p>
          <p className="font-mono text-[11px] text-mist-400">按名义价值</p>
        </div>
        <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-white/[0.04]">
          {demoAllocation.map((item) => (
            <div
              key={item.venue}
              className={venueBar[item.venue]}
              style={{ width: `${item.share * 100}%` }}
            />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
          {demoAllocation.map((item) => (
            <span key={item.venue} className="flex items-center gap-1.5 text-[11px] text-mist-400">
              <span className={`h-2 w-2 rounded-sm ${venueBar[item.venue]}`} />
              {item.venue} {compactUsd(item.value)}
              <span className="font-mono">{(item.share * 100).toFixed(0)}%</span>
            </span>
          ))}
        </div>
      </section>

      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[1.55fr_1fr]">
        <section className="panel overflow-hidden rounded-xl">
          <div className="flex items-center justify-between border-b border-mist-400/10 px-4 py-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-white">当前持仓</h2>
              <span className="font-mono text-[11px] text-mist-400">{demoPositions.length} 个</span>
            </div>
            <a href="/positions" className="text-xs text-mist-400 hover:text-mist-200">
              全部持仓 →
            </a>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left">
              <thead>
                <tr className="border-b border-mist-400/10 text-[11px] text-mist-400">
                  <th className="px-4 py-2 font-normal">场所</th>
                  <th className="px-4 py-2 font-normal">币种</th>
                  <th className="px-4 py-2 font-normal">方向</th>
                  <th className="px-4 py-2 text-right font-normal">名义</th>
                  <th className="px-4 py-2 text-right font-normal">开仓 / 标记</th>
                  <th className="px-4 py-2 text-right font-normal">盈亏</th>
                  <th className="px-4 py-2 text-right font-normal">置信</th>
                </tr>
              </thead>
              <tbody>
                {demoPositions.map((position) => (
                  <tr
                    key={position.id}
                    className="border-b border-mist-400/[0.07] last:border-0 hover:bg-white/[0.02]"
                  >
                    <td className="px-4 py-2.5">
                      <span
                        className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${venueTone[position.venue]}`}
                      >
                        {position.venue}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs font-medium text-white">{position.symbol}</td>
                    <td className="px-4 py-2.5 text-xs text-mist-200">
                      {position.side}
                      {position.leverage ? (
                        <span className="ml-1 font-mono text-[10px] text-mist-400">
                          {position.leverage}x
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs text-mist-200">
                      {compactUsd(position.notional)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-[11px] text-mist-400">
                      {price(position.entry)} / {price(position.mark)}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right font-mono text-xs ${pnlTone(position.pnlPct)}`}
                    >
                      {signedPct(position.pnlPct)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span
                        className={`text-[11px] ${
                          position.confidence === "高" ? "text-mist-200" : "text-amber-signal/90"
                        }`}
                      >
                        {position.confidence}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel overflow-hidden rounded-xl">
          <div className="flex items-center justify-between border-b border-mist-400/10 px-4 py-3">
            <h2 className="text-sm font-semibold text-white">仓位变化</h2>
            <a href="/positions" className="text-xs text-mist-400 hover:text-mist-200">
              今日 {demoKpis.changesToday} 次 →
            </a>
          </div>
          <ul className="divide-y divide-mist-400/[0.07]">
            {demoChanges.map((change) => (
              <li key={change.id} className="px-4 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-mist-400">{change.time}</span>
                    <span className={`text-xs font-semibold ${actionTone[change.action]}`}>
                      {change.action}
                    </span>
                    <span className="text-xs text-white">{change.symbol}</span>
                    <span className="font-mono text-[10px] text-mist-400">{change.venue}</span>
                  </div>
                  <span className="font-mono text-[11px] text-mist-200">{change.amount}</span>
                </div>
                <p className="mt-0.5 text-[11px] text-mist-400">{change.detail}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[1.55fr_1fr]">
        <section className="panel overflow-hidden rounded-xl">
          <div className="flex items-center justify-between border-b border-mist-400/10 px-4 py-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-mist-400" />
              <h2 className="text-sm font-semibold text-white">最新发言</h2>
            </div>
            <a href="/timeline" className="text-xs text-mist-400 hover:text-mist-200">
              全部 →
            </a>
          </div>
          <ul className="divide-y divide-mist-400/[0.07]">
            {demoStatements.slice(0, 4).map((statement) => (
              <li key={statement.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`grid h-5 w-5 place-items-center rounded ${
                      statement.source === "TG" ? "bg-mist-400/15" : "bg-white/[0.06]"
                    }`}
                  >
                    {statement.source === "TG" ? (
                      <MessageSquare className="h-3 w-3 text-mist-200" />
                    ) : (
                      <X className="h-3 w-3 text-mist-200" />
                    )}
                  </span>
                  <span className="text-[11px] text-mist-400">{statement.channel}</span>
                  <span className="font-mono text-[11px] text-mist-400">{statement.time}</span>
                  {statement.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-mist-400"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <p className="mt-1.5 text-sm leading-6 text-mist-200">{statement.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <div className="flex flex-col gap-4">
          <section className="panel overflow-hidden rounded-xl">
            <div className="flex items-center justify-between border-b border-mist-400/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-mist-400" />
                <h2 className="text-sm font-semibold text-white">最新提醒</h2>
              </div>
              <a href="/alerts" className="text-xs text-mist-400 hover:text-mist-200">
                全部 →
              </a>
            </div>
            <ul className="divide-y divide-mist-400/[0.07]">
              {demoAlerts.slice(0, 3).map((alert) => (
                <li key={alert.id} className="px-4 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          alert.level === "高"
                            ? "bg-danger"
                            : alert.level === "中"
                              ? "bg-amber-signal"
                              : "bg-mist-400"
                        }`}
                      />
                      <span className="text-xs text-mist-200">{alert.title}</span>
                    </div>
                    <span className="font-mono text-[11px] text-mist-400">{alert.time}</span>
                  </div>
                  <p className="mt-0.5 pl-3.5 text-[11px] text-mist-400">{alert.detail}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel overflow-hidden rounded-xl">
            <div className="border-b border-mist-400/10 px-4 py-3">
              <h2 className="text-sm font-semibold text-white">关注标的</h2>
            </div>
            <ul className="divide-y divide-mist-400/[0.07]">
              {demoWatchlist.map((item) => (
                <li
                  key={item.symbol}
                  className="flex items-center justify-between px-4 py-2"
                >
                  <span className="text-xs font-medium text-white">{item.symbol}</span>
                  <span className="font-mono text-[11px] text-mist-400">{item.price}</span>
                  <span
                    className={`inline-flex items-center gap-0.5 font-mono text-[11px] ${pnlTone(item.change)}`}
                  >
                    {item.change >= 0 ? (
                      <ArrowUpRight className="h-3 w-3" />
                    ) : (
                      <ArrowDownRight className="h-3 w-3" />
                    )}
                    {signedPct(item.change)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
