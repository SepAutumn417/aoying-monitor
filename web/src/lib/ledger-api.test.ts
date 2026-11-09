import { afterEach, expect, it, vi } from "vitest";
import { api, setAccessToken } from "./api";
afterEach(() => { vi.unstubAllGlobals(); setAccessToken(null); });
it("reads ledger endpoints through authenticated request and serializes filters", async () => {
  const fetcher = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ positions: [], count: 0 }))));
  vi.stubGlobal("fetch", fetcher); setAccessToken("ledger-token");
  await api.copyStatus();
  await api.positions({ status: "closed", symbol: "A&B", limit: 100, includeEvents: false });
  await api.signals({ beforeId: 0, kind: "open", symbol: "BTC", limit: 12 });
  expect(fetcher.mock.calls.map((call) => call[0])).toEqual(["/api/copy/status", "/api/positions?limit=100&status=closed&symbol=A%26B&include_events=false", "/api/signals?limit=12&before_id=0&kind=open&symbol=BTC"]);
  expect(fetcher.mock.calls[0][1].headers.get("Authorization")).toBe("Bearer ledger-token");
});
