import { useState } from "react";
import {
  type PositionDetail,
  DEMO_NVDA_POSITION,
} from "./tradingTypes";

export type { PositionDetail };

interface AoyingPositionCardProps {
  selectedPosition: PositionDetail | null;
  onSelectPosition?: (pos: PositionDetail) => void;
  isDemoMode?: boolean;
  onToggleDemoMode?: () => void;
}

export function AoyingPositionCard({
  selectedPosition,
  onSelectPosition,
  isDemoMode = false,
  onToggleDemoMode,
}: AoyingPositionCardProps) {
  // If demo mode is active or a position is selected, resolve the active position
  const activePosition: PositionDetail | null =
    selectedPosition || (isDemoMode ? DEMO_NVDA_POSITION : null);

  const [positions] = useState<PositionDetail[]>(
    isDemoMode ? [DEMO_NVDA_POSITION] : []
  );

  const totalMargin = activePosition ? "+102,757" : "--";
  const realizedPnl = activePosition ? "+0" : "--";
  const totalUnrealized = activePosition ? activePosition.unrealizedPnl : null;

  return (
    <div className="position-sidebar-wrapper">
      <div className="aoying-card">
        {/* User profile header */}
        <div className="profile-row">
          <div className="profile-user">
            <div className="avatar-wrapper" aria-hidden="true">
              {/* Cute cartoon avatar matching reference screenshot */}
              <svg viewBox="0 0 100 100" className="avatar-svg">
                <circle cx="50" cy="50" r="48" fill="#ffffff" stroke="#e0ded6" strokeWidth="2" />
                {/* Hair */}
                <path d="M22 45 C20 25, 45 12, 78 28 C82 38, 75 48, 70 45 C65 25, 38 25, 22 45 Z" fill="#222" />
                {/* Eyebrows */}
                <path d="M30 40 Q38 36 44 41" stroke="#222" strokeWidth="3" fill="none" strokeLinecap="round" />
                <path d="M56 41 Q62 36 70 40" stroke="#222" strokeWidth="3" fill="none" strokeLinecap="round" />
                {/* Eyes */}
                <ellipse cx="37" cy="48" rx="4" ry="5.5" fill="#222" />
                <ellipse cx="63" cy="48" rx="4" ry="5.5" fill="#222" />
                <circle cx="35.5" cy="46" r="1.5" fill="#fff" />
                <circle cx="61.5" cy="46" r="1.5" fill="#fff" />
                {/* Cheeks */}
                <ellipse cx="28" cy="56" rx="5" ry="3" fill="#ffb4b4" opacity="0.6" />
                <ellipse cx="72" cy="56" rx="5" ry="3" fill="#ffb4b4" opacity="0.6" />
                {/* Smile */}
                <path d="M43 57 Q50 64 57 57" stroke="#222" strokeWidth="2.5" fill="none" strokeLinecap="round" />
              </svg>
            </div>
            <div className="profile-info">
              <div className="profile-name-row">
                <span className="profile-name">熬鹰</span>
                {isDemoMode && (
                  <span className="demo-indicator-pill">演示样例</span>
                )}
              </div>
              <div className="profile-tags">
                <span className="profile-pill">币安实盘</span>
                <span className="profile-pill">公开快照</span>
              </div>
            </div>
          </div>

          <div className="profile-pnl-summary">
            <span className="metric-label">未实现盈亏</span>
            {totalUnrealized !== null ? (
              <span className={`pnl-summary-val ${totalUnrealized >= 0 ? "positive" : "negative"}`}>
                {totalUnrealized >= 0 ? `+${totalUnrealized.toLocaleString()}` : totalUnrealized.toLocaleString()}
              </span>
            ) : (
              <span className="pnl-summary-val muted">--</span>
            )}
          </div>
        </div>

        {/* Total Margin and Realized PnL row */}
        <div className="summary-metrics-row">
          <div className="metric-col">
            <span className="metric-label">总保证金 (USDT)</span>
            <span className="metric-val">{totalMargin}</span>
          </div>
          <div className="metric-col">
            <span className="metric-label">已实现盈亏 (USDT)</span>
            <span className="metric-val">{realizedPnl}</span>
          </div>
        </div>

        {/* Position Display or Honest Empty State */}
        {activePosition ? (
          <div className="active-position-block">
            {/* Demo Mode Notice Banner inside position */}
            {activePosition.isDemo && (
              <div className="demo-position-header-alert">
                <span>⚑ 演示模式 · 静态参考样例 · 并非当前实盘持仓</span>
              </div>
            )}

            <div className="position-title-row">
              <span className="position-symbol-title">{activePosition.symbol}</span>
              <div className="position-badge-group">
                <span className="position-type-badge">{activePosition.marginType}</span>
                <span className="position-type-badge">{activePosition.leverage}X</span>
                <span className={`position-side-badge ${activePosition.side}`}>
                  {activePosition.side === "long" ? "多" : "空"}
                </span>
              </div>
            </div>

            {/* Big Unrealized PnL & Return rate */}
            <div className="position-pnl-banner">
              <div className="pnl-banner-col">
                <span className="metric-label">未实现盈亏 (USDT)</span>
                <span className={`banner-pnl-val ${activePosition.unrealizedPnl >= 0 ? "positive" : "negative"}`}>
                  {activePosition.unrealizedPnl >= 0
                    ? `+${activePosition.unrealizedPnl.toLocaleString()}`
                    : activePosition.unrealizedPnl.toLocaleString()}
                </span>
              </div>
              <div className="pnl-banner-col">
                <span className="metric-label">收益率</span>
                <span className={`banner-pnl-val ${activePosition.roe >= 0 ? "positive" : "negative"}`}>
                  {activePosition.roe >= 0 ? `+${activePosition.roe}%` : `${activePosition.roe}%`}
                </span>
              </div>
            </div>

            {/* 4 Stats Grid */}
            <div className="position-stats-grid">
              <div className="stat-card">
                <span className="stat-label">持仓数量 (USDT)</span>
                <span className="stat-number">{activePosition.positionValueUsdt.toLocaleString()}</span>
                <span className="stat-subtext">≈ {activePosition.positionQty.toLocaleString()} {activePosition.underlying}</span>
              </div>

              <div className="stat-card">
                <span className="stat-label">开仓均价</span>
                <span className="stat-number">{activePosition.entryPrice.toFixed(2)}</span>
              </div>

              <div className="stat-card">
                <span className="stat-label">标记价格</span>
                <span className="stat-number">{activePosition.markPrice.toFixed(2)}</span>
              </div>

              <div className="stat-card">
                <span className="stat-label">强平价格</span>
                <span className="stat-number">{activePosition.liqPrice.toFixed(2)}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="position-empty-block">
            <div className="empty-icon-wrap" aria-hidden="true">
              📊
            </div>
            <h4 className="empty-title">当前暂无活跃持仓快照</h4>
            <p className="empty-desc">
              Telegram 频道未报送有效开仓信息。点击下方可开启演示模式查看界面布局。
            </p>
            {onToggleDemoMode && (
              <button
                type="button"
                className="demo-mode-btn"
                onClick={onToggleDemoMode}
              >
                开启演示模式（查看布局样例）
              </button>
            )}
          </div>
        )}

        {/* Position Switcher if multiple positions exist */}
        {positions.length > 1 && (
          <div className="position-switcher-tabs">
            <span className="switcher-label">切换持仓标的:</span>
            <div className="switcher-chips">
              {positions.map((pos) => (
                <button
                  key={pos.id}
                  type="button"
                  className={`switcher-chip ${pos.id === activePosition?.id ? "active" : ""}`}
                  onClick={() => onSelectPosition?.(pos)}
                >
                  {pos.underlying} ({pos.side === "long" ? "多" : "空"})
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footnote */}
      <p className="sidebar-footnote">
        {isDemoMode
          ? "当前处于演示模式，展示静态原型样例。不可作为交易与决策依据。"
          : "点击持仓切换对应 K 线。盈亏按币安标记价格估算。独立数据整理 · 非官方。"}
      </p>
    </div>
  );
}
