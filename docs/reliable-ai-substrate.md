# Reproducible by construction: a deterministic substrate for reliable AI systems

*Draft narrative — first person, for Kenneth to edit. Personal-origin lines are marked `[fill]`.*

Modern AI systems are powerful and unreliable in the same breath. The same prompt returns different output. A pipeline that worked yesterday cannot be reproduced today. Nobody can say exactly what context the model saw. Evals drift because the inputs were never pinned. We have spent two years making the models smarter and almost no time making the **systems around them** trustworthy.

That gap — reproducibility, provenance, determinism — is the layer I build. Here is where the approach came from and why it lands squarely on the hardest current problems in AI infrastructure, not the legacy ones.

## Where it came from

`[fill: the honest origin — what were you building when you kept hitting the wall? real-time multiplayer where clients diverged? a system whose state you could never reproduce to debug? Tell that story in 3–4 sentences.]`

The wall was always the same one: **state that is mutated in place cannot be reproduced, replayed, or trusted.** The moment you store and mutate, you have lost the ability to answer "how did we get here," and in a distributed or probabilistic system that question is everything. The way out turned out to be a single discipline — **derive, never store**: keep one source of truth (a seed and an ordered log of what happened), and compute every state as a pure function of it. Nothing is materialized that cannot be recomputed; nothing is mutated that cannot be replayed.

I formalized that into a small model I use across everything I build: an identity `x`, a query `y` (what you are asking of the system), and a derived state `z = f(x, y)`, where each result becomes the next identity. The vocabulary is mine and it stays internal — what matters is the property it guarantees: **two observers with the same inputs derive the same state, every time, on any machine.** There is nothing to reconcile because there is nothing to diverge.

## Why this is the forward layer for AI infrastructure

These are not abstract virtues. Each one maps to a problem the AI industry is actively spending money and engineering hours on right now:

- **Reproducible evaluations.** Evals are only as trustworthy as their inputs are pinned. When context is a deterministic derivation with a content hash, an eval run is reproducible by construction — same hash, same context, same comparison. No drift.
- **Prompt caching is real money.** Anthropic and OpenAI both bill cached context at a fraction of the rate. Caches hit on **byte-identical** input. Deterministic, content-addressed context assembly maximizes cache hits — lower cost and lower latency, for free, as a property of the architecture.
- **Provenance and governance.** "What code and data did this model see?" is becoming a compliance and security requirement, not a nicety. A hash-chained, content-addressed record answers it verifiably: you can prove exactly what entered the context, and detect if the record was altered. AI lineage tooling is nascent; this is the substrate it needs.
- **Agent state and replay.** Agentic systems are converging on durable, replayable execution (the Temporal / DBOS / durable-workflow pattern, applied to agents). An agent's trajectory **is** an action log; deterministic replay gives you debugging, time-travel, and eval over real runs instead of re-rolling nondeterministic ones.
- **Context and token efficiency.** Content-addressing deduplicates identical files, blocks, and retrieved chunks before they ever reach the window. On a real codebase or RAG corpus that is a direct token — and dollar — saving, and it is measurable.

The through-line: the failure mode of today's AI stack is **scattered, mutable, unreproducible state**. The fix is the one I have been building toward for years — a single derived source of truth with verifiable lineage. The primitives underneath (event sourcing, content-addressing, deterministic replay) are mature and battle-tested, and that is the point: the foundation is solid, and the frontier is **applying it where AI tooling currently does not.**

## Proof, not promise

I do not ask anyone to take this on faith — every piece runs:

- **Deterministic multiplayer netcode** (KensGames): game state derived from a seed and action log, so every client computes a byte-identical board. The class of "everyone sees a different game" bugs cannot occur.
- **A reproducible state engine** (ButterflyFx): wrap any reducer and get content-addressed, hash-chained, tamper-evident, deterministic state — reproducibility and audit as architectural properties, with tests proving each.
- **An AI context tool** (bfx-ingest): turns any codebase into deterministic, deduplicated, model-shaped LLM context with a reproducible root hash — built for exactly the eval/caching/provenance needs above. Tested, CI across four runtimes.

## The honest framing

This is not new mathematics and it is not magic, and I will not pretend otherwise. It is a rigorous, opinionated application of proven primitives to the reliability problems that modern AI infrastructure has not yet solved. That is the work I want to do: making AI systems reproducible, auditable, and efficient by construction — so that as the models get more capable, the systems around them get more trustworthy instead of less.

---

*`[fill: a one-line close + your contact / links.]`*
