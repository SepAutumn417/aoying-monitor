import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

/**
 * Tests never open a real socket: the live connection is exercised against the
 * server in integration, not in jsdom. The stub records nothing and never
 * fires `onopen`, so components stay in their "connecting" state.
 */
class StubWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readyState = StubWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;

  constructor(readonly url: string) {}

  send(): void {}
  close(): void {
    this.readyState = StubWebSocket.CLOSED;
  }
}

vi.stubGlobal("WebSocket", StubWebSocket);

if (typeof window !== "undefined") {
  if (!window.matchMedia) {
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  }
}

if (typeof HTMLCanvasElement !== "undefined") {
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(null);
}
