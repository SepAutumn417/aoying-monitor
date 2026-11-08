/**
 * A corner card for the newest signal, so a fresh trade is visible without
 * leaving the page you are on.
 *
 * It appears for real signals only (test pushes are excluded upstream), fades
 * out on its own after a few seconds, and never stacks: a second signal while
 * the first is still up replaces it. Clicking dismisses immediately.
 */

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Link } from "react-router-dom";

import { ACTION_LABEL, actionTone, type SignalAlert } from "../../lib/signals";

const VISIBLE_MS = 7000;

export function SignalToast({ latest, muted }: { latest: SignalAlert | null; muted: boolean }) {
  const [dismissedId, setDismissedId] = useState(0);

  useEffect(() => {
    if (!latest) return;
    const timer = window.setTimeout(() => setDismissedId(latest.id), VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [latest]);

  if (!latest || latest.test || latest.id === dismissedId) return null;

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-30 flex justify-end sm:inset-x-auto sm:right-5 sm:bottom-5">
      <div className="pointer-events-auto w-full max-w-sm rounded-xl border border-mist-400/20 bg-ink-900/95 p-3 shadow-2xl backdrop-blur">
        <div className="flex items-start gap-2.5">
          <span
            className={`mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium ${actionTone(latest.action)}`}
          >
            {ACTION_LABEL[latest.action]}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{latest.headline}</p>
            {latest.summary ? (
              <p className="mt-1 truncate font-mono text-[10px] text-mist-400">{latest.summary}</p>
            ) : null}
            <div className="mt-1.5 flex items-center gap-2">
              <Link
                to="/alerts"
                className="text-[11px] text-signal-300 underline-offset-2 hover:underline"
              >
                查看全部信号
              </Link>
              {muted ? <span className="text-[10px] text-mist-400">· 静音中</span> : null}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDismissedId(latest.id)}
            title="关闭"
            className="grid h-5 w-5 shrink-0 place-items-center rounded text-mist-400 transition hover:text-mist-200"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
