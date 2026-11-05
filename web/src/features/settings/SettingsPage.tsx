import { useState } from "react";

import { PageHeader } from "../../components/ui/PageHeader";

const thresholds = [
  { label: "最小仓位变化", unit: "%", value: "1" },
  { label: "最小名义价值", unit: "USD", value: "50" },
  { label: "提醒去重窗口", unit: "分钟", value: "10" },
];

const channels = [
  { name: "Android App", state: "待接入", note: "主通道" },
  { name: "企业微信", state: "未配置", note: "兜底" },
  { name: "邮件", state: "未配置", note: "日报" },
];

export function SettingsPage() {
  const [values, setValues] = useState(() => Object.fromEntries(thresholds.map((t) => [t.label, t.value])));

  return (
    <div>
      <PageHeader
        title="设置"
        meta={
          <>
            提醒阈值与通道 ·{" "}
            <span className="rounded border border-amber-signal/30 bg-amber-signal/10 px-1.5 py-0.5 font-mono text-[10px] text-amber-signal">
              示例数据
            </span>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel rounded-xl">
          <div className="border-b border-mist-400/10 px-4 py-3">
            <h2 className="text-sm font-semibold text-white">提醒阈值</h2>
          </div>
          <div className="space-y-3 px-4 py-4">
            {thresholds.map((item) => (
              <label key={item.label} className="flex items-center justify-between gap-3">
                <span className="text-xs text-mist-200">{item.label}</span>
                <span className="flex items-center gap-1.5">
                  <input
                    value={values[item.label]}
                    onChange={(event) =>
                      setValues((prev) => ({ ...prev, [item.label]: event.target.value }))
                    }
                    className="w-20 rounded-lg border border-mist-400/15 bg-black/20 px-2 py-1.5 text-right font-mono text-xs text-mist-200 outline-none focus:border-signal-400/40"
                  />
                  <span className="w-10 font-mono text-[10px] text-mist-400">{item.unit}</span>
                </span>
              </label>
            ))}
          </div>
        </section>

        <section className="panel rounded-xl">
          <div className="border-b border-mist-400/10 px-4 py-3">
            <h2 className="text-sm font-semibold text-white">提醒通道</h2>
          </div>
          <ul className="divide-y divide-mist-400/[0.07]">
            {channels.map((channel) => (
              <li key={channel.name} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-xs text-mist-200">{channel.name}</p>
                  <p className="mt-0.5 text-[11px] text-mist-400">{channel.note}</p>
                </div>
                <span className="text-[11px] text-mist-400">{channel.state}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
