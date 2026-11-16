/**
 * The signal feed: what the bot just did, newest first.
 *
 * Rows come straight off the live socket (`signal.open`, `signal.close`, …),
 * so this page and the chime you just heard describe the same event. The
 * filters are by action, not by severity — "减仓" is not "less important than
 * 开仓", it is a different thing to react to.
 */

import { useEffect, useState } from "react";
import { BellRing, BellOff, Volume2, VolumeX } from "lucide-react";

import { PageHeader } from "../../components/ui/PageHeader";
import { useAlerts } from "../../lib/alerts";
import { price } from "../../lib/format";
import {
  ACTION_HINT,
  ACTION_LABEL,
  SIGNAL_ACTIONS,
  actionTone,
  countByAction,
  type SignalAction,
} from "../../lib/signals";
import { SOUND_LABEL } from "../../lib/sound";

type Filter = "all" | SignalAction;

function clockOf(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return date.toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit" });
}

function dayOf(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  if (sameDay) return "今天";
  return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

export function AlertsPage() {
  const { alerts, muted, toggleMuted, preview, unread, markRead, soundBlocked } = useAlerts();
  const [filter, setFilter] = useState<Filter>("all");

  // Opening the page is the read receipt.
  useEffect(() => {
    markRead();
  }, [markRead]);

  const counts = countByAction(alerts);
  const rows = filter === "all" ? alerts : alerts.filter((alert) => alert.action === filter);
  const filters: Filter[] = ["all", ...SIGNAL_ACTIONS];

  return (
    <div>
      <PageHeader
        title="信号提醒"
        meta={
          <>
            {alerts.length} 条 · 未读 {unread} ·{" "}
            {soundBlocked ? (
              <span className="text-amber-signal">浏览器拦截了声音，点一下页面任意处重试</span>
            ) : muted ? (
              "声音已关闭"
            ) : (
              "每种操作不同声音"
            )}
          </>
        }
        action={
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={toggleMuted}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition ${
                muted
                  ? "border-mist-400/20 bg-white/[0.02] text-mist-400"
                  : "border-signal-400/30 bg-signal-400/10 text-signal-300"
              }`}
            >
              {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
              {muted ? "已静音" : "声音开"}
            </button>
          </div>
        }
      />

      <p className="mb-3 text-xs text-mist-400">提醒来自单条 Telegram 消息的解析，不代表实际持仓或成交。</p>
      <section className="panel mb-4 rounded-xl px-4 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {filters.map((option) => {
            const active = filter === option;
            const label = option === "all" ? "全部" : ACTION_LABEL[option];
            const count = option === "all" ? alerts.length : counts[option];
            return (
              <button
                key={option}
                type="button"
                onClick={() => setFilter(option)}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition ${
                  active
                    ? "border-signal-400/30 bg-signal-400/10 text-signal-300"
                    : "border-mist-400/15 bg-white/[0.02] text-mist-200 hover:border-mist-400/30"
                }`}
              >
                <span>{label}</span>
                <span className="font-mono text-[10px] text-mist-400">{count}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-mist-400/10 pt-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-mist-400">
            声音对照
          </span>
          {SIGNAL_ACTIONS.map((action) => (
            <button
              key={action}
              type="button"
              onClick={() => preview(action)}
              title={`试听${ACTION_LABEL[action]}`}
              aria-label={`试听${ACTION_LABEL[action]}`}
              className="flex items-center gap-1.5 rounded border border-mist-400/15 px-2 py-1 text-[11px] text-mist-400 transition hover:border-signal-400/40 hover:text-signal-300"
            >
              {muted ? <BellOff className="h-3 w-3" /> : <BellRing className="h-3 w-3" />}
              {ACTION_LABEL[action]}
              <span className="font-mono text-[10px] text-mist-400/60">{SOUND_LABEL[action]}</span>
            </button>
          ))}
        </div>
      </section>

      {rows.length === 0 ? (
        <section className="panel rounded-xl px-4 py-10 text-center">
          <p className="text-xs text-mist-400">
            {alerts.length === 0
              ? "还没有收到信号。熬鹰在 Telegram 发出开单消息后，这里会立刻出现，同时按操作类型响不同的声音。"
              : "这个操作还没有出现过。"}
          </p>
        </section>
      ) : (
        <section className="panel overflow-hidden rounded-xl">
          <ul className="divide-y divide-mist-400/[0.07]">
            {rows.map((alert) => {
              return (
                <li key={alert.id} className="flex items-start gap-3 px-4 py-3">
                  <span
                    className={`mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium ${actionTone(alert.action)}`}
                  >
                    {ACTION_LABEL[alert.action]}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-sm font-medium text-white">{alert.headline}</span>
                      {alert.test ? (
                        <span className="rounded border border-amber-signal/30 bg-amber-signal/10 px-1 py-0.5 font-mono text-[9px] text-amber-signal">
                          测试
                        </span>
                      ) : null}
                      <span className="font-mono text-[10px] text-mist-400">
                        {dayOf(alert.createdAt)} {clockOf(alert.createdAt)}
                      </span>
                    </div>

                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-mist-400">
                      {alert.leverage !== null ? (
                        <span className="font-mono">{alert.leverage}x</span>
                      ) : null}
                      {alert.entry !== null ? (
                        <span>
                          开仓价 <span className="font-mono text-mist-200">{price(alert.entry)}</span>
                        </span>
                      ) : null}
                    </p>

                    {alert.summary ? (
                      <p className="mt-1 truncate font-mono text-[10px] text-mist-400/70">
                        {alert.summary}
                      </p>
                    ) : null}
                  </div>

                  <span className="hidden shrink-0 text-[10px] text-mist-400/60 sm:block">
                    {ACTION_HINT[alert.action]}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
