import { useState } from "react";

export interface PositionDetail {
  id: string | number;
  symbol: string;
  underlying: string;
  side: "long" | "short";
  leverage: number;
  marginType: string;
  unrealizedPnl: number;
  roe: number;
  positionValueUsdt: number;
  positionQty: number;
  entryPrice: number;
  markPrice: number;
  liqPrice: number;
}

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

interface AoyingPositionCardProps {
  selectedPosition: PositionDetail;
  onSelectPosition: (pos: PositionDetail) => void;
}

export function AoyingPositionCard({
  selectedPosition,
  onSelectPosition,
}: AoyingPositionCardProps) {
  const [positions] = useState<PositionDetail[]>([DEFAULT_NVDA]);
  const [totalMargin] = useState("+102,757");
  const [realizedPnl] = useState("+0");

  const totalUnrealized = positions.reduce((acc, p) => acc + p.unrealizedPnl, 0);

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
              </div>
              <div className="profile-tags">
                <span className="profile-pill">币安实盘</span>
                <span className="profile-pill">公开快照</span>
              </div>
            </div>
          </div>

          <div className="profile-pnl-summary">
            <span className="metric-label">未实现盈亏</span>
            <span className={`pnl-summary-val ${totalUnrealized >= 0 ? "positive" : "negative"}`}>
              {totalUnrealized >= 0 ? `+${totalUnrealized.toLocaleString()}` : totalUnrealized.toLocaleString()}
            </span>
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

        {/* Selected Position Detailed Card */}
        <div className="active-position-block">
          <div className="position-title-row">
            <span className="position-symbol-title">{selectedPosition.symbol}</span>
            <div className="position-badge-group">
              <span className="position-type-badge">{selectedPosition.marginType}</span>
              <span className="position-type-badge">{selectedPosition.leverage}X</span>
              <span className={`position-side-badge ${selectedPosition.side}`}>
                {selectedPosition.side === "long" ? "多" : "空"}
              </span>
            </div>
          </div>

          {/* Big Unrealized PnL & Return rate */}
          <div className="position-pnl-banner">
            <div className="pnl-banner-col">
              <span className="metric-label">未实现盈亏 (USDT)</span>
              <span className={`banner-pnl-val ${selectedPosition.unrealizedPnl >= 0 ? "positive" : "negative"}`}>
                {selectedPosition.unrealizedPnl >= 0
                  ? `+${selectedPosition.unrealizedPnl.toLocaleString()}`
                  : selectedPosition.unrealizedPnl.toLocaleString()}
              </span>
            </div>
            <div className="pnl-banner-col">
              <span className="metric-label">收益率</span>
              <span className={`banner-pnl-val ${selectedPosition.roe >= 0 ? "positive" : "negative"}`}>
                {selectedPosition.roe >= 0 ? `+${selectedPosition.roe}%` : `${selectedPosition.roe}%`}
              </span>
            </div>
          </div>

          {/* 4 Stats Grid */}
          <div className="position-stats-grid">
            <div className="stat-card">
              <span className="stat-label">持仓数量 (USDT)</span>
              <span className="stat-number">{selectedPosition.positionValueUsdt.toLocaleString()}</span>
              <span className="stat-subtext">≈ {selectedPosition.positionQty.toLocaleString()} {selectedPosition.underlying}</span>
            </div>

            <div className="stat-card">
              <span className="stat-label">开仓均价</span>
              <span className="stat-number">{selectedPosition.entryPrice.toFixed(2)}</span>
            </div>

            <div className="stat-card">
              <span className="stat-label">标记价格</span>
              <span className="stat-number">{selectedPosition.markPrice.toFixed(2)}</span>
            </div>

            <div className="stat-card">
              <span className="stat-label">强平价格</span>
              <span className="stat-number">{selectedPosition.liqPrice.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Position Switcher if multiple positions exist */}
        {positions.length > 1 && (
          <div className="position-switcher-tabs">
            <span className="switcher-label">切换持仓标的:</span>
            <div className="switcher-chips">
              {positions.map((pos) => (
                <button
                  key={pos.id}
                  type="button"
                  className={`switcher-chip ${pos.id === selectedPosition.id ? "active" : ""}`}
                  onClick={() => onSelectPosition(pos)}
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
        点击持仓切换对应 K 线。盈亏按币安标记价格估算。独立数据整理 · 非官方。
      </p>
    </div>
  );
}
