# AETHER PITCH — Azure Infrastructure

Everything the studio needs on Azure, as declarative infrastructure. One
resource group provisions the whole stack:

| Resource | Purpose |
|---|---|
| **Azure AI Foundry** (`AIServices` account + 2 model deployments) | Stage C — triage agent (`gpt-4o-mini`) and narrative/war-room agent (`gpt-4o`) |
| **Azure AI Translator** (`TextTranslation` account) | Stage E — EN/ES/AR/HI localization |
| **Key Vault** + **user-assigned managed identity** | Holds the Foundry and Translator keys; the engine reads them with RBAC, never a baked secret |
| **Container Apps Environment** + 2 Container Apps | `engine` (FastAPI, 10 Hz WebSocket hub) and `studio` (Next.js, SSR) |
| **Application Insights** + **Log Analytics** | Pipeline trace, latency and gateway telemetry |
| **Azure Monitor metric alerts** | Engine restart storms and request-latency budget breaches |

## Deploy

```bash
# 1. Create a resource group
az group create --name rg-aether-pitch --location westeurope

# 2. Build the container images and push them to your registry
az acr build -r <your-registry> ./backend
az acr build -r <your-registry> ./frontend

# 3. Deploy the infrastructure
az deployment group create \
  --resource-group rg-aether-pitch \
  --template-file infra/main.json \
  --parameters \
      prefix=aether \
      engineImage=<your-registry>/aether-engine:latest \
      studioImage=<your-registry>/aether-studio:latest \
      openAiApiKey=<foundry-key> \
      translatorKey=<translator-key>
```

The deployment outputs `studioUrl`, `engineUrl`, `foundryEndpoint`,
`translatorEndpoint` and `keyVaultName`. Open `studioUrl` — that is the
judge-facing application.

> Leave `openAiApiKey` and `translatorKey` empty to deploy in **deterministic
> offline mode**: the studio still runs end-to-end on the local Stage A/B math
> and the browser edge engine, and the Data tab reports the route honestly as
> `DETERMINISTIC` instead of `LIVE CLOUD`.

## Runtime configuration

`NEXT_PUBLIC_*` variables are frozen into the JavaScript bundle at build
time, so they cannot be used to point a deployed container at its engine.
AETHER PITCH therefore resolves its backend coordinates **on the server, per
request**, and inlines them into the page:

| Variable | Read by | Default |
|---|---|---|
| `AETHER_API_URL` | studio server | same origin (proxied) |
| `AETHER_WS_URL` | browser | same origin `/ws` |
| `BACKEND_ORIGIN` | studio server (proxy) | `http://localhost:8000` |

The ARM template sets all three, so the container works with no manual
configuration and the browser never needs an internal DNS name.

## Validate without an Azure subscription

```bash
python infra/validate_template.py
```

The validator is pure Python: it checks JSON validity, ARM expression
symbol resolution, `dependsOn` integrity, `resourceId()`/`reference()`
resolution, resource shape, secret handling, and that every Azure
environment variable the engine reads is actually provisioned by the
template. It runs inside `backend/test_pipeline.py`, so a broken template
fails the build.

The template has been statically validated but **not deployed against a live
Azure subscription** (this project ships without cloud credentials). Model
versions, quotas and regional availability are parameters — check the
selected `gpt-4o` / `gpt-4o-mini` versions are available in your region
before deploying.
