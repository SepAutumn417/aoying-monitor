import { ArrowDownRight, ArrowUpRight, Wallet } from "lucide-react";

import { PageHeader } from "../../components/ui/PageHeader";
import { StatusPill } from "../../components/ui/StatusPill";

const columns = ["场所", "币种", "方向", "数量", "开仓价", "置信度", "来源"];

export function PositionsPage() {
  return (
    <div>
      <PageHeader
        eyebrow="POSITIONS / 持仓"
        title="持仓与仓位变化"
        description="OKX 实盘、fomo 链上、Binance（TG 推断）分开展示，不做跨场所净额；每个仓位都带来源与置信度。"
        action={<StatusPill tone="pending" label="等待 I3" />}
      />

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "未实现 PnL", value: "—", icon: ArrowUpRight },
          { label: "已实现 PnL（今日）", value: "—", icon: ArrowDownRight },
          { label: "当前仓位", value: "0", icon: Wallet },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="panel rounded-xl p-4">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-mist-400">
                {label}
              </p>
              <Icon className="h-4 w-4 text-mist-400/60" />
            </div>
            <p className="mt-3 font-mono text-2xl text-white">{value}</p>
            <p className="mt-1 text-[11px] text-mist-400">接入数据源后自动统计</p>
          </div>
        ))}
      </section>

      <section className="panel mt-4 overflow-hidden rounded-xl">
        <div className="flex items-center justify-between border-b border-mist-400/10 px-4 py-3.5">
          <h2 className="text-sm font-semibold text-white">当前仓位</h2>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-mist-400">
            0 ROWS
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left">
            <thead>
              <tr className="border-b border-mist-400/10">
                {columns.map((column) => (
                  <th
                    key={column}
                    className="px-4 py-2.5 font-mono text-[10px] font-normal uppercase tracking-[0.12em] text-mist-400"
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={columns.length} className="px-4 py-14 text-center">
                  <p className="text-sm text-mist-200">还没有持仓</p>
                  <p className="mt-1 text-xs text-mist-400">
                    I3 先接入 Binance（TG 推断），I4/I5 再接入 OKX 与 fomo 链上。
                  </p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
