import { Activity, LockKeyhole } from "lucide-react";

export function LoginPage() {
  return (
    <div className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl border border-signal-400/30 bg-signal-400/10">
            <Activity className="h-5 w-5 text-signal-300" />
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-mist-400">
              AOYING MONITOR
            </p>
            <p className="text-sm font-semibold text-white">只读交易监控</p>
          </div>
        </div>

        <div className="panel rounded-xl p-6">
          <div className="flex items-center gap-2">
            <LockKeyhole className="h-4 w-4 text-mist-200" />
            <h1 className="text-lg font-semibold text-white">登录</h1>
          </div>
          <p className="mt-2 text-xs leading-5 text-mist-400">
            登录与设备会话在 I1 接入；当前表单仅为骨架，不会发送请求。
          </p>

          <form className="mt-5 space-y-3" onSubmit={(event) => event.preventDefault()}>
            <label className="block">
              <span className="text-xs text-mist-200">用户名</span>
              <input
                disabled
                placeholder="I1 接入"
                className="mt-1.5 w-full rounded-lg border border-mist-400/15 bg-black/20 px-3 py-2 text-sm text-mist-400 outline-none"
              />
            </label>
            <label className="block">
              <span className="text-xs text-mist-200">密码</span>
              <input
                disabled
                type="password"
                placeholder="I1 接入"
                className="mt-1.5 w-full rounded-lg border border-mist-400/15 bg-black/20 px-3 py-2 text-sm text-mist-400 outline-none"
              />
            </label>
            <button
              type="button"
              disabled
              className="w-full rounded-lg border border-mist-400/15 bg-white/[0.02] px-3 py-2.5 text-sm text-mist-400"
            >
              I1 后启用登录
            </button>
          </form>
        </div>

        <p className="mt-4 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-mist-400/60">
          READ-ONLY · NO TRADING
        </p>
      </div>
    </div>
  );
}
