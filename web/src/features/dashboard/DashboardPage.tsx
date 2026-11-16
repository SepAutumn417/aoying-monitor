import { useCallback, useEffect, useState } from "react";
import { ArrowRight, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";

import { api, type ApiTelegramMessage } from "../../lib/api";
import { useLive } from "../../lib/live";

export function DashboardPage() {
  const live = useLive();
  const [messages, setMessages] = useState<ApiTelegramMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const newestEvent = live.events[0]?.id;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void api.telegramMessages({ limit: 6, chatId: -1002568478710, focus: "important", includeRevisions: true })
      .then((result) => {
        if (!alive) return;
        setMessages(result.messages);
        setError("");
      })
      .catch((reason: unknown) => {
        if (alive) setError(reason instanceof Error ? reason.message : "消息加载失败");
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [refresh, newestEvent]);

  const reload = useCallback(() => setRefresh((value) => value + 1), []);

  return (
    <div className="page-home">
      <div className="page-heading">
        <div>
          <h1>监控总览</h1>
          <p>Telegram 原文与编辑快照 · 只读监控</p>
        </div>
        <button type="button" className="text-link" disabled={loading} onClick={reload}>
          <RefreshCw aria-hidden="true" />刷新消息
        </button>
      </div>
      <div className="overview-layout">
        <section aria-labelledby="important-heading">
          <div className="section-head">
            <h2 id="important-heading">重要消息</h2>
            <Link className="text-link" to="/workspace">进入消息中心 <ArrowRight aria-hidden="true" /></Link>
          </div>
          {error ? <p role="alert">{error} · 请刷新重试，以下内容可能不是最新。</p> : null}
          <div className="important-list">
            {loading ? <p className="muted">正在加载原文…</p> : messages.length ? messages.map((message) => (
              <article className="important-row" key={message.id}>
                <div className="event-content">
                  <div className="event-heading">
                    <h3>{message.sender_name || "未知发送者"}</h3>
                    <span className="event-tag neutral">{message.topic_title || message.dialog_title}</span>
                  </div>
                  <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{message.deleted_at ? "该消息已删除" : message.text || "无文本内容"}</p>
                  <div className="event-meta">
                    <time>{message.posted_at}</time>
                    {message.edited_at ? <span>已编辑</span> : null}
                    {message.media_kind ? <span>含附件 · {message.media_kind}</span> : null}
                  </div>
                  <Link className="text-link" to="/timeline">查看原文与快照 <ArrowRight aria-hidden="true" /></Link>
                </div>
              </article>
            )) : <p className="muted">暂无重点动态，请在消息中心查看全部原文。</p>}
          </div>
        </section>
        <aside className="secondary-column">
          <div className="section-head"><h2>会话</h2></div>
          <div className="session-list">
            <Link className="open-messages" to="/workspace">消息中心 <ArrowRight aria-hidden="true" /></Link>
            <Link className="open-messages" to="/sources">查看采集来源 <ArrowRight aria-hidden="true" /></Link>
            <Link className="open-messages" to="/alerts">消息提醒 <ArrowRight aria-hidden="true" /></Link>
          </div>
          <div className="source-note">
            <h3>关于消息数据</h3>
            <p>仅展示 Telegram 原文与快照，不从消息推导仓位、盈亏或交易生命周期。身份、话题筛选及编辑删除历史请进入消息中心查看。</p>
            <span>只读查看 · 不发送任何指令</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
