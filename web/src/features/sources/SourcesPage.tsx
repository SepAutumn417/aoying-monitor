import { CircleDashed, Database, ExternalLink, Radio, Wallet } from "lucide-react";

import { PageHeader } from "../../components/ui/PageHeader";
import { StatusPill } from "../../components/ui/StatusPill";

const sources = [
  {
    name: "Telegram",
    detail: "4 个会话 · Telethon 主账号",
    icon: Radio,
    stage: "I2",
    note: "首次回补 200 条，之后每 5 分钟补洞；编辑/删除也归档。",
  },
  {
    name: "OKX",
    detail: "只读 API · 实盘仓位",
    icon: ExternalLink,
    stage: "I4",
    note: "需要 user 提供只读 key；先解析 authorId，再轮询持仓/成交。",
  },
  {
    name: "fomo",
    detail: "Solana / Base 链上钱包",
    icon: Wallet,
    stage: "I5",
    note: "免费 key 一次性解析钱包，之后走公共 RPC；标注“链上推断”。",
  },
  {
    name: "X",
    detail: "twscrape · 小号 cookies",
    icon: Database,
    stage: "I6",
    note: "90 秒轮询；cookie 失效/被限流时降级并告警。",
  },
];

export function SourcesPage() {
  return (
    <div>
      <PageHeader
        eyebrow="SOURCES / 来源"
        title="数据源与健康"
        description="每个来源独立配置、独立健康检查；接入一个就验收一个，不等待全部完成。"
        action={<StatusPill tone="pending" label="0 / 4 已接入" />}
      />

      <div className="grid gap-3 md:grid-cols-2">
        {sources.map(({ name, detail, icon: Icon, stage, note }) => (
          <article key={name} className="panel rounded-xl p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-lg border border-mist-400/15 bg-white/[0.03]">
                  <Icon className="h-4 w-4 text-mist-200" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-white">{name}</h2>
                  <p className="mt-1 text-xs text-mist-400">{detail}</p>
                </div>
              </div>
              <span className="rounded-md border border-mist-400/15 px-2 py-1 font-mono text-[10px] text-mist-400">
                {stage}
              </span>
            </div>
            <p className="mt-4 text-xs leading-5 text-mist-400">{note}</p>
            <div className="mt-4 flex items-center justify-between border-t border-mist-400/10 pt-3">
              <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-mist-400">
                <CircleDashed className="h-3 w-3" />
                未配置
              </span>
              <button
                type="button"
                className="rounded-md border border-mist-400/15 px-2.5 py-1.5 text-[11px] text-mist-200 transition hover:border-signal-400/30 hover:text-white"
              >
                查看接入说明
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
