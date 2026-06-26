# Local CORS-permissive proxy for the Fano demo GUI (OPTIONAL as of 2026-06-26)

**Note (2026-06-26):** Fano-engine production now emits CORS headers natively
(Fano CORS Phase 5 sprint shipped Rev 28 with `CORSMiddleware` at 2026-06-26
11:39 UTC). For normal adopter work, point the demo Base URL directly at
`https://fano-engine-afmurhqkaq-ts.a.run.app` — no proxy required.

This PROXY.md template is retained as an OPTIONAL convenience for:

- **CI / fixture-capture** — deterministic recording of request/response pairs
  without dragging in production-CORS state
- **Air-gapped reproduction** — mirror production behaviour behind a local
  proxy that you can pause / inspect / instrument
- **Pre-production canary work** — if a future Fano canary revision is
  deployed at `--no-traffic` and is testing a CORS variant, the proxy lets
  you hit it via a tag-routed URL without browser-CORS friction

A 30-line Node script that lets the demo GUI (running at `http://localhost:8000`)
talk to production Fano (`https://fano-engine-afmurhqkaq-ts.a.run.app`) by adding
`Access-Control-Allow-*` headers to Fano's response. The proxy lives on your
machine only.

## proxy.mjs

```js
// proxy.mjs — local CORS-permissive proxy in front of Fano-engine production.
// Run with: node proxy.mjs
// Then point demo-gui Base URL at http://localhost:8787

import { createServer, request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

const FANO = new URL("https://fano-engine-afmurhqkaq-ts.a.run.app");
const PORT = 8787;

createServer((req, res) => {
  // Permissive CORS for local dev.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type, x-api-key");
  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }
  const target = httpsRequest({
    host: FANO.host,
    port: 443,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: FANO.host },
  }, (upstream) => {
    res.writeHead(upstream.statusCode, upstream.headers);
    upstream.pipe(res);
  });
  target.on("error", (err) => {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "proxy error", detail: err.message }));
  });
  req.pipe(target);
}).listen(PORT, () => {
  console.log(`Fano CORS proxy listening on http://localhost:${PORT}`);
  console.log(`Forwarding to ${FANO.origin}`);
});
```

## Use

```bash
# Terminal 1: start the proxy
node proxy.mjs

# Terminal 2: serve the demo GUI
python3 -m http.server 8000 --directory examples/demo-gui

# Browser:
# 1. Open http://localhost:8000
# 2. Set Base URL → http://localhost:8787
# 3. Set X-API-Key → your testing-tier key
# 4. Fire away
```

## Caveats

- **Single-developer-machine only.** Never expose this on the network without
  proper auth + rate limiting.
- **API key still hits Fano**, transmitted via the proxy. The proxy doesn't
  intercept or store it; it just forwards. But you're trusting `localhost`.
- **No retry / no rate limit / no cache.** This is a 30-line dev tool, not
  production infrastructure.

The honest end-game is **`CORSMiddleware` at Fano-engine** — see Brain canon
Lesson #66 CANDIDATE for the n=1 precedent at `clawdog-calculator-api` 2026-06-24.
Once that's deployed, the proxy goes away.
