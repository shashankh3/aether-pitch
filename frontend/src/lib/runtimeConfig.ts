/**
 * AETHER PITCH — runtime configuration.
 *
 * `NEXT_PUBLIC_*` variables are inlined by Next.js at BUILD time, so a
 * container that receives them at RUN time keeps the build-time defaults and
 * ends up pointing the browser at the wrong host. This module reads a tiny
 * `window.__AETHER_CONFIG__` object that the container entrypoint writes on
 * start, falling back to same-origin so a plain `npm run dev` or
 * `next start` works with zero configuration.
 */

export interface AetherRuntimeConfig {
  /** Base URL for REST calls, e.g. "" (same origin) or "https://engine.example.com". */
  apiBase: string;
  /** Absolute WebSocket URL, e.g. "" (derive from location) or "wss://engine.example.com/ws". */
  wsUrl: string;
}

declare global {
  interface Window {
    __AETHER_CONFIG__?: Partial<AetherRuntimeConfig>;
  }
}

function normalizeBase(value: string | undefined | null): string {
  if (!value) return "";
  return value.replace(/\/+$/, "");
}

export function getRuntimeConfig(): AetherRuntimeConfig {
  if (typeof window === "undefined") {
    return { apiBase: "", wsUrl: "" };
  }
  const injected = window.__AETHER_CONFIG__ ?? {};
  return {
    apiBase: normalizeBase(injected.apiBase),
    wsUrl: (injected.wsUrl ?? "").trim(),
  };
}

/** REST base URL. Empty string means "same origin". */
export function apiBase(): string {
  return getRuntimeConfig().apiBase;
}

/** WebSocket URL. Empty string means "same origin, current protocol". */
export function wsUrl(): string {
  const configured = getRuntimeConfig().wsUrl;
  if (configured) return configured;
  if (typeof window === "undefined") return "ws://localhost:8000/ws";
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}
