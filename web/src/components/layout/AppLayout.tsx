import {
  Activity,
  Bell,
  Database,
  LayoutDashboard,
  Radio,
  Settings,
  Wallet,
} from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";

const navigation = [
  { to: "/", label: "总览", icon: LayoutDashboard, end: true },
  { to: "/timeline", label: "时间线", icon: Radio },
  { to: "/positions", label: "持仓", icon: Wallet },
  { to: "/alerts", label: "告警", icon: Bell },
  { to: "/sources", label: "来源", icon: Database },
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
              "group flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition",
              compact ? "whitespace-nowrap" : "",
              isActive
                ? "border-signal-400/25 bg-signal-400/10 text-white"
                : "border-transparent text-mist-400 hover:border-mist-400/15 hover:bg-white/[0.03] hover:text-mist-200",
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
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[260px] flex-col border-r border-mist-400/10 bg-ink-950/80 px-4 py-5 backdrop-blur md:flex">
        <div className="flex items-center gap-3 px-2">
          <div className="grid h-10 w-10 place-items-center rounded-xl border border-signal-400/30 bg-signal-400/10">
            <Activity className="h-5 w-5 text-signal-300" strokeWidth={1.9} />
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-mist-400">
              AOYING
            </p>
            <p className="text-sm font-semibold tracking-wide text-white">交易监控</p>
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-mist-400/10 bg-white/[0.02] px-3 py-2.5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-mist-400">
              I0 · SCAFFOLD
            </span>
            <span className="h-1.5 w-1.5 rounded-full bg-signal-400" />
          </div>
          <p className="mt-1.5 text-xs leading-5 text-mist-400">
            骨架已就绪，数据源尚未接入。
          </p>
        </div>

        <nav className="mt-6 flex flex-1 flex-col gap-1">
          <NavItems />
        </nav>

        <div className="border-t border-mist-400/10 px-2 pt-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-mist-400">
            v0.1.0 · LOCAL
          </p>
          <p className="mt-1 text-xs text-mist-400">只读监控 · 不执行交易</p>
        </div>
      </aside>

      <div className="md:pl-[260px]">
        <header className="sticky top-0 z-10 border-b border-mist-400/10 bg-ink-950/75 backdrop-blur">
          <div className="flex h-14 items-center justify-between px-4 md:px-8">
            <div className="flex items-center gap-2 md:hidden">
              <Activity className="h-4 w-4 text-signal-300" />
              <span className="text-sm font-semibold text-white">熬鹰监控</span>
            </div>
            <div className="hidden items-center gap-2 md:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-signal" />
              <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-mist-400">
                本地骨架 · 未连接生产数据
              </span>
            </div>            <div className="flex items-center gap-3">
              <span className="hidden font-mono text-[10px] uppercase tracking-[0.14em] text-mist-400 sm:inline">
                READ-ONLY
              </span>
              <div className="grid h-8 w-8 place-items-center rounded-full border border-mist-400/20 bg-white/[0.03] text-xs font-semibold text-mist-200">
                A
              </div>
            </div>
          </div>
          <div className="flex gap-1 overflow-x-auto px-3 pb-2 md:hidden">
            <NavItems compact />
          </div>
        </header>

        <main className="mx-auto max-w-[1400px] px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
