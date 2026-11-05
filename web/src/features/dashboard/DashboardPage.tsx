import { ArrowUpRight, CircleDot, Layers, ShieldCheck } from "lucide-react";

import { PageHeader } from "../../components/ui/PageHeader";
import { StatusPill } from "../../components/ui/StatusPill";

const sourceCards = [
  {
    name: "Telegram",
    detail: "4 个会话 · 仓位/观点/互动",
    stage: "I2 接入",
    tone: "pending" as const,
  },
  {
    name: "Binance（TG 推断）",
    detail: "从群消息/截图抽取仓位",
    stage: "I3 接入",
    tone: "pending" as const,
  },
  {
    name: "OKX 实盘",
    detail: "只读 API · Orbit 持仓",
    stage: "I4 接入",
    tone: "pending" as const,
  },
  {
    name: "fomo 链上",
    detail: "Solana / Base 钱包",
    stage: "I5 接入",
    tone: "pending" as const,
  },
];

const roadmap = [
  ["I0", "规格与脚手架", "当前", "ok"],
  ["I1", "登录 + 设备 + 实时通道", "下一步", "warn"],
  ["I2", "Telegram + 时间线", "待开始", "pending"],
  ["I3", "Binance 抽取 + 安卓通知", "待开始", "pending"],
  ["I4–I6", "OKX / fomo / X", "待开始", "pending"],
  ["I7–I8", "可靠性 / 上线 soak", "待开始", "pending"],
] as const;

export function DashboardPage() {
  return (
    <div>
      <PageHeader
        eyebrow="OVERVIEW / 总览"
        title="监控总览"
        description="熬鹰资本的交易动作与公开发言，最终会汇入同一条时间线。当前是 I0 骨架，先把三端跑通，再逐个接入数据源。"
        action={<StatusPill tone="ok" label="I0 骨架就绪" />}
      />

      <section className="panel relative overflow-hidden rounded-xl p-5 md:p-6">
        <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-signal-400/5 blur-3xl" />
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-signal-300" />
              <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-signal-300">
                SYSTEM SKELETON
              </span>
            </div>
            <h2 className="mt-2 text-xl font-semibold text-white md:text-2xl">
              系统骨架已就绪
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-mist-400">
              React Web、FastAPI 后端、Flutter Android 三段骨架已经落位。接下来先做登录与实时通道，再按增量接入
              Telegram、Binance、OKX、fomo 和 X。
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg border border-mist-400/10 bg-black/20 px-3 py-3">
              <p className="font-mono text-lg text-white">3</p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-mist-400">端骨架</p>
            </div>
            <div className="rounded-lg border border-mist-400/10 bg-black/20 px-3 py-3">
              <p className="font-mono text-lg text-white">0</p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-mist-400">数据源</p>
            </div>
            <div className="rounded-lg border border-mist-400/10 bg-black/20 px-3 py-3">
              <p className="font-mono text-lg text-white">1</p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-mist-400">当前增量</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {sourceCards.map((source) => (
          <article key={source.name} className="panel rounded-xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">{source.name}</p>
                <p className="mt-1 text-xs leading-5 text-mist-400">{source.detail}</p>
              </div>
              <CircleDot className="h-4 w-4 shrink-0 text-mist-400/50" />
            </div>
            <div className="mt-4 flex items-center justify-between gap-2">
              <StatusPill tone={source.tone} label={source.stage} />
              <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-signal/25 bg-amber-signal/5 px-2 py-1 font-mono text-[11px] tracking-wide text-amber-signal">
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                NOT CONNECTED
              </span>
            </div>
          </article>
        ))}
      </section>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <section className="panel flex flex-col rounded-xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-mist-400">
                LATEST EVENTS
              </p>
              <h3 className="mt-1 text-base font-semibold text-white">最新事件</h3>
            </div>
            <Layers className="h-4 w-4 text-mist-400/60" />
          </div>
          <div className="mt-5 grid flex-1 place-items-center rounded-lg border border-dashed border-mist-400/15 bg-black/10 px-4 py-10 text-center">
            <p className="text-sm font-medium text-mist-200">还没有事件</p>
            <p className="mt-1 max-w-sm text-xs leading-5 text-mist-400">
              I2 接入 Telegram 后，这里会按时间倒序出现消息、仓位变化和告警；点击可查看原始证据。
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {["消息原文", "抽取结果", "仓位变化", "原始证据"].map((item) => (
                <span
                  key={item}
                  className="rounded-md border border-mist-400/15 bg-white/[0.02] px-2 py-1 text-[11px] text-mist-400"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="panel rounded-xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-mist-400">
                ROADMAP
              </p>
              <h3 className="mt-1 text-base font-semibold text-white">增量路线</h3>
            </div>
            <ArrowUpRight className="h-4 w-4 text-mist-400/60" />
          </div>
          <ol className="mt-4 space-y-2">
            {roadmap.map(([id, label, state, tone]) => (
              <li
                key={id}
                className="flex items-center justify-between gap-3 rounded-lg border border-mist-400/10 bg-black/10 px-3 py-2.5"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-mist-400">
                    {id}
                  </span>
                  <span className="text-xs text-mist-200">{label}</span>
                </div>
                <StatusPill tone={tone} label={state} />
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
