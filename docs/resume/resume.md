# Kenneth W. Bingham
AI Engineer | Full-Stack | Backend & Platform Engineer
Kaysville, UT | ken.bingham64@gmail.com | linkedin.com/in/kenneth-bingham-11378b10 | github.com/kenbin64

## Summary
Software engineer with 10+ years building reliable systems end to end. Full-stack from database to cloud deploy, with 4 years building and running Azure DevOps CI/CD pipelines. Experience across regulated, high-stakes domains: fintech (financial-data aggregation, core credit union banking), healthcare and insurance, fleet payments, and U.S. Air Force systems, with a held Secret security clearance. Focused on the reliability layer around large language models: deterministic pipelines, evaluation harnesses, structured-output validation, and cost-aware model routing. Comfortable owning a problem from architecture through production deployment, with a track record of shipping tested, reproducible systems. Seeking an AI engineering or backend/platform role where reliability and cost-efficiency matter.

## Highlights
- **Built a complete credit union core banking and teller platform**, software capable of running an entire credit union's day-to-day operations end to end.
- **Delivered mission-critical U.S. Air Force systems** for aircraft-parts test and maintenance tracking, replacing an aging legacy platform; obtained a U.S. Air Force Secret security clearance.
- **Built financial-data aggregation** that derives insight from bank accounts, financial records, and public data, well beyond a standard credit report.
- **Cut repeated LLM input cost by roughly 85% in a typical iterative session** through deterministic, cacheable context (bfx-ingest), proven by a reproducible benchmark.
- **Eliminated an entire class of multiplayer state-divergence bugs** by re-architecting to event-sourced, deterministic netcode.
- **4 years building and running Azure DevOps CI/CD pipelines**, full-stack from database to cloud deploy.

## Core Skills
**Languages:** JavaScript / TypeScript, Python, SQL, C# / .NET, Java, GLSL
**Front-end:** Angular, React, WebGL2, HTML / CSS
**AI / LLM:** LLM integration, RAG, prompt engineering, evaluation harnesses, structured outputs, tool / function calling, model routing, prompt caching, token budgeting
**Backend & Infra:** Node.js, Express, REST, WebSockets, PostgreSQL, SQL Server, SQLite, Linux, nginx, Docker, PM2, zero-downtime deploys
**CI/CD & Cloud:** Azure DevOps pipelines (4 years), GitHub Actions, Azure
**Practices:** Event sourcing, content-addressed storage, deterministic replay, automated testing, observability

## Selected Engineering Projects

### bfx-ingest - Deterministic LLM Context Tool (Open Source)
- Built a zero-dependency CLI that assembles deterministic, content-addressed context from a codebase, deduplicating by content hash to cut token usage and produce a reproducible root hash for pinned evals and prompt-cache hits.
- Emits model-specific formats (Markdown / XML / JSON) with token estimates; covered by automated tests with CI across four Node.js versions; MIT licensed.

### Zero-Downtime Deployment System
- Designed an atomic, content-addressed release pipeline: each deploy is hashed into a verifiable manifest, promoted by an atomic symlink swap, health-checked, and automatically rolled back on failure.
- Replaced in-place rsync deploys (which left the site broken on partial failure) with immutable releases and one-command rollback; integrated with GitHub Actions CI/CD across multiple domains.

### Deterministic Multiplayer Game Platform - KensGames
- Built real-time multiplayer netcode using event sourcing: game state is derived from a seed and an append-only command log, so every client replays identical events and converges on byte-identical state, eliminating an entire class of state-divergence bugs.
- Full-stack ownership: WebGL2 / Three.js rendering, Node.js / WebSocket backend, deployed and operated on a self-managed Linux VPS.

### ButterflyFx - Reproducible State Runtime (Open Source)
- Built a small event-sourcing runtime that wraps any reducer to provide content-addressed, hash-chained, tamper-evident state with deterministic replay, making reproducibility and auditability architectural properties; each property covered by tests.

## Experience

### Independent Software Engineer | 2020 - Present
- Designed and shipped end-to-end systems solo: a deterministic multiplayer platform, a reproducible CI/CD deployment pipeline, and open-source developer tools (see projects above).
- Concentrated on the reliability, reproducibility, and cost-efficiency of LLM-backed systems.

### Software Developer | Systems Implementers | [FILL: dates]
- Built and modernized a U.S. Air Force system for tracking aircraft-parts testing, maintenance, replacement, and test results and procedures, replacing an aging legacy platform.
- Drove user adoption by redesigning a highly functional but dated interface with modern iconography and visual design, which proved instrumental to adoption.
- Built a CRM for tracking hazardous waste; held a U.S. Air Force Secret security clearance.

### Portal & CRM Developer | WEX | [FILL: dates]
- Owned the customer portal and CRM for a fleet fuel-card platform managing trucker fuel cards and fuel-usage tracking.

### Software Developer | [Credit union core banking platform - confirm employer] | [FILL: dates]
- Full-stack development on a comprehensive credit union core banking and teller system supporting end-to-end credit union operations.

### Software Developer | Finicity [confirm] | [FILL: dates]
- Built financial-data aggregation that analyzed bank accounts, financial records, and public records to derive insight beyond a standard credit report.

### Software Developer | [Insurance / healthcare employer - confirm] | [FILL: dates]
- Developed and deployed in-house insurance and healthcare applications, including healthcare data interoperability (FHIR).

## Conceptual Initiatives
Independent research in geometric and representation-based computation:
- **Dimensional programming / manifold-as-data**: deriving state and structure from low-dimensional latent representations and a shared seed, the same intuition as the manifold hypothesis, embeddings, and autoencoders. The design lens behind the deterministic, reproducible systems above (event-sourced netcode, content-addressed tooling).

## Practical Applications
What these systems make possible, each demonstrated in the projects above:
- Reproducible AI evaluations (exact context pinned by hash) and major LLM cost savings (byte-identical context maximizes prompt-cache hits).
- Provable AI provenance and tamper-evident records (hash-chained history where altering the past is detectable).
- Zero-divergence distributed and multiplayer state from a single shared seed; time-travel debugging and instant, self-healing deploys.

## Interests
Drummer, singer, and acrylic painter; independent researcher.

## Education
### [FILL: Degree or relevant coursework] | [FILL: School] | [FILL: year]
