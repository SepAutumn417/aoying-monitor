/**
 * 示例数据：仅用于确认信息架构与视觉密度，全部标为「示例数据」。
 * 接入真实来源后整份文件删除，页面改为从 /api 拉取。
 */

export type Venue = "币安" | "OKX" | "fomo";

export type DemoPosition = {
  id: string;
  venue: Venue;
  symbol: string;
  side: "多" | "空" | "现货";
  leverage?: number;
  notional: number;
  entry: number;
  mark: number;
  pnlPct: number;
  confidence: "高" | "中" | "推断";
  updated: string;
};

export const demoPositions: DemoPosition[] = [
  {
    id: "p1",
    venue: "币安",
    symbol: "BTCUSDT",
    side: "多",
    leverage: 5,
    notional: 412000,
    entry: 68420,
    mark: 69850,
    pnlPct: 2.09,
    confidence: "推断",
    updated: "2 分钟前",
  },
  {
    id: "p2",
    venue: "OKX",
    symbol: "ETHUSDT",
    side: "多",
    leverage: 3,
    notional: 286500,
    entry: 3420.5,
    mark: 3512.8,
    pnlPct: 2.7,
    confidence: "高",
    updated: "刚刚",
  },
  {
    id: "p3",
    venue: "OKX",
    symbol: "SOLUSDT",
    side: "空",
    leverage: 2,
    notional: 95200,
    entry: 182.4,
    mark: 178.9,
    pnlPct: 1.92,
    confidence: "高",
    updated: "刚刚",
  },
  {
    id: "p4",
    venue: "fomo",
    symbol: "WIF",
    side: "现货",
    notional: 48300,
    entry: 2.41,
    mark: 2.58,
    pnlPct: 7.05,
    confidence: "推断",
    updated: "40 秒前",
  },
  {
    id: "p5",
    venue: "币安",
    symbol: "DOGEUSDT",
    side: "多",
    leverage: 10,
    notional: 21800,
    entry: 0.382,
    mark: 0.371,
    pnlPct: -2.88,
    confidence: "推断",
    updated: "6 分钟前",
  },
  {
    id: "p6",
    venue: "OKX",
    symbol: "ARBUSDT",
    side: "多",
    leverage: 5,
    notional: 33400,
    entry: 1.08,
    mark: 1.12,
    pnlPct: 3.7,
    confidence: "高",
    updated: "刚刚",
  },
  {
    id: "p7",
    venue: "fomo",
    symbol: "JUP",
    side: "现货",
    notional: 17600,
    entry: 0.92,
    mark: 0.95,
    pnlPct: 3.26,
    confidence: "推断",
    updated: "1 分钟前",
  },
];

export type DemoChange = {
  id: string;
  time: string;
  action: "新开" | "加仓" | "减仓" | "平仓";
  venue: Venue;
  symbol: string;
  detail: string;
  amount: string;
};

export const demoChanges: DemoChange[] = [
  {
    id: "c1",
    time: "09:41",
    action: "加仓",
    venue: "OKX",
    symbol: "ETHUSDT",
    detail: "多单名义 +18%",
    amount: "$286.5K",
  },
  {
    id: "c2",
    time: "09:38",
    action: "新开",
    venue: "fomo",
    symbol: "WIF",
    detail: "链上买入现货",
    amount: "$48.3K",
  },
  {
    id: "c3",
    time: "09:27",
    action: "减仓",
    venue: "币安",
    symbol: "BTCUSDT",
    detail: "多单 -12%，锁盈",
    amount: "$412.0K",
  },
  {
    id: "c4",
    time: "09:15",
    action: "平仓",
    venue: "OKX",
    symbol: "TIAUSDT",
    detail: "空单全平，已实现 +$2,140",
    amount: "+$2.1K",
  },
  {
    id: "c5",
    time: "08:58",
    action: "加仓",
    venue: "OKX",
    symbol: "SOLUSDT",
    detail: "空单名义 +25%",
    amount: "$95.2K",
  },
];

export type DemoStatement = {
  id: string;
  source: "TG" | "X";
  channel: string;
  time: string;
  text: string;
  tags: string[];
  kind: "观点" | "仓位" | "互动";
};

