# ContextWall 🧱

**An intelligent data firewall for AI agents.** A circuit breaker that lives in
the MCP tool-invocation layer, intercepts scraper output, and stops toxic data
(bot-blocker pages, CAPTCHAs, semantic garbage) from poisoning an agent's
context window and burning its token budget.

> Web scraping has a ~5% unavoidable failure rate. When it fails, sites often
> still return **HTTP 200 "success"** — but the body is a bot-blocker page, not
> data (we catch a real one live: `homedepot.com` → 200 + "Powered and protected
> by Privacy"). Downstream agents ingest it blindly → hallucination + wasted LLM
> spend. ContextWall is the runtime gatekeeper that catches it — by reading the
> content, never trusting the status code.

**👋 New here?** Read **[OVERVIEW.md](OVERVIEW.md)** first — the full picture
(problem, how it works, everything we've built, diagrams, glossary) in one page.
**📣 Explaining it to someone?** See **[PITCH.md](PITCH.md)** — 30-second and
3-minute non-technical versions.

---

## Quick start (runs fully offline, no keys needed)

```bash
npm install
npm run demo            # all 3 scenarios
npm run demo:hard       # block page (fixture)  → Tier 1 trips at row 1
npm run demo:soft       # semantic mismatch     → Tier 2 trips at row 3
npm run demo:clean      # genuine data          → passes, 12/12 delivered
```

Add a `GEMINI_API_KEY` (see `.env.example`) to swap the offline heuristic for
the real LLM judge. Add an `APIFY_TOKEN` and set `CW_SCRAPER=apify` to firewall
live scrapes.

### Live real-scrape demo (the undeniable one)

```bash
npm run demo:url               # homedepot.com → HTTP 200 "success" that's really
                               #   a bot wall → Tier 1 trips on the content, run aborts
npm run demo:url -- cloudflare # yellowpages.com → 403 "Attention Required | Cloudflare"
npm run demo:url -- clean      # books.toscrape.com → real data, passes
npm run demo:url -- https://any-site.com   # scrape any URL through the firewall
```

This drives **`context-wall-real-actor`**, a deployed Apify actor that *actually
fetches the URL*. Anti-bot sites hand it a genuine block page — so the demo is a
real block in the wild, not a fixture we wrote. Needs `APIFY_TOKEN` +
`CW_SCRAPER=apify` + `APIFY_DEFAULT_ACTOR=polite_bedbug/context-wall-real-actor`.

### Live web dashboard (the judge-facing demo)

```bash
npm run dashboard       # → http://localhost:4000
```

Click a scenario and watch the firewall funnel light up in real time — rows
streaming in, the breaker tripping, and the **tokens / $ saved** counters. Toggle
**Mock ↔ Live Apify** to run against the real cloud actor. (Streamed over SSE
from `src/web/server.ts`; the page is `src/web/public/index.html`.)

---

## Architecture (the decisions)

### 1. Gateway Proxy, not a fork *(Task 1)*
ContextWall is a **standalone MCP server** that exposes one tool —
`scrape_validated` — which the buyer agent calls *instead of* the raw Apify
tool. Internally it drives the upstream scraper (Apify today, Firecrawl/Tavily
tomorrow) behind a single `Scraper` interface. Decoupled, vendor-agnostic, and
a cleaner demo story than patching one vendor's server.

### 2. Stream-and-judge, not buffer-then-check *(Task 2)*
A single `AbortController` governs the run. Its signal is threaded into the
scraper (so `.abort()` kills the **cloud container** and the local reader) and
into the Tier 2 call.

```
upstream rows ──stream──▶ Tier 1 (per item, ~ms, pure code) ──┐
                                                              ├─▶ deliver / TRIP BREAKER
            first N items ──▶ Tier 2 (LLM judge, concurrent) ─┘
```

- **Tier 1 — Mechanical:** Zod-style shape check + regex blocklist
  (`Cloudflare`, `CAPTCHA`, `Access Denied`, `Powered and protected by Privacy`,
  …). Reads the **content**, so it catches a block whether the page came back as
  `200` or `403`. Runs on **every** item the instant it arrives → fail-fast on
  the first poisoned row.
- **Tier 2 — Semantic:** one LLM call on the first `N` buffered items
  (default 3), running **concurrently** while more rows stream. Catches
  "asked for *delivery*, got *no delivery*".
- Whichever tier blocks first calls `controller.abort()` → the upstream job is
  killed **before it finishes billing**. The demo proves it: a hard-fail
  delivers 0 rows and stops the job after ~1 of 12 rows.

### 3. LLM stack: Gemini via `@google/genai` *(Task 3)*
Gemini 2.5 Flash-Lite with `responseSchema` + `responseMimeType:
application/json` → guaranteed, parse-free structured verdicts, generous free
tier, low latency. OpenRouter wired as an optional fallback. Keys you need:
`GEMINI_API_KEY` (aistudio.google.com/apikey) and `APIFY_TOKEN`
(console.apify.com/settings/integrations).

### 4. Demo harness *(Task 4)*
Two ways to drive the firewall:
- **Offline fixtures** — `src/mock/` streams three fixed scenarios row-by-row and
  honours `AbortSignal` exactly like the cloud client. The `hard` fixture mirrors
  the real thing: perfectly-shaped JSON whose *values* are block-page text — HTTP
  200, passes a naive schema check, 100% toxic. Deterministic, zero-cost, no
  network — the safe fallback for a live stage.
- **Real scrape** — `npm run demo:url` (`src/demo/runLiveUrl.ts`) drives the
  deployed `context-wall-real-actor` against a real URL. A bot-protected site
  returns a genuine block page (e.g. `homedepot.com` → HTTP 200 + "Powered and
  protected by Privacy"); Tier 1 trips on the **content** and aborts the cloud
  run. A real block in the wild, not a fixture.

The terminal dashboard (`src/demo/dashboard.ts`) renders the verdict, the
**rows-produced vs total** ratio (proof the breaker fired early), and
**tokens / $ saved**.

---

## File structure

```
src/
  index.ts              MCP server — exposes `scrape_validated`
  config.ts             env loading
  firewall/
    index.ts            stream-and-judge orchestrator + AbortController
    tier1.ts            mechanical: regex blocklist + shape check
    tier2.ts            semantic LLM judge (+ offline heuristic fallback)
    verdict.ts          shared verdict types
  providers/
    scraper.ts          Scraper interface (vendor-agnostic)
    apify.ts            live Apify adapter (polling stream + run.abort())
    llm.ts              Gemini structured-output client
  mock/
    fixtures.ts         clean / hard / soft scenarios
    mockActor.ts        streaming mock that honours AbortSignal
  demo/
    runDemo.ts          CLI demo runner
    dashboard.ts        terminal dashboard (tokens saved, circuit state)
  utils/tokens.ts       token estimator
```

## The agent experience (buy / don't-buy)

ContextWall is the tool a buyer agent calls **instead of** a raw scraper. The
agent hands over its **intent** + the **format** it needs (`requiredFields`), and
ContextWall returns either clean data (worth using/paying for) or a structured
rejection telling the agent *why not* — so it doesn't ingest garbage or re-pay
for a bad source.

### See it without setting up a client

```bash
npm run agent          # a simulated buyer agent talks to ContextWall over real MCP
npm run agent hard     # just one scenario
```

It spawns the MCP server, discovers `scrape_validated`, calls it with an
intent+format, and prints the agent's decision:

```
🤖 Agent goal: "Italian restaurants with delivery"  [scenario: hard]
   ◀ ⛔ circuit broken (tier1/blocklist_keyword): block-page signal "Cloudflare".
   🛑 Agent decision: DO NOT BUY / DO NOT INGEST — context protected, no tokens wasted.
```

### Wire it into a real LLM agent (Claude Desktop / Claude Code)

Claude Code:

```bash
claude mcp add context-wall -e GEMINI_API_KEY=... -e APIFY_TOKEN=... -e CW_SCRAPER=mock \
  -- npx tsx /ABSOLUTE/PATH/TO/context-wall/src/index.ts
```

Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "context-wall": {
      "command": "npx",
      "args": ["tsx", "/ABSOLUTE/PATH/TO/context-wall/src/index.ts"],
      "env": { "GEMINI_API_KEY": "...", "APIFY_TOKEN": "...", "CW_SCRAPER": "mock" }
    }
  }
}
```

Then just ask the agent to "find Italian restaurants with delivery" — it calls
`scrape_validated`, and on a bad source it receives the rejection and explains to
you why it won't use the data. (For a production build: `npm run build` and point
the client at `dist/index.js` with `node` instead of `npx tsx`.)
