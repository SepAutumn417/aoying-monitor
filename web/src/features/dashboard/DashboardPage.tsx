import { useEffect, useState } from "react";
import { ArrowRight, ChevronRight, MessageSquare } from "lucide-react";
import { Link } from "react-router-dom";

import { LedgerNotice, LedgerRefresh, ledgerNumber, ledgerTime } from "../../components/ui/LedgerView";
import { api, type ApiPosition, type ApiTelegramTopic } from "../../lib/api";
import { useLedger } from "../../lib/ledger";

/** 报送时间只显示时分，日期已经在卡片上方的快照说明里。 */
function clock(iso: string | null | undefined) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit" });
}

function unitOf(symbol: string) {
  return symbol.replace(/(USDT|USDC|BUSD|USD)$/i, "");
}

function sideLabel(side: string) {
  if (side === "long") return { text: "多仓", tone: "long" };
  if (side === "short") return { text: "空仓", tone: "short" };
  return { text: side || "—", tone: "" };
}

const STATUS_LABELS: Record<string, string> = {
  open: "持有中",
  closed: "已平仓",
};

function PositionCard({ position }: { position: ApiPosition }) {
  const side = sideLabel(position.side);
  const events = position.events.slice(-4);
  const latest = position.events[position.events.length - 1];
  const movement = latest
    ? `${latest.kind} → ${ledgerNumber(latest.qty_after)}`
    : "持仓数量未变";

  return (
    <article className="position-card" id={`position-${position.id}`}>
      <div className="card-heading">
        <h3>
          {position.symbol} <span className={`direction ${side.tone}`}>{side.text}</span>
        </h3>
        <span className="muted">{STATUS_LABELS[position.status] ?? position.status}</span>
      </div>
      <div className="quantity">
        <strong>{ledgerNumber(position.qty_current)}</strong>
        <span>{unitOf(position.symbol)}</span>
      </div>
      <div className="position-fields">
        <div>
          <span>开仓均价</span>
          <strong>{ledgerNumber(position.entry)}</strong>
        </div>
        <div>
          <span>最近变动</span>
          <strong>{movement}</strong>
        </div>
        <div>
          <span>报送时间</span>
          <time>{clock(position.opened_at)}</time>
        </div>
      </div>
      <details className="position-history">
        <summary>
          仓位变化记录
          <ChevronRight aria-hidden="true" />
        </summary>
        {events.length ? (
          <ol>
            {events.map((event) => (
              <li key={event.id}>
                <time>{clock(event.at)}</time>
                {event.kind} · 数量 {ledgerNumber(event.qty_after)}
              </li>
            ))}
          </ol>
        ) : (
          <ol>
            <li>暂无仓位变化事件</li>
          </ol>
        )}
      </details>
      <Link className="source-link" to="/timeline">
        <MessageSquare aria-hidden="true" />
        <span>查看报送原文</span>
        <ArrowRight aria-hidden="true" />
      </Link>
    </article>
  );
}

export function DashboardPage() {
  const { snapshot, loading } = useLedger();
  const [topics, setTopics] = useState<ApiTelegramTopic[]>([]);

  useEffect(() => {
    let alive = true;
    // 话题清单只用于右侧「会话」摘要，接口不可用时静默降级，不阻塞账本。
    api
      .telegramTopics()
      .then((rows) => {
        if (alive) setTopics(rows.slice(0, 4));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const open = snapshot?.positions.filter((position) => position.status === "open") ?? [];
  const signals = snapshot?.signals.slice(0, 4) ?? [];

  return (
    <div className="page-home">
      <div className="page-heading">
        <div>
          <h1>监控总览</h1>
          <p>交易员报送记录 · 只读监控 · 最后同步 {ledgerTime(snapshot?.fetchedAt)}</p>
        </div>
        <LedgerRefresh />
      </div>

      <LedgerNotice />

      <div className="overview-layout">
        <div className="primary-column">
          <section id="positions" aria-labelledby="position-heading">
            <div className="section-head">
              <h2 id="position-heading">
                当前仓位 <span className="section-count">{open.length}</span>
              </h2>
              <span className="muted">按最新报送整理</span>
            </div>
            {open.length ? (
              <div className="positions-grid">
                {open.map((position) => (
                  <PositionCard key={position.id} position={position} />
                ))}
              </div>
            ) : (
              <p className="muted">{loading && !snapshot ? "正在加载账本…" : "本次快照内暂无未平仓记录"}</p>
            )}
          </section>

          <section className="important-section" aria-labelledby="important-heading">
            <div className="section-head">
              <h2 id="important-heading">重要消息</h2>
              <Link className="text-link" to="/timeline">
                全部消息 <ArrowRight aria-hidden="true" />
              </Link>
            </div>
            <div className="important-list">
              {signals.length ? (
                signals.map((signal) => (
                  <Link className="important-row" key={signal.id} to="/timeline">
                    <div className="event-symbol">{unitOf(signal.symbol).slice(0, 1) || "报"}</div>
                    <div className="event-content">
                      <div className="event-heading">
                        <h3>
                          {signal.action || signal.kind} {signal.symbol}
                        </h3>
                        <span className="event-tag neutral">报送信号</span>
                      </div>
                      <p>
                        数量 {ledgerNumber(signal.qty_after)} · 开仓均价 {ledgerNumber(signal.entry)} · 标记价{" "}
                        {ledgerNumber(signal.mark)}
                      </p>
                      <div className="event-meta">
                        <span>熬鹰书友会</span>
                        <span>·</span>
                        <time>{clock(signal.posted_at)}</time>
                      </div>
                    </div>
                    <ChevronRight aria-hidden="true" />
                  </Link>
                ))
              ) : (
                <p className="muted">暂无报送信号，等待交易员发送新的仓位报送。</p>
              )}
            </div>
          </section>
        </div>

        <aside className="secondary-column" aria-labelledby="sessions-heading">
          <div className="section-head">
            <h2 id="sessions-heading">会话</h2>
            <span className="muted">{topics.length ? `${topics.length} 个话题` : "未同步"}</span>
          </div>
          <div className="session-list">
            <div className="session-row">
              <span className="session-avatar">熬</span>
              <div>
                <h3>熬鹰书友会</h3>
                <p>Telegram 群组 · 只读同步</p>
              </div>
            </div>
            <div className="topic-list">
              {topics.length ? (
                topics.map((topic) => (
                  <Link key={topic.id} to="/timeline">
                    <span>#</span>
                    <span>{topic.title}</span>
                    <time>{topic.messages ? `${topic.messages} 条` : "未同步"}</time>
                  </Link>
                ))
              ) : (
                <Link to="/sources">
                  <span>#</span>
                  <span>尚未同步话题</span>
                  <ChevronRight aria-hidden="true" />
                </Link>
              )}
            </div>
            <Link className="open-messages" to="/timeline">
              进入消息中心
              <ArrowRight aria-hidden="true" />
            </Link>
          </div>

          <div className="source-note">
            <h3>关于仓位数据</h3>
            <p>
              以上仓位来自 Telegram 交易员报送记录，按消息时间顺序整理；未提供的保证金、强平价与实时行情不做推算，
              数值口径以报送原文为准。
            </p>
            <span>只读查看 · 不发送任何指令</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