export const demoStatements: DemoStatement[] = [
  {
    id: "s1",
    source: "TG",
    channel: "熬鹰·主频道",
    time: "09:43",
    text: "ETH 这里 3510 上方站住就继续拿，跌破 3420 减半仓。",
    tags: ["ETH", "观点"],
    kind: "观点",
  },
  {
    id: "s2",
    source: "X",
    channel: "@thankUcrypto_",
    time: "09:31",
    text: "BTC 日线还在上升通道里，别在 70k 附近追高，回踩 68.4 才是我的位置。",
    tags: ["BTC", "观点"],
    kind: "观点",
  },
  {
    id: "s3",
    source: "TG",
    channel: "仓位同步",
    time: "09:27",
    text: "减 BTC 多单 12%，先把这波利润锁一部分。",
    tags: ["BTC", "减仓"],
    kind: "仓位",
  },
  {
    id: "s4",
    source: "TG",
    channel: "粉丝互动",
    time: "09:12",
    text: "SOL 空单止损放在 187.5，别自己乱动，我平的时候会同步。",
    tags: ["SOL", "互动"],
    kind: "互动",
  },
  {
    id: "s5",
    source: "X",
    channel: "@thankUcrypto_",
    time: "08:54",
    text: "WIF 这个位置我加了点现货，只做短线，不碰合约。",
    tags: ["WIF", "观点"],
    kind: "观点",
  },
];

export type DemoAlert = {
  id: string;
  time: string;
  level: "高" | "中" | "低";
  title: string;
  detail: string;
  channel: string;
  state: "已确认" | "已送达" | "待确认";
};

export const demoAlerts: DemoAlert[] = [
  {
    id: "a1",
    time: "09:41",
    level: "高",
    title: "OKX ETHUSDT 加仓",
    detail: "多单名义从 $242.8K 增至 $286.5K（+18%）",
    channel: "Android",
    state: "已确认",
  },
  {
    id: "a2",
    time: "09:38",
    level: "高",
    title: "fomo 新开仓 WIF",
    detail: "链上买入 $48.3K，钱包 7xK…9fQ",
    channel: "Android",
    state: "已送达",
  },
  {
    id: "a3",
    time: "09:27",
    level: "中",
    title: "币安 BTCUSDT 减仓",
    detail: "TG 消息推断：多单减 12%",
    channel: "Android",
    state: "已确认",
  },
  {
    id: "a4",
    time: "09:15",
    level: "中",
    title: "OKX TIAUSDT 平仓",
    detail: "空单全平，已实现 +$2,140",
    channel: "邮件",
    state: "已送达",
  },
  {
    id: "a5",
    time: "08:58",
    level: "低",
    title: "OKX SOLUSDT 加仓",
    detail: "空单名义 +25%，未达高优先级阈值",
    channel: "站内",
    state: "待确认",
  },
];

export const demoWatchlist = [
  { symbol: "BTC", price: "69,850", change: 1.82 },
  { symbol: "ETH", price: "3,512.8", change: 2.41 },
  { symbol: "SOL", price: "178.9", change: -0.94 },
  { symbol: "WIF", price: "2.58", change: 6.2 },
];

const totalNotional = demoPositions.reduce((sum, p) => sum + p.notional, 0);

/** 未实现盈亏：按各仓位的名义价值与涨跌幅加权估算。 */
const unrealized = demoPositions.reduce(
  (sum, p) => sum + (p.notional * p.pnlPct) / 100 / (p.leverage ?? 1),
  0,
);

export const demoKpis = {
  notional: totalNotional,
  unrealized,
  unrealizedPct: (unrealized / totalNotional) * 100,
  realizedToday: 8640,
  openPositions: demoPositions.length,
  changesToday: 12,
  updatedAt: "12 秒前",
};

/** 按场所汇总名义价值，用于占比条。 */
export const demoAllocation = (["币安", "OKX", "fomo"] as Venue[]).map((venue) => {
  const value = demoPositions
    .filter((p) => p.venue === venue)
    .reduce((sum, p) => sum + p.notional, 0);
  return {
    venue,
    value,
    share: value / totalNotional,
    count: demoPositions.filter((p) => p.venue === venue).length,
  };
});
