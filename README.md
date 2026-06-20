# ContextWall 🧱

A data firewall for AI agents. Web scrapes fail silently ~5% of the time and
return HTTP 200 with block-page junk wrapped in clean JSON; agents ingest it,
hallucinate, and waste tokens. ContextWall sits in the MCP tool layer, validates
scraper output, and trips a circuit breaker on toxic data.

Hackathon project — WIP.
