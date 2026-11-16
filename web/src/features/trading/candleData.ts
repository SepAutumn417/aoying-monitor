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

/** Generate realistic candlestick data around the NVDA chart from reference image */
export function getCandlesForInterval(interval: string): {
  candles: Candle[];
  volume: VolumeBar[];
  markers: ChartMarker[];
  ohlc: { open: number; high: number; low: number; close: number };
} {
  const count = interval === "1 分钟" ? 120 : interval === "5 分钟" ? 80 : interval === "15 分钟" ? 60 : 40;
  const stepSec =
    interval === "1 分钟" ? 60 : interval === "5 分钟" ? 300 : interval === "15 分钟" ? 900 : interval === "30 分钟" ? 1800 : interval === "1 小时" ? 3600 : 14400;

  const nowSec = Math.floor(Date.now() / 1000);
  const startSec = nowSec - count * stepSec;

  const candles: Candle[] = [];
  const volume: VolumeBar[] = [];

  // Seed pattern roughly matching the screenshot:
  // Starts around 165, chops between 164-166, drops to 160, pulls back to 163, then drifts down to 160.28
  let currentPrice = 165.2;

  for (let i = 0; i < count; i++) {
    const time = startSec + i * stepSec;
    const progress = i / count;

    let delta = (Math.sin(i * 0.4) * 0.6) + ((Math.random() - 0.48) * 0.8);
    if (progress > 0.4 && progress < 0.55) {
      // Big drop
      delta -= 0.8;
    } else if (progress >= 0.55 && progress < 0.7) {
      // Rebound
      delta += 0.5;
    } else if (progress >= 0.7) {
      // Slow drift down to 160.28
      delta -= 0.3;
    }

    const open = Math.round(currentPrice * 100) / 100;
    let close = Math.round((open + delta) * 100) / 100;
    if (i === count - 1) close = 160.28; // Exact current price from screenshot

    const high = Math.round((Math.max(open, close) + Math.random() * 0.5) * 100) / 100;
    const low = Math.round((Math.min(open, close) - Math.random() * 0.5) * 100) / 100;
    currentPrice = close;

    candles.push({ time, open, high, low, close });

    const isUp = close >= open;
    volume.push({
      time,
      value: Math.floor(Math.random() * 50000 + 15000 + (progress > 0.4 && progress < 0.6 ? 80000 : 0)),
      color: isUp ? "rgba(8, 153, 129, 0.35)" : "rgba(242, 54, 69, 0.35)",
    });
  }

  const markers: ChartMarker[] = [
    {
      time: candles[Math.floor(count * 0.9)]?.time ?? nowSec - 600,
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
  };
}
