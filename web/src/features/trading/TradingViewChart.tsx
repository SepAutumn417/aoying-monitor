import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
} from "lightweight-charts";
import {
  Maximize2,
  Minimize2,
  Minus,
  Pencil,
  RefreshCw,
  Slash,
  Trash2,
  Type,
  TrendingUp,
} from "lucide-react";
import { getCandlesForInterval } from "./candleData";

interface TradingViewChartProps {
  symbol?: string;
  entryPrice?: number;
  theme?: "light" | "dark";
}

const INTERVALS = ["1 分钟", "5 分钟", "15 分钟", "30 分钟", "1 小时", "4 小时"];

function hasCanvasSupport(): boolean {
  try {
    if (typeof document === "undefined") return false;
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext && canvas.getContext("2d"));
  } catch {
    return false;
  }
}

export function TradingViewChart({
  symbol = "NVDA / USDT",
  entryPrice = 162.75,
  theme = "light",
}: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const markersRef = useRef<any>(null);

  const [interval, setInterval] = useState("5 分钟");
  const [showOperations, setShowOperations] = useState(true);
  const [showTweets, setShowTweets] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeTool, setActiveTool] = useState<string>("crosshair");
  const [lastSyncTime, setLastSyncTime] = useState("13:56:55");

  const [ohlc, setOhlc] = useState({
    open: 160.03,
    high: 163.07,
    low: 161.53,
    close: 161.64,
  });

  // Keep live sync time updated
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setLastSyncTime(now.toLocaleTimeString("zh-CN", { hour12: false }));
    };
    updateTime();
    const timer = window.setInterval(updateTime, 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    if (!hasCanvasSupport()) {
      // In headless environments without HTML5 Canvas (like jsdom), skip createChart
      return;
    }

    const isDark = theme === "dark";
    const bgColor = isDark ? "#16191d" : "#ffffff";
    const textColor = isDark ? "#9ca3af" : "#787b86";
    const gridColor = isDark ? "rgba(255, 255, 255, 0.05)" : "#f0ede6";

    let chart: IChartApi;
    try {
      chart = createChart(containerRef.current, {
        width: containerRef.current.clientWidth || 800,
        height: 520,
        layout: {
          background: { type: ColorType.Solid, color: bgColor },
          textColor,
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        },
        grid: {
          vertLines: { color: gridColor, style: LineStyle.Dotted },
          horzLines: { color: gridColor, style: LineStyle.Dotted },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
        },
        rightPriceScale: {
          borderColor: gridColor,
          scaleMargins: { top: 0.1, bottom: 0.2 },
        },
        timeScale: {
          borderColor: gridColor,
          timeVisible: true,
          secondsVisible: false,
        },
      });
    } catch {
      return;
    }

    chartRef.current = chart;

    // Candlestick Series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#089981",
      downColor: "#f23645",
      borderUpColor: "#089981",
      borderDownColor: "#f23645",
      wickUpColor: "#089981",
      wickDownColor: "#f23645",
    });
    candleSeriesRef.current = candleSeries;

    // Volume Series
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "",
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });
    volumeSeriesRef.current = volumeSeries;

    // Average price horizontal line
    candleSeries.createPriceLine({
      price: entryPrice,
      color: "#c29910",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: `多单均价 ${entryPrice.toFixed(2)}`,
    });

    // Load initial data
    const { candles, volume, markers, ohlc: initialOhlc } = getCandlesForInterval(interval);
    candleSeries.setData(candles as any);
    volumeSeries.setData(volume as any);
    setOhlc(initialOhlc);

    // Markers
    if (showTweets && markers.length > 0) {
      try {
        markersRef.current = createSeriesMarkers(candleSeries as any, markers as any);
      } catch {
        /* Ignore */
      }
    }

    // Subscribe to crosshair move to update OHLC header
    chart.subscribeCrosshairMove((param) => {
      if (!param || !param.time || !param.seriesData) return;
      const bar = param.seriesData.get(candleSeries) as any;
      if (bar && typeof bar.open === "number") {
        setOhlc({
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
        });
      }
    });

    // Resize observer
    const handleResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      try {
        chart.remove();
      } catch {
        /* Ignore cleanup errors in non-browser envs */
      }
      chartRef.current = null;
    };
  }, [theme, entryPrice]);

  // Update data when interval changes
  useEffect(() => {
    if (!candleSeriesRef.current || !chartRef.current) return;
    const { candles, volume, markers, ohlc: newOhlc } = getCandlesForInterval(interval);
    candleSeriesRef.current.setData(candles as any);
    volumeSeriesRef.current?.setData(volume as any);
    setOhlc(newOhlc);

    if (markersRef.current && typeof markersRef.current.setMarkers === "function") {
      markersRef.current.setMarkers(showTweets ? markers : []);
    }
  }, [interval, showTweets]);

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const reloadData = () => {
    if (!candleSeriesRef.current) return;
    const { candles, volume, ohlc: newOhlc } = getCandlesForInterval(interval);
    candleSeriesRef.current.setData(candles as any);
    volumeSeriesRef.current?.setData(volume as any);
    setOhlc(newOhlc);
  };

  return (
    <div className={`chart-card ${isFullscreen ? "is-fullscreen" : ""}`} role="region" aria-label="K线行情">
      {/* Top Header */}
      <div className="chart-header">
        <div className="chart-header-left">
          <span className="chart-symbol">{symbol}</span>
          <div className="interval-selector" role="tablist" aria-label="K线周期">
            {INTERVALS.map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={interval === item}
                className={`interval-btn ${interval === item ? "is-active" : ""}`}
                onClick={() => setInterval(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="chart-header-right">
          <button type="button" className="chart-tool-btn" onClick={reloadData} title="定位到最新">
            →| 最新
          </button>
          <button
            type="button"
            className="chart-icon-btn"
            onClick={reloadData}
            aria-label="刷新图表"
            title="刷新数据"
          >
            <RefreshCw size={15} />
          </button>
          <button
            type="button"
            className="chart-icon-btn"
            onClick={toggleFullscreen}
            aria-label="全屏显示"
            title={isFullscreen ? "退出全屏" : "全屏"}
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </div>

      {/* OHLC Bar */}
      <div className="chart-ohlc-bar">
        <span>开 <strong className="ohlc-val">{ohlc.open.toFixed(2)}</strong></span>
        <span>高 <strong className="ohlc-val">{ohlc.high.toFixed(2)}</strong></span>
        <span>低 <strong className="ohlc-val">{ohlc.low.toFixed(2)}</strong></span>
        <span>收 <strong className="ohlc-val">{ohlc.close.toFixed(2)}</strong></span>
      </div>

      {/* Main Chart Area with Left Drawing Toolbar */}
      <div className="chart-canvas-wrapper">
        <aside className="chart-drawing-toolbar" aria-label="画线工具">
          <button
            type="button"
            className={`toolbar-btn ${activeTool === "crosshair" ? "active" : ""}`}
            title="十字光标"
            onClick={() => setActiveTool("crosshair")}
          >
            <span style={{ fontSize: 13, fontWeight: 700 }}>+</span>
          </button>
          <button
            type="button"
            className={`toolbar-btn ${activeTool === "trend" ? "active" : ""}`}
            title="趋势线"
            onClick={() => setActiveTool("trend")}
          >
            <Slash size={14} />
          </button>
          <button
            type="button"
            className={`toolbar-btn ${activeTool === "horz" ? "active" : ""}`}
            title="水平线"
            onClick={() => setActiveTool("horz")}
          >
            <Minus size={14} />
          </button>
          <button
            type="button"
            className={`toolbar-btn ${activeTool === "pitchfork" ? "active" : ""}`}
            title="分叉线"
            onClick={() => setActiveTool("pitchfork")}
          >
            <TrendingUp size={14} />
          </button>
          <button
            type="button"
            className={`toolbar-btn ${activeTool === "pencil" ? "active" : ""}`}
            title="笔刷"
            onClick={() => setActiveTool("pencil")}
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            className={`toolbar-btn ${activeTool === "text" ? "active" : ""}`}
            title="文本标注"
            onClick={() => setActiveTool("text")}
          >
            <Type size={14} />
          </button>
          <button
            type="button"
            className="toolbar-btn"
            title="清除全部"
            onClick={() => setActiveTool("crosshair")}
          >
            <Trash2 size={14} />
          </button>
        </aside>

        <div className="chart-canvas-container" ref={containerRef}>
          {!hasCanvasSupport() && (
            <div
              className="chart-svg-fallback"
              style={{
                width: "100%",
                height: 520,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                background: theme === "dark" ? "#16191d" : "#fafaf7",
                border: "1px dashed #dcd8cc",
                borderRadius: 8,
              }}
            >
              <svg viewBox="0 0 500 240" width="80%" height="80%">
                <line x1="50" y1="120" x2="450" y2="120" stroke="#c29910" strokeDasharray="4 4" strokeWidth="1" />
                <text x="360" y="115" fill="#c29910" fontSize="11" fontWeight="bold">多单均价 162.75</text>
                {/* Simplified Candlesticks */}
                <rect x="70" y="80" width="10" height="40" fill="#089981" />
                <rect x="110" y="70" width="10" height="55" fill="#f23645" />
                <rect x="150" y="90" width="10" height="30" fill="#089981" />
                <rect x="190" y="60" width="10" height="85" fill="#f23645" />
                <rect x="230" y="100" width="10" height="45" fill="#089981" />
                <rect x="270" y="110" width="10" height="50" fill="#f23645" />
                <rect x="310" y="95" width="10" height="40" fill="#089981" />
                <rect x="350" y="125" width="10" height="60" fill="#f23645" />
                <circle cx="355" cy="200" r="10" fill="#1d9bf0" />
                <text x="351" y="204" fill="#fff" fontSize="10" fontWeight="bold">𝕏</text>
              </svg>
              <span style={{ fontSize: 12, color: "#888" }}>TradingView Lightweight Charts (Canvas 容器)</span>
            </div>
          )}
        </div>
      </div>

      {/* Controls below chart */}
      <div className="chart-controls-bar">
        <div className="chart-controls-left">
          <label className="chart-checkbox-label">
            <input
              type="checkbox"
              checked={showOperations}
              onChange={(e) => setShowOperations(e.target.checked)}
            />
            <span>显示操作标记 0</span>
          </label>
          <label className="chart-checkbox-label">
            <input
              type="checkbox"
              checked={showTweets}
              onChange={(e) => setShowTweets(e.target.checked)}
            />
            <span>显示推文 6</span>
            <span className="checkbox-hint">点击标记查看内容</span>
          </label>
        </div>

        <div className="chart-controls-right">
          <span className="live-status-pill">
            <span className="live-status-dot" />
            实时行情
          </span>
        </div>
      </div>

      {/* Footer Notes */}
      <div className="chart-footer-bar">
        <span className="chart-footer-note">
          近期通知中暂无该合约操作。选择其他持仓可查看对应行情。 标记时间有延迟，不代表真实成交点。
        </span>
        <span className="chart-footer-meta">
          TradingView Lightweight Charts™ &nbsp;&nbsp; 行情同步 {lastSyncTime}
        </span>
      </div>
    </div>
  );
}
