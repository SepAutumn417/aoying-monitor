import { Filter, Radio, Search } from "lucide-react";

import { PageHeader } from "../../components/ui/PageHeader";
import { StatusPill } from "../../components/ui/StatusPill";

export function TimelinePage() {
  return (
    <div>
      <PageHeader
        eyebrow="TIMELINE / 时间线"
        title="事件时间线"
        description="Telegram、X、OKX、链上事件最终统一到这里。I0 先放筛选与空状态，I2 起接入真实消息。"
        action={<StatusPill tone="pending" label="等待 I2" />}
      />

      <div className="panel rounded-xl p-4 md:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex flex-1 items-center gap-2 rounded-lg border border-mist-400/15 bg-black/20 px-3 py-2">
            <Search className="h-4 w-4 text-mist-400" />
            <input
              className="w-full bg-transparent text-sm text-mist-200 outline-none placeholder:text-mist-400/60"
              placeholder="搜索币种、原文、地址或事件 ID"
              aria-label="搜索事件"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {["全部来源", "全部币种", "全部类型", "最近 24h"].map((label) => (
              <button
                key={label}
                type="button"
                className="inline-flex items-center gap-2 rounded-lg border border-mist-400/15 bg-white/[0.02] px-3 py-2 text-xs text-mist-200 transition hover:border-mist-400/30"
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-signal-400/25 bg-signal-400/10 px-3 py-2 text-xs text-signal-300"
            >
              <Filter className="h-3.5 w-3.5" />
              筛选
            </button>
          </div>
        </div>

        <div className="mt-6 grid place-items-center rounded-lg border border-dashed border-mist-400/15 bg-black/10 px-4 py-16 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-full border border-mist-400/15 bg-white/[0.02]">
            <Radio className="h-5 w-5 text-mist-400/70" />
          </div>
          <p className="mt-4 text-sm font-medium text-mist-200">时间线还没有数据</p>
          <p className="mt-1 max-w-md text-xs leading-5 text-mist-400">
            I2 会先接入 4 个 Telegram 会话；届时这里按时间倒序显示原始消息、抽取结果和仓位事件，并支持断线补拉。
          </p>
        </div>
      </div>
    </div>
  );
}
