import { Database, MessageSquare, Radio, Wallet } from "lucide-react";

import { PageHeader } from "../../components/ui/PageHeader";

const sources = [
  {
    name: "Telegram",
    detail: "4 个会话 · 主账号 Telethon",
    icon: MessageSquare,
    state: "未接入",
    tone: "amber",
    meta: ["观点 / 仓位 / 互动"],
  },
  {
    name: "币安",
    detail: "从 TG 消息与截图推断",
    icon: Radio,
    state: "未接入",
    tone: "amber",
    meta: ["推断数据"],
  },
  {
    name: "OKX",
    detail: "只读 API · Orbit 实盘",
    icon: Wallet,
    state: "未接入",
    tone: "amber",
    meta: ["官方仓位"],
  },
  {
    name: "fomo",
    detail: "Solana / Base 链上钱包",
    icon: Database,
    state: "未接入",
    tone: "amber",
    meta: ["链上推断"],
  },
  {
    name: "X",
    detail: "@thankUcrypto_ · 轮询",
    icon: Radio,
    state: "未接入",
    tone: "amber",
    meta: ["日常观点"],
  },
];

export function SourcesPage() {
  return (
    <div>
      <PageHeader
        title="数据源"
        meta={
          <>
            0 / 5 已接入 ·{" "}
            <span className="rounded border border-amber-signal/30 bg-amber-signal/10 px-1.5 py-0.5 font-mono text-[10px] text-amber-signal">
              示例数据
            </span>
          </>
        }
      />

      <section className="panel overflow-hidden rounded-xl">
        <ul className="divide-y divide-mist-400/[0.07]">
          {sources.map(({ name, detail, icon: Icon, state, meta }) => (
            <li key={name} className="flex items-center gap-3 px-4 py-3">
              <div className="grid h-8 w-8 place-items-center rounded-lg border border-mist-400/15 bg-white/[0.03]">
                <Icon className="h-3.5 w-3.5 text-mist-200" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-white">{name}</p>
                <p className="mt-0.5 text-[11px] text-mist-400">{detail}</p>
              </div>
              <div className="hidden items-center gap-1.5 sm:flex">
                {meta.map((item) => (
                  <span
                    key={item}
                    className="rounded bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-mist-400"
                  >
                    {item}
                  </span>
                ))}
              </div>
              <span className="w-16 text-right text-[11px] text-amber-signal">{state}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
