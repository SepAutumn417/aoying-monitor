import { Loader2, Play, RefreshCw, Send, ShieldOff, Smartphone } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { PageHeader } from "../../components/ui/PageHeader";
import { api, ApiError, type ApiDevice } from "../../lib/api";
import { useLive } from "../../lib/live";
import { ACTION_LABEL, SIGNAL_ACTIONS, type SignalAction } from "../../lib/signals";
import { SOUND_LABEL } from "../../lib/sound";

const thresholds = [
  { label: "最小仓位变化", unit: "%", value: "1" },
  { label: "最小名义价值", unit: "USD", value: "50" },
  { label: "提醒去重窗口", unit: "分钟", value: "10" },
];

const channels = [
  { name: "Android App", state: "待接入", note: "主通道" },
  { name: "企业微信", state: "未配置", note: "兜底" },
  { name: "邮件", state: "未配置", note: "日报" },
];

function formatTime(value: string | null): string {
  if (!value) return "从未";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未知";
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

export function SettingsPage() {
  const { status: socketStatus, lastEventId, reconnect } = useLive();
  const [values, setValues] = useState(() => Object.fromEntries(thresholds.map((t) => [t.label, t.value])));
  const [devices, setDevices] = useState<ApiDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDevices(await api.devices());
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "设备列表加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function revoke(device: ApiDevice) {
    setBusy(`revoke-${device.id}`);
    setError(null);
    setNotice(null);
    try {
      await api.revokeDevice(device.id);
      setNotice(`已断开 ${device.name}`);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "断开失败");
    } finally {
      setBusy(null);
    }
  }

  async function sendTest(action?: SignalAction) {
    const key = action ? `test-${action}` : "test";
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const result = await api.publishTestEvent(action);
      const label = action ? `「${ACTION_LABEL[action]}」信号` : "测试事件";
      setNotice(`已发送${label} #${result.event?.id ?? "?"}，应听到「${action ? SOUND_LABEL[action] : "系统提示"}」`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "发送失败");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="设置"
        meta={
          <>
            设备、推送与阈值 · 连接 {socketStatus} · 游标 {lastEventId}
          </>
        }
        action={
          <button
            type="button"
            onClick={() => void sendTest()}
            disabled={busy !== null}
            title="发一条系统级测试事件，不触发信号提示音"
            className="flex items-center gap-1.5 rounded-lg border border-mist-400/20 px-2.5 py-1.5 text-[11px] text-mist-300 transition hover:border-mist-400/40 hover:text-white disabled:opacity-60"
          >
            {busy === "test" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            系统通知
          </button>
        }
      />

      {error ? (
        <p className="mb-3 rounded-lg border border-[color:var(--color-danger)]/30 bg-[color:var(--color-danger)]/10 px-3 py-2 text-[11px] text-[color:var(--color-danger)]">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mb-3 rounded-lg border border-signal-400/25 bg-signal-400/10 px-3 py-2 text-[11px] text-signal-300">
          {notice}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel rounded-xl">
          <div className="flex items-center justify-between border-b border-mist-400/10 px-4 py-3">
            <h2 className="text-sm font-semibold text-white">已登录设备</h2>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => void load()}
                title="刷新"
                className="grid h-6 w-6 place-items-center rounded border border-mist-400/15 text-mist-400 transition hover:text-mist-200"
              >
                <RefreshCw className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={reconnect}
                className="rounded border border-mist-400/15 px-2 py-1 text-[10px] text-mist-400 transition hover:text-mist-200"
              >
                重连
              </button>
            </div>
          </div>
          {loading ? (
            <div className="flex items-center gap-2 px-4 py-6 text-xs text-mist-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              加载中
            </div>
          ) : devices.length === 0 ? (
            <p className="px-4 py-6 text-xs text-mist-400">暂无设备</p>
          ) : (
            <ul className="divide-y divide-mist-400/[0.07]">
              {devices.map((device) => (
                <li key={device.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-xs text-mist-200">
                      <Smartphone className="h-3 w-3 shrink-0 text-mist-400" />
                      <span className="truncate">{device.name}</span>
                      {device.revoked_at ? (
                        <span className="rounded border border-mist-400/20 px-1 py-0.5 font-mono text-[9px] text-mist-400">
                          已断开
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-[10px] text-mist-400">
                      {device.platform} · {device.push_mode} · 活跃 {formatTime(device.last_seen_at)}
                    </p>
                  </div>
                  {device.revoked_at ? null : (
                    <button
                      type="button"
                      onClick={() => void revoke(device)}
                      disabled={busy === `revoke-${device.id}`}
                      className="flex shrink-0 items-center gap-1 rounded border border-mist-400/15 px-2 py-1 text-[10px] text-mist-400 transition hover:border-[color:var(--color-danger)]/40 hover:text-[color:var(--color-danger)] disabled:opacity-60"
                    >
                      {busy === `revoke-${device.id}` ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <ShieldOff className="h-3 w-3" />
                      )}
                      断开
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel rounded-xl">
          <div className="border-b border-mist-400/10 px-4 py-3">
            <h2 className="text-sm font-semibold text-white">提醒阈值</h2>
          </div>
          <div className="space-y-3 px-4 py-4">
            {thresholds.map((item) => (
              <label key={item.label} className="flex items-center justify-between gap-3">
                <span className="text-xs text-mist-200">{item.label}</span>
                <span className="flex items-center gap-1.5">
                  <input
                    value={values[item.label]}
                    onChange={(event) =>
                      setValues((prev) => ({ ...prev, [item.label]: event.target.value }))
                    }
                    className="w-20 rounded-lg border border-mist-400/15 bg-black/20 px-2 py-1.5 text-right font-mono text-xs text-mist-200 outline-none focus:border-signal-400/40"
                  />
                  <span className="w-10 font-mono text-[10px] text-mist-400">{item.unit}</span>
                </span>
              </label>
            ))}
            <p className="pt-1 text-[10px] text-mist-400/70">阈值与通道将在采集接入后生效。</p>
          </div>
        </section>

        <section className="panel rounded-xl">
          <div className="border-b border-mist-400/10 px-4 py-3">
            <h2 className="text-sm font-semibold text-white">提示音试听</h2>
          </div>
          <div className="space-y-3 px-4 py-4">
            <p className="text-[11px] leading-relaxed text-mist-400">
              每一种操作有自己的声音。下面五个按钮会让服务端真的发一条测试信号，
              走和真实信号完全相同的路径——数据库事件、WebSocket、扬声器。
              听到声音，才说明真信号也听得见。
            </p>
            <div className="grid grid-cols-2 gap-2">
              {SIGNAL_ACTIONS.map((action) => (
                <button
                  key={action}
                  type="button"
                  onClick={() => void sendTest(action)}
                  disabled={busy !== null}
                  className="flex items-center justify-between gap-2 rounded-lg border border-mist-400/15 px-2.5 py-2 text-[11px] text-mist-200 transition hover:border-signal-400/40 hover:text-white disabled:opacity-60"
                >
                  <span className="flex items-center gap-1.5">
                    {busy === `test-${action}` ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Play className="h-3 w-3" />
                    )}
                    {ACTION_LABEL[action]}
                  </span>
                  <span className="font-mono text-[10px] text-mist-400">{SOUND_LABEL[action]}</span>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-mist-400/70">
              测试信号不会计入未读，也不会被当成真实成交。
            </p>
          </div>
        </section>

        <section className="panel rounded-xl">
          <div className="border-b border-mist-400/10 px-4 py-3">
            <h2 className="text-sm font-semibold text-white">提醒通道</h2>
          </div>
          <ul className="divide-y divide-mist-400/[0.07]">
            {channels.map((channel) => (
              <li key={channel.name} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-xs text-mist-200">{channel.name}</p>
                  <p className="mt-0.5 text-[11px] text-mist-400">{channel.note}</p>
                </div>
                <span className="text-[11px] text-mist-400">{channel.state}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
