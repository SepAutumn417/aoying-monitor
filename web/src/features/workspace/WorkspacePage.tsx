import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Link2, MessageSquare, Search, Wallet } from "lucide-react";

import { ledgerNumber } from "../../components/ui/LedgerView";
import { api, type ApiPosition, type ApiTelegramMessage, type ApiTelegramTopic } from "../../lib/api";
import { useLedger } from "../../lib/ledger";

const ROLE_LABELS: Record<ApiTelegramMessage["sender_role"], string> = {
  owner: "群主",
  signal_bot: "机器人",
  assistant: "助手",
  member: "成员",
};

function clock(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit" });
}

function dayLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未知日期";
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

function unitOf(symbol: string): string {
  return symbol.replace(/(USDT|USDC|BUSD|USD)$/i, "");
}

function sideOf(side: string): string {
  if (side === "long") return "多仓";
  if (side === "short") return "空仓";
  return side || "—";
}

function MessageEntry({ message, symbols }: { message: ApiTelegramMessage; symbols: string[] }) {
  const role = message.sender_role;
  const isBot = role === "signal_bot" || role === "assistant";
  const name = message.sender_name || (isBot ? "策略记录" : "未知发送者");
  const avatar = (isBot ? "策" : name).slice(0, 1);
  const lines = message.text ? message.text.split(/\r?\n/) : [];
  const upper = message.text ? message.text.toUpperCase() : "";
  const linked = symbols.find((symbol) => upper.includes(unitOf(symbol).toUpperCase()));

  return (
    <article className="message-entry" id={`msg-${message.id}`}>
      <div className={isBot ? "avatar author second" : "avatar author"}>{avatar}</div>
      <div className="bubble">
        <span className={isBot ? "author-name second-name" : "author-name"}>
          {name} <span>{ROLE_LABELS[role]}</span>
        </span>
        {message.deleted_at ? (
          <p className="position-state">该消息已撤回</p>
        ) : (
          lines.map((line, index) => <p key={index}>{line || "\u00a0"}</p>)
        )}
        {message.media_kind ? (
          <div className="media-preview">
            <svg viewBox="0 0 300 78" role="img" aria-label="附件位置示意，非真实行情">
              <path className="chart-grid" d="M0 20h300M0 40h300M0 60h300" />
              <path
                className="chart-path"
                d="m6 59 18-8 15 6 17-22 20 7 19-10 18 13 16-19 17 6 20-18 19 9 18-15 17 7 25-7 22 10"
              />
            </svg>
            <span>{message.media_kind} · 附件</span>
          </div>
        ) : null}
        {linked ? (
          <a className="position-reference" href="#positions">
            <Link2 size={16} />
            <span>关联仓位 · {linked}</span>
            <ChevronRight size={16} />
          </a>
        ) : null}
        <div className="message-meta">
          {message.edited_at ? `已编辑 ${clock(message.edited_at)}` : clock(message.posted_at)}
        </div>
      </div>
    </article>
  );
}

