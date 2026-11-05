import { BellOff, CheckCheck } from "lucide-react";

import { PageHeader } from "../../components/ui/PageHeader";
import { StatusPill } from "../../components/ui/StatusPill";

export function AlertsPage() {
  return (
    <div>
      <PageHeader
        eyebrow="ALERTS / 告警"
        title="告警与送达"
        description="Android 在线时走自建 WebSocket；App 离线或 30 秒未确认时，critical 事件降级到企业微信/邮件。"
        action={<StatusPill tone="pending" label="等待 I7" />}
      />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="panel rounded-xl p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">最近告警</h2>
            <BellOff className="h-4 w-4 text-mist-400/60" />
          </div>
          <div className="mt-5 grid place-items-center rounded-lg border border-dashed border-mist-400/15 bg-black/10 px-4 py-12 text-center">
            <p className="text-sm text-mist-200">还没有告警</p>
            <p className="mt-1 max-w-sm text-xs leading-5 text-mist-400">
              I3 接入仓位事件后，这里会显示每次提醒的通道、送达状态和确认时间。
            </p>
          </div>
        </section>

        <section className="panel rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white">送达通道</h2>
          <ul className="mt-4 space-y-2.5">
            {[
              ["Android App", "主通道 · WebSocket + 本地通知", "待 I1"],
              ["企业微信", "兜底 · critical 事件", "待配置"],
              ["邮件", "日报 / 严重告警", "待配置"],
            ].map(([name, detail, state]) => (
              <li
                key={name}
                className="flex items-start justify-between gap-3 rounded-lg border border-mist-400/10 bg-black/10 px-3 py-3"
              >
                <div>
                  <p className="text-xs font-medium text-mist-200">{name}</p>
                  <p className="mt-1 text-[11px] leading-5 text-mist-400">{detail}</p>
                </div>
                <span className="shrink-0 font-mono text-[10px] text-mist-400">{state}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-signal-400/15 bg-signal-400/5 px-3 py-2.5">
            <CheckCheck className="h-3.5 w-3.5 text-signal-300" />
            <p className="text-[11px] leading-5 text-mist-400">
              告警去重与合并规则在 I3 实现，避免刷屏。
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
