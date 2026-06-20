# ContextWall — Teammate Setup

Everything you need to run ContextWall locally and contribute. Should take ~10 min.

## 1. Get the code

Two repos make up the project:

| Repo | What it is |
|------|------------|
| `context-wall-hackathon` | The firewall + MCP server + demos (this repo) |
| `Context-wall-mock-actor` | The Apify actor that produces the demo data |

Ask Shirley to add you as a **collaborator** on both (GitHub → repo → Settings → Collaborators), then:

```bash
git clone https://github.com/shirley-xue-2025/context-wall-hackathon.git
cd context-wall-hackathon
npm install
```

Requires **Node 20+**.

## 2. Run the demo OFFLINE first (no keys needed)

This proves your setup works with zero credentials — Tier 1 is pure code and Tier 2
falls back to a heuristic:

```bash
npm run demo            # all 3 scenarios
npm run demo:hard       # Cloudflare block  → Tier 1 trips at row 1
npm run demo:soft       # semantic mismatch → Tier 2 trips at row 3
npm run demo:clean      # genuine data      → passes
```

## 3. Add your own keys for the LIVE path

**Do NOT ask anyone for their `.env`.** Each person uses their own keys. Copy the
template and fill in your own:

```bash
cp .env.example .env
```

Then edit `.env`:

- **`GEMINI_API_KEY`** — get your *own* free key at <https://aistudio.google.com/apikey>.
  (Free tier is per-Google-account, so sharing one key would hit rate limits. Keep
  `GEMINI_MODEL=gemini-2.5-flash-lite` — it's free-tier friendly.)
- **`APIFY_TOKEN`** — your *own* personal token from the Apify **organization**:
  switch to the org account (top-left account switcher) → Settings → Integrations →
  copy your Personal API token. Each org member has their own; they are private.
- **`OPENROUTER_API_KEY`** — optional, leave blank.
- Set **`CW_SCRAPER=apify`** to use the live cloud actor (or `mock` for offline).

## 4. Run the LIVE demo (real scrape of a real URL)

Needs `APIFY_TOKEN`, `CW_SCRAPER=apify`, and
`APIFY_DEFAULT_ACTOR=polite_bedbug/context-wall-real-actor` in `.env`.

```bash
npm run demo:url               # homedepot.com → HTTP 200 "success" that's really a
                               #   bot wall → Tier 1 trips on content, run aborts
npm run demo:url -- cloudflare # yellowpages.com → 403 "Attention Required | Cloudflare"
npm run demo:url -- clean      # books.toscrape.com → real data, passes
npm run demo:url -- https://any-site.com   # any URL
```

This actually fetches the URL via the deployed `context-wall-real-actor`. A
bot-protected site returns a genuine block page — a real block, not a fixture.
Keep the **Apify console → Runs** tab open — you'll watch the run flip to
**ABORTED** in real time when the breaker trips.

> ⚠️ Anti-bot protection drifts, and the actor runs from a **datacenter IP**
> (different responses than your laptop). Before a live demo, re-verify the
> blocked URLs from the cloud, not locally.

**To show Tier 2 (the LLM judge) live**, use the semantic-mismatch scenario —
data that's clean but wrong-for-the-intent, which only the LLM catches. Set
`GEMINI_API_KEY` and run `npm run demo:soft` (or flip the dashboard to that
scenario). Tier 1's block cases above don't exercise the LLM.

## 5. The web dashboard (best for showing people)

```bash
npm run dashboard      # → http://localhost:4000
```

Click **Clean / Hard / Soft** and watch the funnel (Upstream → Tier 1 → Tier 2 →
Agent) light up live, with tokens/$ saved counters. The **Mock ↔ Live Apify**
toggle switches between bundled fixtures and the real cloud actor. Mock works
with zero keys; Live needs `APIFY_TOKEN`, and the real LLM judge needs
`GEMINI_API_KEY` (otherwise Tier 2 degrades to the heuristic).

## 6. Use it as an MCP server

```bash
npm run build
# register dist/index.js as an MCP stdio server in your agent client,
# with GEMINI_API_KEY / APIFY_TOKEN in its environment.
```

The server exposes one tool: `scrape_validated`.

## Working on the Apify actors

There are two actors. The **real actor** (`context-wall-real-actor`) powers the
live demo — it actually scrapes URLs. The **mock actor** (`context-wall-mock-actor`)
streams fixed fixtures. Both deploy the same way:

```bash
cd <actor-dir>                         # e.g. Context-wall-real-actor
npm install
node src/main.js                       # quick local sanity run

# deploy to the Apify org:
npx apify-cli login -t <YOUR_APIFY_TOKEN>
npx apify-cli push                     # uploads source + builds in the cloud
```

`apify push` uploads the source directly — **no GitHub repo or deploy key
required** (GitHub-linked builds failed before on a private repo with no key).

> The real actor's source lives in a plain folder, not (yet) a git repo. `apify
> push` keeps the built image, but keep the source backed up — a repo is
> recommended for history, not required to deploy.

## Layout cheat-sheet

```
src/firewall/index.ts   stream-and-judge orchestrator + AbortController  ← the core
src/firewall/tier1.ts   mechanical regex/shape checks (per-item, ~ms)
src/firewall/tier2.ts   semantic LLM judge (+ offline heuristic)
src/providers/apify.ts  live Apify adapter (polling stream + run.abort())
src/providers/llm.ts    Gemini structured-output client
src/mock/               offline fixtures + streaming mock scraper
src/demo/               runDemo.ts (offline) · runLiveUrl.ts (live real scrape) · dashboard.ts
```
