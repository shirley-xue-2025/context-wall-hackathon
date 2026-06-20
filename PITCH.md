# ContextWall — The Pitch (non-technical)

For explaining ContextWall to anyone — judges, investors, a friend — without
touching the implementation. Two lengths.

---

## 30-second version (elevator)

> AI agents are starting to buy data and act on it on their own. But web
> scraping silently fails about 1 in 20 times — and when it does, it hands back
> an error page disguised as real data. The agent can't tell, so it makes bad
> decisions *and* pays to process garbage. **ContextWall is a quality checkpoint
> between the agent and its data sources.** It inspects every result, blocks the
> fakes before they reach the agent, and cancels the purchase the instant it
> spots trash — protecting the agent's judgment and its wallet at the same time.
> One firewall, any data source.

---

## 3-minute version (spoken script)

**The hook**
AI agents are starting to do real work on their own — researching, comparing
prices, gathering information across the web. To do that, they *buy* data from
automated web scrapers. But here's the dirty secret of web scraping: about 1 in
20 times, it silently fails. A website blocks it, or throws up a "prove you're
human" check, or a login wall. And instead of admitting failure, the scraper
hands back an official-looking "success" that's really just the error page
dressed up to look like data.

**Why it matters**
The agent can't tell the difference. So it does two expensive things. First, it
feeds that garbage straight into its own reasoning and starts making decisions
based on nonsense — wrong answers, delivered with total confidence. Second, it
pays *real money* to read and process that garbage, and it already paid for the
failed data in the first place. At the scale agents are heading toward —
thousands of these transactions an hour, around the clock — that's a flood of
bad decisions and a constant, invisible leak of money. And right now, nobody is
checking the quality of what these agents consume.

**What we built**
ContextWall is a quality checkpoint that sits between the agent and whatever
it's buying data from. Think of it as a bouncer for the agent's brain. Before
any data is allowed in, ContextWall inspects it and asks two questions: *Is this
actually real data, or is it a disguised error page?* And: *Does it actually
match what the agent asked for?* — because sometimes the data is genuine but
it's the wrong thing entirely. Like asking for "restaurants that deliver" and
getting back "restaurants that don't."

**The moment that lands**
If the data is bad, ContextWall does two things instantly. It blocks it — the
agent never sees the garbage, so its thinking stays clean. And it pulls the plug
on the purchase mid-transaction — it tells the scraper to stop *before* it
finishes the job, so the spending stops the second trouble is detected. In our
demo, when a scrape hits a block, we catch it on the very first row and shut the
whole thing down — over 90% of the wasted work and cost, gone.

**Why it's different**
And it's universal. It doesn't matter which scraping service the agent uses —
ContextWall wraps any of them behind one quality standard. One firewall, any
source.

**The close**
We're entering an economy where AI agents transact on their own, constantly.
That only works if the data flowing between them can be trusted. ContextWall is
that trust layer — it protects an agent's judgment and its budget at the same
time. It's the seatbelt for autonomous data.

---

## Handy lines & analogies (grab-bag)

- *"It's a bouncer for the agent's brain."*
- *"It's the seatbelt for autonomous data."*
- *"Imagine an assistant who, 1 in 20 trips, brings back a photo of a 'Closed'
  sign but swears it's your groceries — and you cook with it anyway."*
- The killer stat: *"We catch the bad scrape on the first row and kill the job —
  over 90% of the cost, gone."*
- The two failure modes in plain words: *"Garbage that looks real"* (a disguised
  error page) and *"real but wrong"* (the opposite of what was asked).