function PositionCard({ position }: { position: ApiPosition }) {
  const latest = position.events.length ? position.events[position.events.length - 1] : null;
  const movement = latest ? `${latest.kind} → ${ledgerNumber(latest.qty_after)}` : "持仓数量未变";

  return (
    <article className="position-card" id={`position-${position.id}`}>
      <div className="row">
        <h3>
          {position.symbol} <span className="position-state">{sideOf(position.side)}</span>
        </h3>
        <span className="position-state">{position.status === "open" ? "持有中" : "已平仓"}</span>
      </div>
      <div className="quantity">
        <strong>{ledgerNumber(position.qty_current)}</strong>
        <span>{unitOf(position.symbol)}</span>
      </div>
      <div className="field-row">
        <span>开仓均价</span>
        <strong>{ledgerNumber(position.entry)}</strong>
      </div>
      <div className="field-row">
        <span>最近变动</span>
        <strong>{movement}</strong>
      </div>
      <div className="field-row">
        <span>报送时间</span>
        <span>{clock(latest?.at ?? position.opened_at)}</span>
      </div>
      {position.events.length ? (
        <details className="position-history">
          <summary>
            仓位变化记录
            <ChevronRight size={16} />
          </summary>
          <ol>
            {position.events.slice(-6).map((event) => (
              <li key={event.id}>
                <time>{clock(event.at)}</time>
                {event.kind} · 数量 {ledgerNumber(event.qty_after)}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
      <Link className="source-link" to="/timeline">
        <MessageSquare size={16} />
        <span>查看报送原文</span>
        <ChevronRight size={16} />
      </Link>
    </article>
  );
}

export function WorkspacePage() {
  const { snapshot } = useLedger();
  const [topics, setTopics] = useState<ApiTelegramTopic[]>([]);
  const [messages, setMessages] = useState<ApiTelegramMessage[]>([]);
  const [activeChat, setActiveChat] = useState<number | null>(null);
  const [activeTopic, setActiveTopic] = useState<number | null>(null);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .telegramTopics()
      .then((rows) => {
        if (alive) setTopics(rows);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api
      .telegramMessages({ limit: 120, includeRevisions: true })
      .then((result) => {
        if (!alive) return;
        setMessages(result.messages);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (alive) setError(reason instanceof Error ? reason.message : "消息加载失败");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const ordered = useMemo(
    () =>
      [...messages].sort(
        (left, right) => new Date(left.posted_at).getTime() - new Date(right.posted_at).getTime(),
      ),
    [messages],
  );

  const chats = useMemo(() => {
    const map = new Map<number, { chatId: number; title: string; last: ApiTelegramMessage; count: number }>();
    for (const message of ordered) {
      const entry = map.get(message.chat_id);
      if (!entry) {
        map.set(message.chat_id, {
          chatId: message.chat_id,
          title: message.dialog_title || "未命名会话",
          last: message,
          count: 1,
        });
      } else {
        entry.last = message;
        entry.count += 1;
      }
    }
    return [...map.values()].sort(
      (left, right) => new Date(right.last.posted_at).getTime() - new Date(left.last.posted_at).getTime(),
    );
  }, [ordered]);

  const currentChat = chats.find((chat) => chat.chatId === activeChat) ?? chats[0] ?? null;
  const chatId = currentChat?.chatId ?? null;
  const chatTopics = useMemo(
    () => topics.filter((topic) => (chatId === null ? false : topic.chat_id === chatId)),
    [topics, chatId],
  );
  const currentTopic = chatTopics.find((topic) => topic.topic_id === activeTopic) ?? null;

  const visible = useMemo(() => {
    const needle = keyword.trim().toLowerCase();
    return ordered.filter((message) => {
      if (chatId !== null && message.chat_id !== chatId) return false;
      if (activeTopic !== null && message.topic_id !== activeTopic) return false;
      if (!needle) return true;
      return (
        message.text.toLowerCase().includes(needle) ||
        message.sender_name.toLowerCase().includes(needle) ||
        (message.topic_title ?? "").toLowerCase().includes(needle)
      );
    });
  }, [ordered, chatId, activeTopic, keyword]);

  const groups = useMemo(() => {
    const out: { day: string; items: ApiTelegramMessage[] }[] = [];
    for (const message of visible) {
      const day = dayLabel(message.posted_at);
      const last = out[out.length - 1];
      if (last && last.day === day) last.items.push(message);
      else out.push({ day, items: [message] });
    }
    return out;
  }, [visible]);

  const openPositions = useMemo(
    () => (snapshot?.positions ?? []).filter((position) => position.status === "open"),
    [snapshot],
  );
  const symbols = useMemo(() => openPositions.map((position) => position.symbol), [openPositions]);

  const headerTitle = currentTopic ? currentTopic.title : currentChat ? currentChat.title : "消息中心";
  const headerSubtitle = currentChat
    ? `${currentChat.title} · 只读同步`
    : "尚未同步任何 Telegram 会话";

  return (
    <div className="page-messages">
      <div className="shell">
        <nav className="rail" aria-label="工作区导航">
          <Link className="logo" to="/" aria-label="返回总览">
            熬
          </Link>
          <a className="rail-item active" href="#thread">
            <MessageSquare size={20} />
            <span>聊天</span>
          </a>
          <a className="rail-item" href="#positions">
            <Wallet size={20} />
            <span>仓位</span>
          </a>
          <div className="avatar self">我</div>
        </nav>

        <aside className="conversations" id="workspace">
          <header className="list-head">
            <h1>熬鹰监控</h1>
            <span className="demo">{messages.length ? `${messages.length} 条` : "未同步"}</span>
          </header>

          <div className="search-box">
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                minHeight: 44,
                padding: "8px 12px",
                cursor: "text",
              }}
            >
              <Search size={18} />
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="搜索会话与消息"
                aria-label="搜索会话与消息"
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: "inherit",
                  font: "inherit",
                }}
              />
            </label>
          </div>

          <div className="folder-tabs">
            <a className="selected" href="#all-chats">
              全部
            </a>
            <a href="#all-chats">群组</a>
            <a href="#all-chats">频道</a>
          </div>

          <div className="chats" id="all-chats">
            {chats.length ? (
              chats.map((chat) => {
                const isActive = chat.chatId === chatId;
                const chatTopicRows = topics.filter((topic) => topic.chat_id === chat.chatId);
                return (
                  <Fragment key={chat.chatId}>
                    <button
                      type="button"
                      className={isActive ? "conversation selected" : "conversation"}
                      style={{ textAlign: "left", width: "100%" }}
                      onClick={() => {
                        setActiveChat(chat.chatId);
                        setActiveTopic(null);
                      }}
                    >
                      <div className="avatar group">{chat.title.slice(0, 1)}</div>
                      <div className="conversation-content">
                        <div className="row">
                          <h2>{chat.title}</h2>
                          <time>{clock(chat.last.posted_at)}</time>
                        </div>
                        <p>{(chat.last.text || chat.last.media_kind || "无文本内容").slice(0, 24)}</p>
                        <div className="row tiny">
                          <span>{chatTopicRows.length ? `${chatTopicRows.length} 个话题` : "未同步话题"}</span>
                          <span className="tiny">{chat.count} 条</span>
                        </div>
                      </div>
                    </button>
                    {isActive && chatTopicRows.length ? (
                      <div className="topics">
                        <button
                          type="button"
                          className={activeTopic === null ? "topic active" : "topic"}
                          style={{ width: "100%", textAlign: "left" }}
                          onClick={() => setActiveTopic(null)}
                        >
                          <span className="topic-icon">#</span>
                          <span>全部话题</span>
                          <time>{chat.count} 条</time>
                        </button>
                        {chatTopicRows.map((topic) => (
                          <button
                            key={topic.id}
                            type="button"
                            className={activeTopic === topic.topic_id ? "topic active" : "topic"}
                            style={{ width: "100%", textAlign: "left" }}
                            onClick={() => setActiveTopic(topic.topic_id)}
                          >
                            <span className="topic-icon">#</span>
                            <span>{topic.title || `话题 ${topic.topic_id}`}</span>
                            <time>{topic.messages} 条</time>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </Fragment>
                );
              })
            ) : (
              <p className="position-state" style={{ padding: "12px 16px", whiteSpace: "normal", lineHeight: 1.6 }}>
                暂无同步会话，请先在数据源页面启动 Telegram 采集。
              </p>
            )}
          </div>

          <footer className="list-foot">
            <span className="offline-dot" />
            {messages.length ? "只读同步 · 不发送任何消息" : "未连接 Telegram"}
          </footer>
        </aside>

        <main className="thread" id="thread">
          <header className="thread-head">
            <div className="avatar small group">#</div>
            <div>
              <h2>
                {headerTitle}
                {currentTopic ? <span className="thread-label">话题</span> : null}
              </h2>
              <p>{headerSubtitle}</p>
            </div>
            <a className="icon-button head-search" href="#workspace" aria-label="搜索会话与消息">
              <Search size={18} />
            </a>
            <a className="icon-button mobile-positions" href="#positions" aria-label="查看仓位">
              <Wallet size={18} />
            </a>
          </header>

          <div className="message-scroll">
            {error ? (
              <p className="position-state">{error}</p>
            ) : loading ? (
              <p className="position-state">正在加载消息…</p>
            ) : groups.length ? (
              groups.map((group) => (
                <Fragment key={group.day}>
                  <div className="date-separator">
                    <span>{group.day}</span>
                  </div>
                  {group.items.map((message) => (
                    <MessageEntry key={message.id} message={message} symbols={symbols} />
                  ))}
                </Fragment>
              ))
            ) : (
              <p className="position-state">该会话暂无消息记录。</p>
            )}
          </div>
        </main>

        <aside className="position-panel" id="positions">
          <header className="panel-head">
            <div>
              <h2>
                当前仓位 <span className="count">{openPositions.length}</span>
              </h2>
              <p>来自 Telegram 报送</p>
            </div>
            <span className="read-only">只读</span>
          </header>
          <div className="position-scroll">
            <div className="panel-notice">
              按最新报送展示
              <br />
              不代表交易所实时持仓。
            </div>
            {openPositions.length ? (
              openPositions.map((position) => <PositionCard key={position.id} position={position} />)
            ) : (
              <p className="position-state">本次快照内暂无未平仓记录。</p>
            )}
            <p className="source-detail">
              报送来源
              <br />
              <strong>{headerSubtitle}</strong>
              <br />
              未提供的行情、保证金和强平价不展示。
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
