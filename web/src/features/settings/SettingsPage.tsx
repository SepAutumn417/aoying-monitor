import { Save, SlidersHorizontal } from "lucide-react";

import { PageHeader } from "../../components/ui/PageHeader";
import { StatusPill } from "../../components/ui/StatusPill";

export function SettingsPage() {
  return (
    <div>
      <PageHeader
        eyebrow="SETTINGS / 设置"
        title="系统设置"
        description="阈值、静默时段、通知通道和设备管理会在 I1/I3/I7 逐步接入；I0 只保留结构。"
        action={<StatusPill tone="pending" label="结构占位" />}
      />

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <section className="panel rounded-xl p-5">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-mist-200" />
            <h2 className="text-sm font-semibold text-white">仓位提醒阈值</h2>
          </div>
          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="text-xs text-mist-200">最小仓位变化（%）</span>
              <input
                type="number"
                defaultValue={1}
                className="mt-1.5 w-full rounded-lg border border-mist-400/15 bg-black/20 px-3 py-2 font-mono text-sm text-mist-200 outline-none focus:border-signal-400/40"
              />
            </label>
            <label className="block">
              <span className="text-xs text-mist-200">最小名义价值（USD）</span>
              <input
                type="number"
                defaultValue={50}
                className="mt-1.5 w-full rounded-lg border border-mist-400/15 bg-black/20 px-3 py-2 font-mono text-sm text-mist-200 outline-none focus:border-signal-400/40"
              />
            </label>
            <label className="block">
              <span className="text-xs text-mist-200">去重窗口（分钟）</span>
              <input
                type="number"
                defaultValue={10}
                className="mt-1.5 w-full rounded-lg border border-mist-400/15 bg-black/20 px-3 py-2 font-mono text-sm text-mist-200 outline-none focus:border-signal-400/40"
              />
            </label>
          </div>
          <button
            type="button"
            disabled
            className="mt-5 inline-flex items-center gap-2 rounded-lg border border-mist-400/15 bg-white/[0.02] px-3 py-2 text-xs text-mist-400"
          >
            <Save className="h-3.5 w-3.5" />
            I3 后启用保存
          </button>
        </section>

        <section className="panel rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white">设备与版本</h2>
          <div className="mt-4 space-y-2.5">
            <div className="rounded-lg border border-mist-400/10 bg-black/10 px-3 py-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-mist-200">Web</span>
                <span className="font-mono text-[10px] text-mist-400">v0.1.0 · 本地</span>
              </div>
              <p className="mt-1 text-[11px] leading-5 text-mist-400">
                Windows 用 Chrome/Edge 打开；无需安装。
              </p>
            </div>
            <div className="rounded-lg border border-mist-400/10 bg-black/10 px-3 py-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-mist-200">Android</span>
                <span className="font-mono text-[10px] text-mist-400">I1 接入</span>
              </div>
              <p className="mt-1 text-[11px] leading-5 text-mist-400">
                Flutter APK；前台服务 + 本地通知。
              </p>
            </div>
          </div>
          <p className="mt-4 border-t border-mist-400/10 pt-3 text-[11px] leading-5 text-mist-400">
            当前为 I0 骨架，所有设置仅展示，不会保存。真实配置在 I1 起逐步接通。
          </p>
        </section>
      </div>
    </div>
  );
}
