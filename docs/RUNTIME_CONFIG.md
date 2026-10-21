# Runtime Configuration Contract

> Why AETHER PITCH does not use `NEXT_PUBLIC_*` for its backend coordinates,
> and how the substitute works.

## The problem

Next.js **inlines `NEXT_PUBLIC_*` variables into the JavaScript bundle at build
time**. They are not read at runtime.

That breaks the standard container pattern:

```yaml
# azure.yaml / docker-compose.yml — the naive version
services:
  studio:
    build: ./frontend          # <-- the bundle is built HERE
    env:
      - name: NEXT_PUBLIC_API_URL
        value: http://engine:8000   # <-- but this arrives at RUN time
```

The image is built before the variable exists, so the bundle keeps the
build-time default. The browser then talks to `localhost:8000` — *the judge's
own laptop* — instead of the engine. The studio looks alive and quietly shows
the edge-engine fallback, which reads as "the cloud part is fake".

## The fix: hydrate on the server, per request

The studio does not need the backend URL at build time. It only needs it at
*request* time, and the server knows it then.

```text
frontend/src/app/layout.tsx
  export const dynamic = "force-dynamic";     // render per request
  const config = runtimeConfig();              // read process.env NOW
  <script dangerouslySetInnerHTML={{
    __html: `window.__AETHER_CONFIG__=${JSON.stringify(config)};`,
  }} />
```

The page HTML carries the coordinates, the browser picks them up before any
client module evaluates, and one immutable image runs in every environment.

| Variable | Read by | Default | Purpose |
|---|---|---|---|
| `AETHER_API_URL` | studio server | same origin (dev: `http://localhost:8000`) | REST base URL |
| `AETHER_WS_URL` | browser | same origin `/ws` | WebSocket URL |
| `BACKEND_ORIGIN` | studio server | `http://localhost:8000` | Engine origin for the same-origin proxy |

The client reads them through `frontend/src/lib/runtimeConfig.ts`:

```ts
export function apiBase(): string { return getRuntimeConfig().apiBase; }
export function wsUrl(): string {
  const configured = getRuntimeConfig().wsUrl;
  if (configured) return configured;
  if (typeof window === "undefined") return "ws://localhost:8000/ws";
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}
```

## The same-origin proxy

`frontend/next.config.js` also proxies `/api/*` and `/ws` to the engine, so a
single-origin deployment works with no public engine URL at all:

```js
const backendOrigin = process.env.BACKEND_ORIGIN || "http://localhost:8000";

async rewrites() {
  return [
    { source: "/api/:path*", destination: `${backendOrigin}/api/:path*` },
  ];
}
```

WebSocket proxying is **not** available through Next.js rewrites (the `ws`
option was removed), so the WebSocket URL is always set explicitly via
`AETHER_WS_URL`. In the ARM template it points at the engine's public FQDN.

## Backend environment

The engine's own configuration is ordinary runtime environment — it is read
when the process starts, so nothing is baked in.

| Variable | Default | Purpose |
|---|---|---|
| `AZURE_OPENAI_ENDPOINT` | empty | Azure AI Foundry / Azure OpenAI endpoint (Stage C) |
| `AZURE_OPENAI_API_KEY` | empty | Stage C key |
| `AZURE_OPENAI_API_VERSION` | `2024-06-01` | Azure OpenAI API version |
| `AZURE_OPENAI_TRIAGE_DEPLOYMENT` | `gpt-4o-mini` | Fast archetype router |
| `AZURE_OPENAI_NARRATIVE_DEPLOYMENT` | `gpt-4o` | Narrative + war-room agent |
| `AZURE_TRANSLATOR_KEY` | empty | Azure AI Translator (Stage E) |
| `AZURE_TRANSLATOR_ENDPOINT` | `https://api.cognitive.microsofttranslator.com` | Translator endpoint |
| `AZURE_CONTENT_SAFETY_ENDPOINT` | empty | Optional second RAI layer |
| `AZURE_CONTENT_SAFETY_KEY` | empty | Optional second RAI layer |
| `MATCH_TIME_SCALE` | `6.0` | Match-seconds per real second |
| `MATCH_START_MINUTE` | `62.0` | Match clock at engine start |
| `AETHER_SEED` | `42` | Deterministic simulation seed |

**Every Azure variable is optional.** With none of them set the studio runs
end to end on deterministic local fallbacks, and the Data tab labels the route
honestly as `DETERMINISTIC` rather than `LIVE CLOUD`.

## Verifying it

```bash
cd frontend
npm run build
npm run smoke     # asserts the runtime config was injected into the HTML
```

To see the injected block yourself:

```bash
grep -o '__AETHER_CONFIG__=[^<]*' .next/server/app/index.html
```

## Why this matters for the submission

It is a small thing that a reviewer only notices when it breaks — and it is
exactly the kind of detail that separates "a demo that ran on the author's
laptop" from "a product that deploys". The same image runs in local dev, in CI,
in Docker Compose and on Azure Container Apps with no rebuild.
