# Interview fluency: your ideas in industry-standard terms

You can already explain these systems. This maps what you say to the **labels an interviewer is listening for**, so you never get tripped up. Study the middle column until it is reflexive, then use the phrasings at the bottom.

> Rule of thumb: lead with the standard term, then explain. "It's event sourcing — state is derived by replaying an append-only log" beats "it's a manifold where z derives from x and y." Keep your own vocabulary for your own thinking.

## Core architecture

| What you say / mean | Say this in an interview | One-line definition (and who uses it) |
|---|---|---|
| derive, never store; state from a seed + a log | **Event sourcing** | Store state-changing **events** as the source of truth; derive current state by replaying them. (Kafka, EventStoreDB, banking/ledger systems, git.) |
| the read side / current view | **CQRS** (Command Query Responsibility Segregation) | Separate the write side (commands → events) from read **models**. |
| z = derive(x, actions); folding the log | **Projection** (a read model), built by a **fold / reduce** | A projection derives a queryable view from the event log. |
| the action log | **Append-only log** / **event log** / **commit log** / **write-ahead log (WAL)** | An immutable, ordered record of events. (Kafka, Postgres WAL, git.) |
| step(state, action) → state | **Reducer** / **transition function** / **finite state machine (FSM)** | Pure function `(state, event) → state`. (Redux, Elm, state machines.) |
| collapse to one hash; address by content | **Content-addressable storage (CAS)** / **content addressing** | Address data by the hash of its bytes. (git, IPFS, Nix, Docker layers.) |
| hash-chained log; tamper-evident history | **Merkle tree / Merkle DAG**, **hash chain**, **cryptographic integrity** | Each entry's hash binds the previous; tampering is detectable. (git, blockchains, Sigstore, certificate transparency.) |
| same input → same output | **Determinism**, **reproducible builds**, **referential transparency**, **idempotency** | (Nix, Bazel, functional programming.) |
| one source of truth | **Single source of truth (SSOT)**, **declarative / derived state** | One authoritative source; everything else is derived. |
| the harness that wraps any reducer | **Middleware** / **adapter pattern** / **state container** / **runtime** | A reusable layer that adds capabilities around your logic. |
| lenses / projecting to artifacts | **Serializers / views / projections / codegen** | Transform the canonical model into output formats. |
| multiplayer "everyone sees the same board" | **Deterministic lockstep**, **rollback netcode**, **state synchronization**, **client-side prediction + reconciliation** | Game-networking patterns for consistent distributed state. |
| values with ancestry; nothing overwritten | **Immutable / persistent data structures**, **provenance**, **lineage** | Versions form a DAG; no destructive updates. |
| your whole approach, in one sentence | **A deterministic, event-sourced architecture with content-addressed, immutable state and replay** | This is your senior one-liner. |

Your private model maps cleanly: **x = state, y = event/command, z = next state**. So `z = f(x, y)` is just a **reducer / state-transition function**. Say "reducer."

## AI / ML infrastructure glossary (for an AI role)

| Concept | Standard term | What it is |
|---|---|---|
| feeding a repo/docs to a model | **Context engineering**, **RAG** (retrieval-augmented generation) | Assembling the right context for the model; retrieving relevant chunks from a store. |
| the store of vectors | **Vector database**, **embeddings**, **chunking** | Text → embedding vectors; retrieved by similarity. (Pinecone, pgvector, Weaviate.) |
| reusing identical context cheaply | **Prompt caching** | Providers bill cached, byte-identical context at a fraction of the rate. (Anthropic, OpenAI.) |
| pinning inputs so tests are repeatable | **Reproducible evaluations**, **eval harness** | Comparing model outputs against fixed inputs/criteria. |
| "what did the model see / do" | **Observability**, **tracing**, **data/model lineage**, **provenance**, **AI governance** | (LangSmith, Langfuse, OpenTelemetry for LLMs.) |
| agents that resume / replay reliably | **Durable execution**, **checkpointing**, **replay**, **agent trajectory** | (Temporal, DBOS, Inngest, LangGraph persistence.) |
| tools the model can call | **Function / tool calling**, **structured output**, **MCP (Model Context Protocol)** | How models invoke external tools and return typed data. |
| keeping a person in control | **Human-in-the-loop (HITL)**, **human oversight**, **guardrails**, **responsible AI** | |
| the model's input limit | **Context window**, **token budget**, **context compression** | |
| adapting a model | **Fine-tuning**, **RLHF**, **distillation** | |

