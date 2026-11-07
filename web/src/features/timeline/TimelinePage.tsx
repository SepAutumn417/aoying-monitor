import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, MessageSquare, RefreshCw, Search } from "lucide-react";

import { PageHeader } from "../../components/ui/PageHeader";
import {
  api,
  ApiError,
  type ApiTelegramDialog,
  type ApiTelegramMessage,
  type ApiTelegramTopic,
  type TelegramFocus,
} from "../../lib/api";
import { useLive } from "../../lib/live";

/** Telegram truncates edits; the badge tells the operator the text may have moved. */
function timeLabel(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} 天前`;
  return date.toLocaleDateString("zh-CN");
}

type KindFilter = "all" | "media" | "edited" | "deleted";
type RangeFilter = "today" | "7d" | "all";

const KIND_LABELS: Record<KindFilter, string> = {
  all: "全部",
  media: "含媒体",
  edited: "已编辑",
  deleted: "已删除",
};

const RANGE_LABELS: Record<RangeFilter, string> = {
  today: "今日",
  "7d": "近 7 天",
  all: "全部时间",
};

const FOCUS_LABELS: Record<TelegramFocus, string> = {
  important: "重点动态",
  owner: "本人发言",
  all: "全部原文",
};
const ROLE_LABELS: Record<ApiTelegramMessage["sender_role"], string> = {
  owner: "熬鹰本人",
  signal_bot: "交易机器人报告",
  assistant: "助理",
  member: "群友",
};
const TARGET_CHAT_ID = -1002568478710;

const chipClass = (active: boolean) =>
  `rounded-lg border px-2.5 py-1.5 text-xs transition ${
    active
      ? "border-signal-400/30 bg-signal-400/10 text-signal-300"
      : "border-mist-400/15 bg-white/[0.02] text-mist-200 hover:border-mist-400/30"
  }`;

export function TimelinePage() {
  const live = useLive();
  const [messages, setMessages] = useState<ApiTelegramMessage[]>([]);
  const [dialogs, setDialogs] = useState<ApiTelegramDialog[]>([]);
  const [topics, setTopics] = useState<ApiTelegramTopic[]>([]);
  const [topic, setTopic] = useState<number | null>(null);
  const [focus, setFocus] = useState<TelegramFocus>("important");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [keyword, setKeyword] = useState("");
  const [chat, setChat] = useState<number | null>(null);
  const [kind, setKind] = useState<KindFilter>("all");
  const [range, setRange] = useState<RangeFilter>("all");
  const [expanded, setExpanded] = useState<number[]>([]);

  const since = useMemo(() => {
    if (range === "all") return undefined;
    const start = new Date();
    if (range === "today") {
      start.setHours(0, 0, 0, 0);
    } else {
      start.setDate(start.getDate() - 7);
    }
    return start.toISOString();
  }, [range]);

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await api.telegramMessages({
        limit: 100,
        chatId: chat ?? TARGET_CHAT_ID,
        topicId: topic ?? undefined,
        focus,
        kind: kind === "all" ? undefined : kind,
        since,
        // The whole point of the edit archive: the operator can see what the
        // message said before it was rewritten.
        includeRevisions: true,
      });
      setMessages(data.messages);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "读取消息失败");
    } finally {
      setLoading(false);
    }
  }, [chat, topic, focus, kind, since]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    // Followed chats are the source filter; deriving it from the loaded rows
    // would make the chip list shrink as soon as a filter hides a chat.
    void api
      .telegramDialogs()
      .then((list) => setDialogs(list.filter((item) => item.enabled)))
      .catch(() => setDialogs([]));
    void api.telegramTopics(TARGET_CHAT_ID).then(setTopics).catch(() => setTopics([]));
  }, []);

  // A new Telegram message arrives over the socket; reload so edits and
  // deletions stay consistent instead of patching the list in two places.
  useEffect(() => {
    if (live.events.length === 0) return;
    void load();
    // Only the newest event matters as a trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.events[0]?.id]);

  const rows = useMemo(() => {
    const term = keyword.trim();
    if (!term) return messages;
    return messages.filter(
      (message) =>
        message.text.includes(term) ||
        message.sender_name.includes(term) ||
        message.dialog_title.includes(term),
    );
  }, [messages, keyword]);

  const toggleExpanded = (id: number) =>
    setExpanded((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );

  return (
    <div>
      <PageHeader
        title="发言"
        meta={`${rows.length} 条 · 实时来自 Telegram · ${live.status === "live" ? "已连接" : "未连接"}`}
        action={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-lg border border-mist-400/15 bg-black/20 px-3 py-1.5">
              <Search className="h-3.5 w-3.5 text-mist-400" />
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                className="w-38 bg-transparent text-xs text-mist-200 outline-none placeholder:text-mist-400/60"
                placeholder="搜索原文或发送者"
                aria-label="搜索发言"
              />
            </div>
            <button
              type="button"
              onClick={() => void load()}
              className="flex items-center gap-1.5 rounded-lg border border-mist-400/15 bg-white/[0.02] px-2.5 py-1.5 text-xs text-mist-200 hover:border-mist-400/30"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              刷新
            </button>
          </div>
        }
      />

      <div className="mb-2 flex flex-wrap gap-1.5">
        <button type="button" onClick={() => setChat(null)} className={chipClass(chat === null)}>
          全部会话
        </button>
        {dialogs.map((dialog) => (
          <button
            key={dialog.id}
            type="button"
            onClick={() => setChat(dialog.chat_id)}
            className={chipClass(chat === dialog.chat_id)}
          >
            {dialog.title}
          </button>
        ))}
      </div>

      <div className="mb-2 flex flex-wrap gap-1.5" aria-label="分区筛选">
        <button type="button" aria-pressed={topic === null} onClick={() => setTopic(null)} className={chipClass(topic === null)}>全部分区</button>
        {topics.filter((item) => item.enabled).map((item) => (
          <button key={item.id} type="button" aria-pressed={topic === item.topic_id} onClick={() => setTopic(item.topic_id)} className={chipClass(topic === item.topic_id)}>{item.title}</button>
        ))}
      </div>
      <div className="mb-2 flex flex-wrap gap-1.5" aria-label="关注内容">
        {(Object.keys(FOCUS_LABELS) as TelegramFocus[]).map((value) => (
          <button key={value} type="button" aria-pressed={focus === value} onClick={() => setFocus(value)} className={chipClass(focus === value)}>{FOCUS_LABELS[value]}</button>
        ))}
      </div>
      <p className="mb-3 text-xs text-mist-400">
        当前：{FOCUS_LABELS[focus]} · {topic === null ? "全部分区" : topics.find((item) => item.topic_id === topic)?.title || "所选分区"}。
        {focus === "important" ? "仅显示交易区机器人报告、禁言群和聊天群的熬鹰本人发言；消息通知默认不纳入。" : focus === "owner" ? "按固定账号识别本人，不按昵称匹配。" : "包含群友和事务消息，不代表熬鹰观点或交易。"}
      </p>
      <div className="mb-3 flex flex-wrap items-center gap-4">
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(KIND_LABELS) as KindFilter[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setKind(value)}
              className={chipClass(kind === value)}
            >
              {KIND_LABELS[value]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(RANGE_LABELS) as RangeFilter[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setRange(value)}
              className={chipClass(range === value)}
            >
              {RANGE_LABELS[value]}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p className="mb-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      ) : null}

      <section className="panel overflow-hidden rounded-xl">
        {loading ? (
          <div className="flex items-center justify-center gap-2 px-4 py-12 text-sm text-mist-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在读取消息
          </div>
        ) : (
          <ul className="divide-y divide-mist-400/[0.07]">
            {rows.map((message) => {
              const open = expanded.includes(message.id);
              const hasHistory = message.revisions.length > 0;
              return (
                <li key={message.id} className="px-4 py-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="grid h-5 w-5 place-items-center rounded bg-mist-400/15">
                      <MessageSquare className="h-3 w-3 text-mist-200" />
                    </span>
                    <span className="text-xs text-mist-200">{message.topic_title || "未分类"}</span>
                    <span className="rounded border border-mist-400/15 px-1.5 py-0.5 text-[10px] text-mist-200">
                      {ROLE_LABELS[message.sender_role] || "身份未识别"}
                    </span>
                    <span className="text-[11px] text-mist-400">
                      {message.sender_name || "未知发送者"}
                    </span>
                    <span className="font-mono text-[11px] text-mist-400">
                      {timeLabel(message.posted_at)}
                    </span>
                    {message.edited_at ? (
                      <span className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-amber-signal">
                        已编辑
                      </span>
                    ) : null}
                    {message.deleted_at ? (
                      <span className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-danger">
                        已删除
                      </span>
                    ) : null}
                    {message.media_kind ? (
                      <span className="rounded bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-mist-400">
                        {message.media_kind}
                      </span>
                    ) : null}
                    <span className="ml-auto font-mono text-[10px] text-mist-400">
                      #{message.message_id}
                    </span>
                  </div>

                  {hasHistory ? (
                    <button
                      type="button"
                      onClick={() => toggleExpanded(message.id)}
                      className="mt-2 flex items-center gap-1 text-[11px] text-amber-signal hover:text-amber-signal/80"
                    >
                      {open ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                      {open ? "收起历史版本" : `查看历史版本（${message.revisions.length}）`}
                    </button>
                  ) : null}

                  {open ? (
                    <div className="mt-2 space-y-2">
                      {message.revisions.map((revision, index) => (
                        <div
                          key={revision.replaced_at}
                          className="rounded-lg border border-mist-400/10 bg-black/20 px-3 py-2"
                        >
                          <p className="text-[10px] text-mist-400">
                            第 {index + 1} 版 · {timeLabel(revision.replaced_at)}被替换
                          </p>
                          <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-mist-400">
                            {revision.text || "（无文字内容）"}
                          </p>
                        </div>
                      ))}
                      <p className="text-[10px] text-signal-300">当前版本</p>
                    </div>
                  ) : null}

                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-mist-200">
                    {message.text || "（无文字内容）"}
                  </p>
                </li>
              );
            })}
            {rows.length === 0 ? (
              <li className="px-4 py-12 text-center text-sm text-mist-400">
                当前筛选下没有消息。可切换「全部原文」或其他分区、时间范围；若仍为空，请到「数据源」检查四区同步状态。
              </li>
            ) : null}
          </ul>
        )}
      </section>
    </div>
  );
}
