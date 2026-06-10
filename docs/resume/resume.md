# Kenneth W. Bingham
AI Engineer · Backend & Platform Engineer · Full-Stack
United States · Mountain Time · Open to hybrid and remote
801-425-2652 · ken.bingham64@gmail.com · linkedin.com/in/kenneth-bingham-11378b10 · github.com/kenbin64

## Summary
Software engineer with 10+ years building reliable systems end to end across regulated, high-stakes domains: U.S. Air Force programs (held a Secret clearance), healthcare and insurance, fintech, and fleet payments. Beginning August 2025, on my own initiative, I committed to AI engineering in depth, well beyond day-to-day use: how large language models actually work, and how to make them reliable through operating directives and geometric representation. I architect and ship real systems with measured results, full-stack from database to cloud deploy, and I prove my work with tests and reproducible numbers. Seeking an AI engineering or backend / platform role where reliability and cost-efficiency matter.

## Core Skills
**Languages:** Python, JavaScript / TypeScript, C# / .NET, Java, SQL, GLSL
**AI / LLM:** LLM integration, RAG, prompt engineering, evaluation and verification harnesses, structured / JSON outputs, tool and function calling, model routing, prompt caching, token budgeting, hallucination reduction; self-hosted local models (Llama, Qwen, DeepSeek, Mistral, Phi-3) via Ollama and LM Studio
**Backend & Infra:** Node.js, Express, Spring Boot, REST APIs, microservices, WebSockets, PostgreSQL, SQL Server, Oracle, MySQL, SQLite, Linux, nginx, Docker, PM2, zero-downtime deploys
**CI/CD & Cloud:** Azure DevOps pipelines, GitHub Actions, Azure, automated testing, observability
**Front-end & 3D:** Angular, React, WebGL2, Three.js, HTML / CSS
**Practices:** Event sourcing, content-addressed storage, deterministic replay, test automation, HL7 / FHIR healthcare interoperability, secure SDLC in cleared environments

## Selected Achievements
- **Cut repeated LLM input cost by roughly 85% in a typical iterative session** through deterministic, cacheable context, proven by a reproducible benchmark (bfx-ingest).
- **Took unsupported, hallucinated model output from about 39% to 0%** by wrapping generation in a deterministic verifier, while best-of-N kept the answer rate high.
- **Eliminated an entire class of multiplayer state-divergence bugs** by re-architecting to event-sourced, deterministic netcode that replays byte-identical state from one seed.
- **Shipped a water-system telemetry and compliance platform covered by 123 deterministic automated tests**, with a signed go-live gate and a tamper-evident audit trail.
- **Delivered mission-critical U.S. Air Force systems** for aircraft-parts test and maintenance tracking, replacing an aging legacy platform; held a U.S. Air Force Secret clearance.
- **Built a credit-union core banking and teller platform** capable of running a credit union's day-to-day operations end to end.

## Professional Experience

### Software Developer · DTSI
Apr 2024 to Present · Hill Air Force Base, UT
- Modernize mission-critical U.S. Air Force systems in Java, .NET, and SQL Server under strict DoD change control.
- Build deterministic test harnesses that reduce regression risk across legacy workflows.
- Operate in cleared, high-security environments.

### Software Developer · Humana
Feb 2022 to Jan 2024 · Remote
- Developed .NET 6 services and HL7 / FHIR healthcare-interoperability pipelines, and optimized SQL.
- Built Python ETL automation and Linux admin workflows that cut manual cycles.

### Software Developer · Systems Implementers
Apr 2021 to Dec 2021 · Hill Air Force Base, UT
- Built Java and Spring Boot services for aircraft-parts test, maintenance, and asset tracking, replacing an aging legacy platform.
- Redesigned a dated but highly functional interface with modern iconography and visual design, which proved instrumental to user adoption.
- Built a CRM for hazardous-waste tracking; held a U.S. Air Force Secret clearance.

### Software Developer · Gwinnett County School District
Feb 2020 to Aug 2020 · Georgia
- Built automated test frameworks in Java and Selenium, improving QA coverage.

### Software Developer · Norfolk Southern Railroad
Aug 2019 to Jan 2020 · Atlanta, GA
- Improved locomotive-optimization software and handled real-time data processing.

