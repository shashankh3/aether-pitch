/** @type {import('next').NextConfig} */

// Where the FastAPI engine lives. Used by the same-origin convenience proxy
// so a single-host deployment needs no public engine URL. The browser can
// also be pointed straight at the engine with the runtime AETHER_API_URL /
// AETHER_WS_URL variables, which take precedence over this.
const backendOrigin = process.env.BACKEND_ORIGIN || "http://localhost:8000";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${backendOrigin}/api/:path*` },
    ];
  },
};

module.exports = nextConfig;
