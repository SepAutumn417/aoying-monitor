import { Activity, Loader2, LockKeyhole } from "lucide-react";
import { useState, type FormEvent } from "react";

import { ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";

export function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      // LoginRoute watches the session and forwards to the page the user
      // originally asked for, so nothing to navigate here.
      await login(username.trim(), password);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "登录失败，请稍后重试");
    } finally {
      setBusy(false);
    }
  }

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
            <p className="text-sm font-semibold text-white">只读监控台</p>
          </div>
        </div>

        <div className="panel rounded-xl p-6">
          <div className="flex items-center gap-2">
            <LockKeyhole className="h-4 w-4 text-mist-200" />
            <h1 className="text-lg font-semibold text-white">登录</h1>
          </div>

          <form className="mt-5 space-y-3" onSubmit={submit}>
            <label className="block">
              <span className="text-xs text-mist-200">用户名</span>
              <input
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="mt-1.5 w-full rounded-lg border border-mist-400/15 bg-black/20 px-3 py-2 text-sm text-white outline-none transition focus:border-signal-400/50"
              />
            </label>
            <label className="block">
              <span className="text-xs text-mist-200">密码</span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1.5 w-full rounded-lg border border-mist-400/15 bg-black/20 px-3 py-2 text-sm text-white outline-none transition focus:border-signal-400/50"
              />
            </label>

            {error ? (
              <p className="rounded-lg border border-[color:var(--color-danger)]/30 bg-[color:var(--color-danger)]/10 px-3 py-2 text-[11px] text-[color:var(--color-danger)]">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-signal-400 px-3 py-2.5 text-sm font-semibold text-ink-950 transition hover:bg-signal-300 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {busy ? "正在登录" : "进入监控台"}
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