### Software Developer · Finicity (via STG)
Nov 2017 to Aug 2018 · Murray, UT
- Built Java financial-data aggregation and secure API integrations, deriving insight from bank accounts, financial records, and public data beyond a standard credit report.

### Java Programmer · WEX
Feb 2017 to Sep 2017 · Ogden, UT
- Owned the customer portal and CRM for a fleet fuel-card platform (trucker fuel cards and fuel-usage tracking); delivered enterprise web portals and document-management workflows.

### Java Programmer · CUProdigy
Apr 2015 to Feb 2017 · Utah
- Full-stack development on a credit-union core banking and teller system (Java, Spring, Hibernate, MySQL) supporting end-to-end credit union operations.

## Self-Directed AI Engineering (Aug 2025 to Present)
On my own initiative and outside of employment, I committed to AI engineering in depth. I did not learn it on a job; I sought out not only how to use large language models but how they work internally and how to optimize them. I get reliable output from stock models by directing them with explicit operating directives that demand proof and reject unverified claims, the same discipline that took a verifier's hallucinated output from about 39% to 0%. I architected and built real, tested systems with this approach (below), and I developed an original framework, dimensional programming, built on z = x · y as an organizing manifold and exploring Fibonacci-based dimensional dynamics, with each idea demonstrated in a working tool and each claim labeled by how well it is supported. This self-directed work is the core of what I bring to an AI role.

## Independent Engineering Projects
Personal projects built end to end to demonstrate the work. Each one runs, is tested, and carries a real number or a live link.

### bfx-ingest · Deterministic LLM Context Tool (Open Source, MIT)
Zero-dependency CLI that assembles deterministic, content-addressed context from a codebase, deduplicating by content hash to cut token usage and produce a reproducible root hash for pinned evals and prompt-cache hits. Emits model-specific formats (Markdown / XML / JSON) with token estimates; covered by automated tests with CI across four Node.js versions.

### The Conduit · Water-System Telemetry and Compliance (Live: theconduit.me)
A telemetry, health-monitoring, and compliance platform that scores one health number per station, gates real-time operation behind a signed go-live authorization, and keeps a tamper-evident audit trail. Dependency-free JavaScript with a 3D network view; 123 deterministic automated tests.

### KensGames · Deterministic Multiplayer Platform (Live: kensgames.com)
Real-time multiplayer netcode using event sourcing: state is derived from a seed and an append-only command log, so every client replays identical events and converges on byte-identical state. Fast Track, a rules-engine board race, verifies 503 legal paths with 0 teleports. Full-stack: WebGL2 / Three.js rendering, Node.js / WebSocket backend, self-managed Linux VPS.

### Hallucination Verifier (Open Source)
A deterministic verifier wrapped around generation: candidates are checked and unverifiable ones rejected, taking hallucinated output from about 39% to 0% while best-of-N keeps the answer rate high. Standard library only, measured and reproducible.

### ButterflyFx Runtime · Reproducible State (Open Source)
A small event-sourcing runtime that wraps any reducer to give content-addressed, hash-chained, tamper-evident state with deterministic replay, making reproducibility and auditability architectural properties. Each property covered by tests.

### Zero-Downtime Deployment System
Atomic, content-addressed releases: each deploy is hashed into a verifiable manifest, promoted by an atomic symlink swap, health-checked, and automatically rolled back on failure, with one-command manual rollback. Serves the live sites above across multiple domains.

## Independent Research
Geometric and representation-based computation (dimensional programming / manifold-as-data): representing data as derivable geometry so localized context is computed on demand instead of stored or re-sent. The same intuition as the manifold hypothesis, embeddings, and autoencoders, and the design lens behind the deterministic, reproducible systems above. Demonstrated, not only theorized: a dependency-free API (dp.js) measures a roughly 99.7% token reduction answering localized questions over a large nested structure, and the verifier above turns the idea into a measured drop in hallucination. Published openly at dimensionalprogramming.com, with each claim labeled by how well it is supported.

## Education
B.S., Computer Science and Software Engineering

## Interests
Drummer, singer, and acrylic painter; independent researcher.
