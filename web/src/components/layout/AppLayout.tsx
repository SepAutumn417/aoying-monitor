import {
  Activity,
  Bell,
  Database,
  LayoutDashboard,
  MessageSquare,
  Settings,
  Wallet,
} from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";

const navigation = [
  { to: "/", label: "总览", icon: LayoutDashboard, end: true },
  { to: "/positions", label: "持仓", icon: Wallet },
  { to: "/timeline", label: "发言", icon: MessageSquare },
  { to: "/alerts", label: "提醒", icon: Bell },
  { to: "/sources", label: "数据源", icon: Database },
  { to: "/settings", label: "设置", icon: Settings },
];

function NavItems({ compact = false }: { compact?: boolean }) {
  return (
    <>
      {navigation.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            [
              "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition",
              compact ? "whitespace-nowrap" : "",
              isActive
                ? "bg-signal-400/10 text-white"
                : "text-mist-400 hover:bg-white/[0.03] hover:text-mist-200",
            ].join(" ")
          }
        >
          <Icon className="h-4 w-4 shrink-0" strokeWidth={1.8} />
          <span>{label}</span>
        </NavLink>
      ))}
    </>
  );
}

export function AppLayout() {
  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[210px] flex-col border-r border-mist-400/10 bg-ink-950/80 px-3 py-4 backdrop-blur md:flex">
        <div className="flex items-center gap-2.5 px-1.5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-signal-400/10">
            <Activity className="h-4 w-4 text-signal-300" strokeWidth={2} />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">熬鹰监控</p>
            <p className="font-mono text-[10px] text-mist-400">AOYING · 只读</p>
          </div>
        </div>

        <nav className="mt-5 flex flex-1 flex-col gap-0.5">
          <NavItems />
        </nav>

        <div className="border-t border-mist-400/10 px-1.5 pt-3">
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-signal" />
            <span className="font-mono text-[10px] text-mist-400">本机预览</span>
          </div>
          <p className="mt-1 font-mono text-[10px] text-mist-400/70">v0.1.0</p>
        </div>
      </aside>

      <div className="md:pl-[210px]">
        <header className="sticky top-0 z-10 border-b border-mist-400/10 bg-ink-950/85 backdrop-blur">
          <div className="flex h-12 items-center justify-between px-4 md:px-6">
            <div className="flex items-center gap-2 md:hidden">
              <Activity className="h-4 w-4 text-signal-300" />
              <span className="text-sm font-semibold text-white">熬鹰监控</span>
            </div>
            <div className="hidden items-center gap-1.5 md:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-signal" />
              <span className="text-[11px] text-mist-400">数据源未接入</span>
            </div>
            <div className="grid h-7 w-7 place-items-center rounded-full bg-white/[0.05] text-[11px] font-semibold text-mist-200">
              A
            </div>
          </div>
          <div className="flex gap-1 overflow-x-auto px-3 pb-2 md:hidden">
            <NavItems compact />
          </div>
        </header>

        <main className="mx-auto max-w-[1400px] px-4 py-5 md:px-6 md:py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
