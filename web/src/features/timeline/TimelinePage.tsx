import { useMemo, useState } from "react";
import { MessageSquare, Search, X } from "lucide-react";

import { PageHeader } from "../../components/ui/PageHeader";
import { demoStatements } from "../../lib/demo";

const filters = ["全部", "TG 观点", "X 观点", "仓位同步", "粉丝互动"] as const;

export function TimelinePage() {
  const [active, setActive] = useState<(typeof filters)[number]>("全部");
  const [keyword, setKeyword] = useState("");

  const rows = useMemo(() => {
    return demoStatements.filter((statement) => {
      const matchFilter =
        active === "全部" ||
        (active === "TG 观点" && statement.source === "TG" && statement.kind === "观点") ||
        (active === "X 观点" && statement.source === "X") ||
        (active === "仓位同步" && statement.kind === "仓位") ||
        (active === "粉丝互动" && statement.kind === "互动");
      const matchKeyword =
        !keyword ||
        statement.text.includes(keyword) ||
        statement.tags.some((tag) => tag.toUpperCase().includes(keyword.toUpperCase()));
      return matchFilter && matchKeyword;
    });
  }, [active, keyword]);

  return (
    <div>
      <PageHeader
        title="发言与事件"
        meta={
          <>
            {rows.length} 条 · 按时间倒序 ·{" "}
            <span className="rounded border border-amber-signal/30 bg-amber-signal/10 px-1.5 py-0.5 font-mono text-[10px] text-amber-signal">
              示例数据
            </span>
          </>
        }
        action={
          <div className="flex items-center gap-2 rounded-lg border border-mist-400/15 bg-black/20 px-3 py-1.5">
            <Search className="h-3.5 w-3.5 text-mist-400" />
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              className="w-40 bg-transparent text-xs text-mist-200 outline-none placeholder:text-mist-400/60"
              placeholder="搜索币种或原文"
              aria-label="搜索发言"
            />
          </div>
        }
      />

      <div className="mb-3 flex flex-wrap gap-1.5">
        {filters.map((filter) => (
          <button
            key={filter}
            type="button"
            onClick={() => setActive(filter)}
            className={`rounded-lg border px-2.5 py-1.5 text-xs transition ${
              active === filter
                ? "border-signal-400/30 bg-signal-400/10 text-signal-300"
                : "border-mist-400/15 bg-white/[0.02] text-mist-200 hover:border-mist-400/30"
            }`}
          >
            {filter}
          </button>
        ))}
      </div>

      <section className="panel overflow-hidden rounded-xl">
        <ul className="divide-y divide-mist-400/[0.07]">
          {rows.map((statement) => (
            <li key={statement.id} className="px-4 py-3.5">
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
                <span className="text-xs text-mist-200">{statement.channel}</span>
                <span className="font-mono text-[11px] text-mist-400">{statement.time}</span>
                {statement.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-mist-400"
                  >
                    {tag}
                  </span>
                ))}
                <span className="ml-auto font-mono text-[10px] text-mist-400">
                  {statement.kind}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-mist-200">{statement.text}</p>
            </li>
          ))}
          {rows.length === 0 ? (
            <li className="px-4 py-12 text-center text-sm text-mist-400">没有匹配的发言</li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
