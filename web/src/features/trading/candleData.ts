export interface Candle {
  time: number; // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface VolumeBar {
  time: number;
  value: number;
  color: string;
}

export interface ChartMarker {
  time: number;
  position: "aboveBar" | "belowBar" | "inBar";
  color: string;
  shape: "circle" | "square" | "arrowUp" | "arrowDown";
  text: string;
  size?: number;
}

export interface CandleDataResult {
  candles: Candle[];
  volume: VolumeBar[];
  markers: ChartMarker[];
  ohlc: { open: number; high: number; low: number; close: number };
  isDemo: boolean;
  dataTimestamp: string;
}

/**
 * Deterministic reference price curve matching the reference layout screenshot.
 * Fixed deterministic data points without Math.random() or drifting random walks.
 */
const REFERENCE_POINTS: Array<[number, number, number, number, number]> = [
  // [open, high, low, close, volume]
  [165.20, 165.60, 164.80, 165.10, 24500],
  [165.10, 165.45, 164.90, 165.35, 28000],
  [165.35, 165.80, 165.10, 165.60, 31200],
  [165.60, 165.90, 165.20, 165.40, 22100],
  [165.40, 165.70, 164.85, 164.95, 34000],
  [164.95, 165.20, 164.50, 164.60, 29800],
  [164.60, 164.85, 164.10, 164.30, 36500],
  [164.30, 164.60, 163.80, 163.95, 41200],
  [163.95, 164.20, 163.50, 163.70, 38900],
  [163.70, 164.10, 163.30, 163.50, 27400],
  [163.50, 163.80, 162.90, 163.10, 48900],
  [163.10, 163.40, 162.50, 162.65, 52100],
  [162.65, 162.90, 161.80, 162.00, 68000],
  [162.00, 162.30, 161.10, 161.35, 74200],
  [161.35, 161.60, 160.50, 160.80, 89500],
  [160.80, 161.20, 160.03, 160.25, 96000],
  [160.25, 161.50, 160.10, 161.40, 82400],
  [161.40, 162.30, 161.20, 162.10, 61500],
  [162.10, 162.80, 161.90, 162.60, 54200],
  [162.60, 163.07, 162.30, 162.85, 49800],
  [162.85, 163.00, 162.40, 162.50, 38100],
  [162.50, 162.70, 161.90, 162.10, 33500],
  [162.10, 162.35, 161.60, 161.80, 29000],
  [161.80, 162.05, 161.30, 161.55, 31400],
  [161.55, 161.90, 161.10, 161.30, 26800],
  [161.30, 161.65, 160.90, 161.05, 30200],
  [161.05, 161.40, 160.70, 160.85, 28700],
  [160.85, 161.15, 160.40, 160.60, 35100],
  [160.60, 160.90, 160.15, 160.35, 42300],
  [160.35, 160.65, 160.05, 160.28, 51600],
];

// Fixed reference base timestamp: 2026-11-16 13:56:55 (Unix: 1794837415)
const BASE_TIMESTAMP = 1794837415;

/**
 * Returns deterministic reference candle data.
 * Pure and repeatable: no Math.random(), no drifting random walk.
 */
export function getCandlesForInterval(interval: string): CandleDataResult {
  const stepSec =
    interval === "1 分钟" ? 60
    : interval === "5 分钟" ? 300
    : interval === "15 分钟" ? 900
    : interval === "30 分钟" ? 1800
    : interval === "1 小时" ? 3600
    : 14400;

  const count = REFERENCE_POINTS.length;
  const startSec = BASE_TIMESTAMP - count * stepSec;

  const candles: Candle[] = [];
  const volume: VolumeBar[] = [];

  for (let i = 0; i < count; i++) {
    const [open, high, low, close, volVal] = REFERENCE_POINTS[i];
    const time = startSec + i * stepSec;

    candles.push({ time, open, high, low, close });

    const isUp = close >= open;
    volume.push({
      time,
      value: volVal,
      color: isUp ? "rgba(8, 153, 129, 0.35)" : "rgba(242, 54, 69, 0.35)",
    });
  }

  const markers: ChartMarker[] = [
    {
      time: candles[Math.max(0, count - 3)]?.time ?? BASE_TIMESTAMP - 900,
      position: "belowBar",
      color: "#1d9bf0",
      shape: "circle",
      text: "𝕏 6",
      size: 1,
    },
  ];

  return {
    candles,
    volume,
    markers,
    ohlc: {
      open: 160.03,
      high: 163.07,
      low: 161.53,
      close: 161.64,
    },
    isDemo: true,
    dataTimestamp: "2026-11-16 13:56:55",
  };
}