## Describe your projects in standard terms (memorize these)

**KensGames.** "I built deterministic multiplayer netcode using an event-sourced architecture. Game state is a projection over an append-only command log, so every client replays the same events and converges on byte-identical state. It's essentially deterministic lockstep with content-addressed snapshots for verification, which eliminated the state-divergence bugs you get from ad-hoc mutation and reconciliation."

**ButterflyFx.** "A small event-sourcing runtime: you supply a reducer, and you get a content-addressed, hash-chained event log with deterministic replay. State is always a projection, never mutated in place, so it's reproducible and tamper-evident by design — the way git or an immutable ledger gives you integrity for free."

**bfx-ingest.** "A CLI that assembles deterministic, content-addressed LLM context from a codebase. It deduplicates by content hash to cut tokens, emits model-specific formats, and produces a reproducible root hash, so you can pin context for evals and maximize prompt-cache hits. Zero-dependency, tested, with CI across four Node versions."

## Interview question → answer (using your real work)

- **"How do you manage state in a distributed system?"** → "Event sourcing with CQRS. One append-only log is the source of truth; read models are projections. I used it for multiplayer game state so clients converge deterministically instead of fighting over mutable shared state."
- **"How do you make an AI pipeline reproducible and testable?"** → "Pin the inputs. I assemble context deterministically and content-address it, so an eval run is reproducible by hash, and identical context hits the prompt cache. That's what bfx-ingest does."
- **"How do you think about observability or auditability for AI?"** → "Provenance and lineage. A hash-chained, append-only record of exactly what entered the context, so you can prove what the model saw and detect tampering. It's the same integrity model as a Merkle log."
- **"Tell me about a hard bug."** → the multiplayer divergence: ad-hoc mutated state diverged across clients; you re-architected to event sourcing / deterministic replay so the bug class became impossible. (Senior signal: you fix classes of bugs, not instances.)

## "Why are you looking?" (keep it forward, give no reason for leaving)

Do not explain why you left. Volunteering a reason, even a fair one, only gives the interviewer something to probe or hold against you. Keep the whole answer positive and forward: a credential you earned, and the direction you are pursuing.

Say this, almost verbatim:

> "I'm pursuing a role where AI is central, because I'm convinced it's the future of software. In my last position I delivered U.S. Air Force systems and obtained a Secret security clearance. Now I want to bring that engineering into an AI-focused team full-time, and I've already taught myself the stack and shipped working tools to show it: a deterministic LLM-context CLI and a reproducible state runtime."

Short version: "I obtained a Secret clearance in my last role, and I'm now pursuing an AI-centric position because I believe AI is the future and I want to build with it full-time. I taught myself the stack and shipped real tools to prove it."

If they ask directly, "why did you leave?": keep it brief, neutral, and forward, with no reason and no grievance.

> "I decided it was the right time to commit fully to AI work, which is what I'm focused on now."

Then pivot to what you are looking for. Never describe conditions, management, or anything negative. One calm sentence, then forward.

Why it works: it leads with a credential (the clearance means you passed a federal investigation), states your direction, and is backed by shipped tools. It gives the interviewer nothing to dig into and everything to like.

## How to study this

Cover the right column and try to produce the standard term from your own phrasing. When you can do the whole core table reflexively and recite the three project blurbs cold, you will not get tripped up. You will sound like someone who has shipped this, because you have.
