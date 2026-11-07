import { useCallback, useEffect, useState } from "react";
import { Database, Loader2, MessageSquare, Plug, Play, Radio, RefreshCw, Search, Square, Wallet } from "lucide-react";

import { PageHeader } from "../../components/ui/PageHeader";
import {
  api,
  ApiError,
  type ApiCollectorStatus,
  type ApiTelegramDialog,
  type ApiTelegramStatus,
  type ApiTelegramTopic,
} from "../../lib/api";
import { useLive } from "../../lib/live";

const otherSources = [
  { name: "币安", detail: "从 TG 消息与截图推断", icon: Radio, meta: "推断数据" },
  { name: "OKX", detail: "只读 API · Orbit 实盘", icon: Wallet, meta: "官方仓位" },
  { name: "fomo", detail: "Solana / Base 链上钱包", icon: Database, meta: "链上推断" },
  { name: "X", detail: "@thankUcrypto_ · 轮询", icon: Radio, meta: "日常观点" },
];

const stateLabel: Record<ApiCollectorStatus["state"], string> = {
  stopped: "已停止",
  connecting: "连接中",
  running: "运行中",
  error: "出错",
};

function TelegramPanel() {
  const live = useLive();
  const [status, setStatus] = useState<ApiTelegramStatus | null>(null);
  const [dialogs, setDialogs] = useState<ApiTelegramDialog[]>([]);
  const [topics, setTopics] = useState<ApiTelegramTopic[]>([]);
  const [discovered, setDiscovered] = useState<
    { chat_id: number; title: string; kind: string; username: string; followed: boolean }[]
  >([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [nextStatus, nextDialogs, nextTopics] = await Promise.all([
        api.telegramStatus(),
        api.telegramDialogs(),
        api.telegramTopics(-1002568478710),
      ]);
      setStatus(nextStatus);
      setDialogs(nextDialogs);
      setTopics(nextTopics);
      setError("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "读取 Telegram 状态失败");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (live.events.length === 0) return;
    if (!live.events[0]?.kind.startsWith("telegram.")) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.events[0]?.id]);

  const run = async (label: string, action: () => Promise<unknown>) => {
    setBusy(label);
    setError("");
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `${label}失败`);
    } finally {
      setBusy("");
    }
  };

  const collector = status?.collector;
  const running = collector?.state === "running";

  return (
    <section className="panel rounded-xl">
      <div className="flex flex-wrap items-center gap-3 border-b border-mist-400/[0.07] px-4 py-3">
        <div className="grid h-8 w-8 place-items-center rounded-lg border border-mist-400/15 bg-white/[0.03]">
          <MessageSquare className="h-3.5 w-3.5 text-mist-200" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-white">Telegram</p>
          <p className="mt-0.5 text-[11px] text-mist-400">
            {status?.account
              ? `${status.account.display_name || status.account.label}${
                  status.account.username ? ` @${status.account.username}` : ""
                } · 关注 ${status.followed} 个会话 · 已存 ${status.messages} 条`
              : "尚未登录。在服务器上运行 python -m app.telegram_login"}
          </p>
        </div>
        <span
          className={`font-mono text-[11px] ${
            collector?.state === "running"
              ? "text-signal-300"
              : collector?.state === "error"
                ? "text-danger"
                : "text-amber-signal"
          }`}
        >
          {collector ? stateLabel[collector.state] : "未知"}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={busy !== "" || running}
            onClick={() => void run("启动", api.startTelegram)}
            className="flex items-center gap-1 rounded-lg border border-mist-400/15 bg-white/[0.02] px-2 py-1 text-[11px] text-mist-200 hover:border-mist-400/30 disabled:opacity-40"
          >
            {busy === "启动" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
            启动
          </button>
          <button
            type="button"
            disabled={busy !== "" || !running}
            onClick={() => void run("停止", api.stopTelegram)}
            className="flex items-center gap-1 rounded-lg border border-mist-400/15 bg-white/[0.02] px-2 py-1 text-[11px] text-mist-200 hover:border-mist-400/30 disabled:opacity-40"
          >
            <Square className="h-3 w-3" />
            停止
          </button>
          <button
            type="button"
            disabled={busy !== "" || !running}
            onClick={() =>
              void run("发现会话", async () => {
                const list = await api.telegramDiscover();
                setDiscovered(list);
              })
            }
            className="flex items-center gap-1 rounded-lg border border-mist-400/15 bg-white/[0.02] px-2 py-1 text-[11px] text-mist-200 hover:border-mist-400/30 disabled:opacity-40"
          >
            {busy === "发现会话" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Search className="h-3 w-3" />
            )}
            发现会话
          </button>
          <button
            type="button"
            disabled={busy !== "" || !running}
            onClick={() => void run("补拉", api.syncTelegram)}
            className="flex items-center gap-1 rounded-lg border border-mist-400/15 bg-white/[0.02] px-2 py-1 text-[11px] text-mist-200 hover:border-mist-400/30 disabled:opacity-40"
          >
            {busy === "补拉" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            补拉
          </button>
        </div>
      </div>

      {collector?.detail ? (
        <p className="px-4 pt-2 text-[11px] text-mist-400">{collector.detail}</p>
      ) : null}
      {error ? (
        <p className="mx-4 mt-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      ) : null}

      <ul className="divide-y divide-mist-400/[0.07]">
        {dialogs.map((dialog) => (
          <li key={dialog.id} className="flex items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-mist-200">{dialog.title}</p>
              <p className="mt-0.5 font-mono text-[10px] text-mist-400">
                {dialog.chat_id} · {dialog.messages} 条
              </p>
            </div>
            <button
              type="button"
              disabled={busy !== ""}
              onClick={() =>
                void run(
                  dialog.enabled ? "取消关注" : "关注",
                  () =>
                    dialog.enabled
                      ? api.unfollowDialog(dialog.chat_id)
                      : api.followDialog(dialog.chat_id),
                )
              }
              className={`rounded-lg border px-2 py-1 text-[11px] transition ${
                dialog.enabled
                  ? "border-signal-400/30 bg-signal-400/10 text-signal-300"
                  : "border-mist-400/15 bg-white/[0.02] text-mist-400 hover:border-mist-400/30"
              }`}
            >
              {dialog.enabled ? "已关注" : "未关注"}
            </button>
          </li>
        ))}
        {dialogs.length === 0 ? (
          <li className="px-4 py-8 text-center text-xs text-mist-400">
            还没有关注任何会话。登录后启动采集，再点「补拉」获取会话列表。
          </li>
        ) : null}
      </ul>

      <div className="border-t border-mist-400/[0.07] px-4 py-3">
        <h3 className="text-xs font-medium text-mist-200">四个分区 · 仅监控熬鹰书友会</h3>
        <p className="mt-1 text-[11px] text-mist-400">交易信号优先；禁言群和聊天群关注本人发言；消息通知保留原文、默认静默。</p>
        <ul className="mt-2 divide-y divide-mist-400/[0.07]">
          {topics.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
              <span className="text-mist-200">{item.title}</span>
              <span className="text-mist-400">{item.messages} 条 · {item.last_synced_at ? `上次同步 ${new Date(item.last_synced_at).toLocaleString("zh-CN")}` : "尚未完成同步"}</span>
              {item.last_error ? <p className="w-full text-danger">{item.last_error}</p> : null}
            </li>
          ))}
        </ul>
        {topics.length === 0 ? <p className="mt-2 text-xs text-mist-400">分区尚未登记。关注书友会并启动采集后查看同步状态。</p> : null}
      </div>
      {discovered.length > 0 ? (
        <div className="border-t border-mist-400/[0.07]">
          <div className="flex items-center justify-between px-4 py-2">
            <p className="text-[11px] text-mist-400">
              发现 {discovered.length} 个会话，关注后立即开始收消息（无需重启）
            </p>
            <button
              type="button"
              onClick={() => setDiscovered([])}
              className="text-[11px] text-mist-400 hover:text-mist-200"
            >
              收起
            </button>
          </div>
          <ul className="max-h-72 divide-y divide-mist-400/[0.07] overflow-y-auto">
            {discovered.map((item) => (
              <li key={item.chat_id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-mist-200">{item.title}</p>
                  <p className="mt-0.5 font-mono text-[10px] text-mist-400">
                    {item.chat_id}
                    {item.username ? ` · @${item.username}` : ""} · {item.kind}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy !== ""}
                  onClick={() =>
                    void run(item.followed ? "取消关注" : "关注", async () => {
                      if (item.followed) {
                        await api.unfollowDialog(item.chat_id);
                      } else {
                        await api.followDialog(item.chat_id);
                      }
                      setDiscovered((current) =>
                        current.map((row) =>
                          row.chat_id === item.chat_id
                            ? { ...row, followed: !row.followed }
                            : row,
                        ),
                      );
                    })
                  }
                  className={`shrink-0 rounded-lg border px-2 py-1 text-[11px] transition ${
                    item.followed
                      ? "border-signal-400/30 bg-signal-400/10 text-signal-300"
                      : "border-mist-400/15 bg-white/[0.02] text-mist-400 hover:border-mist-400/30"
                  }`}
                >
                  {item.followed ? "已关注" : "关注"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export function SourcesPage() {
  return (
    <div>
      <PageHeader title="数据源" meta="采集状态与关注范围" />
      <div className="space-y-3">
        <TelegramPanel />
        <section className="panel overflow-hidden rounded-xl">
          <ul className="divide-y divide-mist-400/[0.07]">
            {otherSources.map(({ name, detail, icon: Icon, meta }) => (
              <li key={name} className="flex items-center gap-3 px-4 py-3">
                <div className="grid h-8 w-8 place-items-center rounded-lg border border-mist-400/15 bg-white/[0.03]">
                  <Icon className="h-3.5 w-3.5 text-mist-200" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-white">{name}</p>
                  <p className="mt-0.5 text-[11px] text-mist-400">{detail}</p>
                </div>
                <span className="hidden rounded bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-mist-400 sm:inline">
                  {meta}
                </span>
                <span className="flex w-16 items-center justify-end gap-1 text-right text-[11px] text-amber-signal">
                  <Plug className="h-3 w-3" />
                  未接入
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
