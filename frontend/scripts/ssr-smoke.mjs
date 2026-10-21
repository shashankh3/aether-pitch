/**
 * AETHER PITCH — SSR smoke test.
 *
 * Boots the production Next server in-process, requests the page, asserts the
 * runtime config was injected and the shell rendered, then shuts down and
 * exits. Self-terminating: no background process is left behind.
 *
 *   npm run build && npm run smoke
 */
import { createServer } from "http";
import next from "next";

const port = Number(process.env.SMOKE_PORT || 3999);
const app = next({ dev: false, dir: process.cwd() });
const handle = app.getRequestHandler();

let failed = false;
const check = (name, cond, detail = "") => {
  console.log(`[${cond ? "PASS" : "FAIL"}] ${name}${detail ? " - " + detail : ""}`);
  if (!cond) failed = true;
};

async function main() {
  await app.prepare();
  const server = createServer((req, res) => handle(req, res));
  await new Promise((resolve) => server.listen(port, resolve));

  try {
    const res = await fetch(`http://127.0.0.1:${port}/`, { redirect: "manual" });
    const html = await res.text();

    check("page responds 200", res.status === 200, `status=${res.status}`);
    check("html is non-trivial", html.length > 2000, `${html.length} bytes`);
    check(
      "runtime config injected",
      html.includes("__AETHER_CONFIG__"),
      (html.match(/__AETHER_CONFIG__=([^<]{0,160})/) || [])[1] || "not found",
    );
    check("app shell rendered", html.includes("AETHER"), "brand marker present");
    check(
      "no server error overlay",
      !html.includes("__NEXT_ERROR") && !html.includes("Server Error"),
      "no SSR error markers",
    );

    const apiRes = await fetch(`http://127.0.0.1:${port}/api/health`, {
      redirect: "manual",
    }).catch((err) => ({ status: 0, text: async () => String(err) }));
    const apiBody = await apiRes.text();
    check(
      "api proxy reaches the engine (or fails cleanly)",
      apiRes.status === 200 || apiRes.status === 500 || apiRes.status === 502,
      `status=${apiRes.status}`,
    );
  } finally {
    server.close();
    await app.close?.();
  }

  console.log("");
  console.log(failed ? "RESULT: SSR SMOKE FAILED" : "RESULT: SSR SMOKE PASSED");
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("SSR smoke crashed:", err);
  process.exit(1);
});
