/**
 * A tiny static file server for the web client - no dependencies.
 * ES modules can't load from a file:// path, so the page needs to be served
 * over http, even locally. `npm run web` builds and starts this.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const ROOT = new URL("../web/", import.meta.url).pathname;
const PORT = Number(process.env.PORT) || 5173;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

createServer(async (req, res) => {
  const requested = decodeURIComponent((req.url ?? "/").split("?")[0]);
  const path = join(ROOT, normalize(requested === "/" ? "/index.html" : requested));

  if (!path.startsWith(ROOT)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  try {
    const body = await readFile(path);
    res.writeHead(200, {
      "content-type": TYPES[extname(path)] ?? "application/octet-stream",
      "cache-control": "no-cache",
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
  }
}).listen(PORT, () => {
  console.log(`Trade.io running at http://localhost:${PORT}`);
});
