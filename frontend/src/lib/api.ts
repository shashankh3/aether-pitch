// Single source of truth for the backend base URL.
// Resolved at RUNTIME from the container entrypoint (see lib/runtimeConfig.ts)
// so a deployed container never falls back to the build-time default.
import { apiBase } from "./runtimeConfig";

export const API_BASE = apiBase();
