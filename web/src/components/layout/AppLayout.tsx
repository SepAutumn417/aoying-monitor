import { useEffect, useState } from "react";
import {
  Bell,
  BellOff,
  BellRing,
  Database,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Moon,
  Settings,
  Sun,
} from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAlerts } from "../../lib/alerts";
import { useAuth } from "../../lib/auth";
import { useLive } from "../../lib/live";
import { SignalToast } from "../../features/alerts/SignalToast";

const navigation = [
  { to: "/", label: "熬鹰持仓", icon: LayoutDashboard },
  { to: "/workspace", label: "工作台", icon: MessageSquare },
  { to: "/alerts", label: "提醒", icon: Bell },
  { to: "/sources", label: "数据源", icon: Database },
  { to: "/settings", label: "设置", icon: Settings },
];

const socketLabel: Record<string, string> = {
  live: "实时行情",
  connecting: "连接中",
  retrying: "重连中",
  offline: "离线",
  idle: "离线",
};

export function AppLayout() {
  const { user, logout } = useAuth();
  const { status } = useLive();
  const { unread, latest, muted, toggleMuted } = useAlerts();
  const { pathname } = useLocation();

  const [theme, setTheme] = useState<"dark" | "light">(() => {
    try {
      const saved = localStorage.getItem("aoying-theme");
      if (saved === "dark" || saved === "light") return saved;
    } catch {
      /* Storage may be disabled in private mode. */
    }
    return "light";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "light" ? "#faf9f5" : "#121417");
  }, [theme]);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try {
      localStorage.setItem("aoying-theme", next);
    } catch {
      /* Theme still works without persistence. */
    }
  };

  const themeLabel = theme === "dark" ? "切换到浅色主题" : "切换到深色主题";
  const soundLabel = muted ? "打开提示音" : "关闭提示音";

  return (
    <div className="monitor-app aoying-app-shell">
      <a className="monitor-skip" href="#main-content">
        跳到主要内容
      </a>

      {/* Top Navbar matching reference design */}
      <header className="monitor-header ucome-navbar">
        <div className="monitor-topbar ucome-topbar">
          {/* Logo "U来" matching reference */}
          <NavLink className="ucome-brand" to="/" aria-label="U来 · 熬鹰持仓">
            <span className="ucome-logo-icon" aria-hidden="true">
              {/* Lime-green U inside dark square */}
              <svg viewBox="0 0 32 32" width="28" height="28">
                <rect width="32" height="32" rx="7" fill="#111827" />
                <path
                  d="M10 9 V18 C10 21.5 12.5 24 16 24 C19.5 24 22 21.5 22 18 V9"
                  stroke="#bbf426"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </svg>
            </span>
            <span className="ucome-brand-text">U来</span>
          </NavLink>

          {/* Navigation tab bar */}
          <nav aria-label="主导航" className="monitor-nav ucome-nav-tabs">
            {navigation.map(({ to, label, icon: Icon }) => {
              const active = pathname === to || (to === "/workspace" && pathname === "/timeline");
              return (
                <NavLink
                  key={to}
                  to={to}
                  end={to === "/"}
                  aria-label={to === "/" ? "总览" : label}
                  className={active ? "ucome-tab-item is-active" : "ucome-tab-item"}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon className="ucome-tab-icon" aria-hidden="true" />
                  <span>{label}</span>
                  {to === "/alerts" && unread > 0 ? (
                    <span className="monitor-count">{unread > 99 ? "99+" : unread}</span>
                  ) : null}
                </NavLink>
              );
            })}
          </nav>

          {/* Right Tools */}
          <div className="monitor-tools">
            <span className={`monitor-connection connection-${status}`} role="status">
              <i />
              {socketLabel[status] ?? "未连接"}
            </span>
            <button
              type="button"
              className="monitor-icon-button"
              title={themeLabel}
              aria-label={themeLabel}
              onClick={toggleTheme}
            >
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <button
              type="button"
              className="monitor-icon-button"
              title={soundLabel}
              aria-label={soundLabel}
              aria-pressed={!muted}
              onClick={toggleMuted}
            >
              {muted ? <BellOff size={17} /> : <BellRing size={17} />}
            </button>
            <span className="monitor-account" title={user?.username}>
              {user?.display_name ?? user?.username ?? "未登录"}
            </span>
            <button
              type="button"
              className="monitor-icon-button"
              title="退出登录"
              aria-label="退出登录"
              onClick={() => void logout()}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </header>

      <main id="main-content" className="monitor-main ucome-main-content">
        <Outlet />
      </main>

      <SignalToast latest={latest} muted={muted} />
    </div>
  );
}
