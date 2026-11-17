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
  isDemo?: boolean;
}

export type MarketFeedStatus = "live" | "delayed" | "disconnected" | "demo";

export interface MarketStatusConfig {
  status: MarketFeedStatus;
  label: string;
  tone: "green" | "yellow" | "gray" | "amber";
  description: string;
}

export const MARKET_STATUS_CONFIGS: Record<MarketFeedStatus, MarketStatusConfig> = {
  live: {
    status: "live",
    label: "实时行情",
    tone: "green",
    description: "已连接行情源，实时推流中",
  },
  delayed: {
    status: "delayed",
    label: "延迟行情",
    tone: "yellow",
    description: "行情数据存在延迟（>15分钟）",
  },
  disconnected: {
    status: "disconnected",
    label: "行情源未连接",
    tone: "gray",
    description: "未连接外部行情源或交易所 API",
  },
  demo: {
    status: "demo",
    label: "演示模式 · 模拟走势",
    tone: "amber",
    description: "静态原型走势，不可用于交易决策",
  },
};

/** Single authoritative reference snapshot matching the design screenshot */
export const DEMO_NVDA_POSITION: PositionDetail = {
  id: "demo-nvda-reference",
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
  isDemo: true,
};
