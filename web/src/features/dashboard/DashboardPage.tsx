import { useCallback, useEffect, useState } from "react";
import { ArrowRight, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";

import {
  api,
  type ApiTelegramMessage,
  type ApiTelegramStatus,
  type ApiTelegramTopic,
} from "../../lib/api";
import { useLive } from "../../lib/live";
import { AoyingPositionCard, type PositionDetail } from "../trading/AoyingPositionCard";
import { TradingViewChart } from "../trading/TradingViewChart";

const DEFAULT_NVDA: PositionDetail = {
  id: "nvda-1",
  symbol: "NVDA USDT",
  underlying: "NVDA",
  side: "long",
  leverage: 5,
  marginType: "全仓",
  unrealizedPnl: -8058,
  roe: -8,
  positionValueUsdt: 513880,
  positionQty: 3207,
  entryPrice: 162.75,
  markPrice: 160.24,
  liqPrice: 50.57,
};

export function DashboardPage() {
  const live = useLive();
  const [selectedPosition, setSelectedPosition] = useState<PositionDetail>(DEFAULT_NVDA);

  const [messages, setMessages] = useState<ApiTelegramMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [source, setSource] = useState<ApiTelegramStatus | null>(null);
  const [topics, setTopics] = useState<ApiTelegramTopic[]>([]);
  const [sourceLoading, setSourceLoading] = useState(true);
  const [sourceError, setSourceError] = useState("");
  const [showTelegramLog, setShowTelegramLog] = useState(true);

  const newestEvent = live.events[0]?.id;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setSourceLoading(true);

    void Promise.allSettled([
      api.telegramStatus(),
      api.telegramTopics(-1002568478710),
    ]).then(([status, partitions]) => {
      if (!alive) return;
      setSourceLoading(false);
      if (status.status === "fulfilled") setSource(status.value);
      if (partitions.status === "fulfilled") setTopics(partitions.value);
      setSourceError(
        status.status === "rejected" || partitions.status === "rejected"
          ? "来源状态读取失败，请刷新重试。"
          : "",
      );
    });

    void api
      .telegramMessages({
        limit: 6,
        chatId: -1002568478710,
        focus: "important",
        includeRevisions: true,
      })
      .then((result) => {
        if (!alive) return;
        setMessages(result.messages);
        setError("");
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
  }, [refresh, newestEvent]);

  const reload = useCallback(() => setRefresh((value) => value + 1), []);

  return (
    <div className="aoying-home-view page-home">
      {/* Page Title */}
      <div className="page-heading aoying-dashboard-head">
        <div>
          <h1>监控总览</h1>
          <p>Telegram 原文与编辑快照 · 只读监控</p>
        </div>
      </div>

      {/* 1. Main View: Reference image layout (熬鹰持仓 + TradingView K线) */}
      <div className="aoying-main-grid">
        <section className="aoying-grid-left" aria-label="熬鹰持仓快照">
          <AoyingPositionCard
            selectedPosition={selectedPosition}
            onSelectPosition={setSelectedPosition}
          />
        </section>

        <section className="aoying-grid-right" aria-label="K线行情">
          <TradingViewChart
            symbol={`${selectedPosition.underlying} / USDT`}
            entryPrice={selectedPosition.entryPrice}
          />
        </section>
      </div>

      {/* 2. Telegram Source Sync and Original Messages Panel */}
      <div className="telegram-sync-section">
        <div className="sync-section-header">
          <button
            type="button"
            className="sync-toggle-button"
            onClick={() => setShowTelegramLog(!showTelegramLog)}
            aria-expanded={showTelegramLog}
          >
            <span>Telegram 信号与采集同步记录</span>
            {showTelegramLog ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          <button type="button" className="text-link" disabled={loading} onClick={reload}>
            <RefreshCw size={14} aria-hidden="true" />
            刷新记录
          </button>
        </div>

        <div className={`sync-section-body ${showTelegramLog ? "is-expanded" : "is-compact"}`}>
          <div className="monitor-columns">
            {/* Source sync status */}
            <aside className="monitor-source-panel" aria-label="来源与同步">
              <div className="monitor-section-heading">
                <span className="monitor-eyebrow">TELEGRAM</span>
                <h2>会话</h2>
                <p>来源与同步</p>
              </div>
              {sourceError ? (
                <p className="monitor-notice" role="alert">
                  {sourceError}
                </p>
              ) : null}
              <div className="monitor-source-summary">
                <h3>{source?.account?.display_name || source?.account?.label || "Telegram 采集"}</h3>
                <span className="monitor-state">
                  {source
                    ? {
                        running: "采集中",
                        connecting: "连接中",
                        stopped: "已停止",
                        error: "采集异常",
                      }[source.collector.state] ?? source.collector.state
                    : sourceLoading
                      ? "正在读取状态…"
                      : "状态不可用"}
                </span>
                {source ? <p>{source.messages} 条原文 · {source.followed} 个关注会话</p> : null}
                {source?.collector.detail ? <p>{source.collector.detail}</p> : null}
                {source?.account?.last_error ? <p role="alert">{source.account.last_error}</p> : null}
              </div>
              <ul className="monitor-topic-status">
                {topics.map((item) => (
                  <li key={item.id}>
                    <div>
                      <span className="monitor-topic-symbol">#</span>
                      <strong>{item.title}</strong>
                    </div>
                    <p>{item.enabled ? "监控已开启" : "监控已暂停"} · {item.messages} 条</p>
                    <p>
                      {item.last_synced_at ? (
                        <>
                          最近同步{" "}
                          <time dateTime={item.last_synced_at}>
                            {new Date(item.last_synced_at).toLocaleString("zh-CN")}
                          </time>
                        </>
                      ) : (
                        "尚未完成同步"
                      )}
                    </p>
                    {item.last_error ? <p role="alert">{item.last_error}</p> : null}
                  </li>
                ))}
              </ul>
              {!sourceLoading && !topics.length && !sourceError ? (
                <p className="monitor-notice">暂无分区同步记录。</p>
              ) : null}
              <Link className="monitor-panel-link" to="/sources">
                管理数据源 <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </aside>

            {/* Important telegram originals */}
            <section className="monitor-originals" aria-label="重要消息">
              <div className="section-head">
                <h2 id="important-heading">重要消息</h2>
                <Link className="text-link" to="/workspace">
                  打开工作台 <ArrowRight size={14} aria-hidden="true" />
                </Link>
              </div>
              {error ? <p role="alert">{error} · 请刷新重试。</p> : null}
              <div className="important-list monitor-message-list">
                {loading ? (
                  <p className="muted">正在加载原文…</p>
                ) : messages.length ? (
                  messages.map((message) => (
                    <article className="important-row" key={message.id}>
                      <div className="event-content">
                        <div className="event-heading">
                          <h3>{message.sender_name || "未知发送者"}</h3>
                          <span className="event-tag neutral">
                            {message.topic_title || message.dialog_title}
                          </span>
                        </div>
                        <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                          {message.deleted_at ? "该消息已删除" : message.text || "无文本内容"}
                        </p>
                        <div className="event-meta">
                          <time dateTime={message.posted_at}>
                            {new Date(message.posted_at).toLocaleString("zh-CN")}
                          </time>
                          {message.edited_at ? <span>已编辑</span> : null}
                          {message.media_kind ? <span>含附件 · {message.media_kind}</span> : null}
                        </div>
                        <Link className="text-link" to="/timeline">
                          查看原文与快照 <ArrowRight size={14} aria-hidden="true" />
                        </Link>
                      </div>
                    </article>
                  ))
                ) : (
                  <p className="muted">暂无重点动态，请在工作台查看全部原文。</p>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
