import { useState } from "react";

import { PageHeader } from "../../components/ui/PageHeader";
import { demoAlerts } from "../../lib/demo";

const levels = ["全部", "高", "中", "低"] as const;

const levelDot: Record<string, string> = {
  高: "bg-danger",
  中: "bg-amber-signal",
  低: "bg-mist-400",
};

export function AlertsPage() {
  const [level, setLevel] = useState<(typeof levels)[number]>("全部");
  const rows = level === "全部" ? demoAlerts : demoAlerts.filter((a) => a.level === level);

  return (
    <div>
      <PageHeader
        title="提醒"
        meta={
          <>
            {rows.length} 条 · 主通道 Android ·{" "}
            <span className="rounded border border-amber-signal/30 bg-amber-signal/10 px-1.5 py-0.5 font-mono text-[10px] text-amber-signal">
              示例数据
            </span>
          </>
        }
        action={
          <div className="flex gap-1.5">
            {levels.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setLevel(option)}
                className={`rounded-lg border px-2.5 py-1.5 text-xs transition ${
                  level === option
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
        <ul className="divide-y divide-mist-400/[0.07]">
          {rows.map((alert) => (
            <li key={alert.id} className="flex items-start gap-3 px-4 py-3">
              <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${levelDot[alert.level]}`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-white">{alert.title}</span>
                  <span className="font-mono text-[11px] text-mist-400">{alert.time}</span>
                </div>
                <p className="mt-0.5 text-[11px] leading-5 text-mist-400">{alert.detail}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="rounded bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-mist-400">
                  {alert.channel}
                </span>
                <span
                  className={`text-[11px] ${
                    alert.state === "待确认" ? "text-amber-signal" : "text-mist-400"
                  }`}
                >
                  {alert.state}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
