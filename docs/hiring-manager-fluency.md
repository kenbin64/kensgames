# Hiring-manager fluency: cracking the AI engineering screen

You already cracked the technical vocabulary ([interview-fluency.md](interview-fluency.md)).
That gets you through the conversation. This gets you *into* it. Different
audience, different language.

The technical doc taught you to talk to **the curious**. This one teaches you to
talk to **the skeptic with a budget and forty resumes to read before lunch.**
They are not trying to understand your worldview. They are trying to reject you
quickly so they can stop reading, and only the resumes that survive that reflex
get a call. Your job is to not give them a reason.

---

## The five questions in their head

A hiring manager skimming an AI engineer resume is silently asking five things.
Every strong bullet answers one of them with something they can verify. Every
weak bullet answers none.

1. **Can you build a reliable system around an unreliable model?**
   This is *the* AI-engineering skill in 2026. The model is nondeterministic;
   the system around it must not be. Evals, retries, fallbacks, schema-validated
   outputs, guardrails, timeouts. This is your single strongest area, and your
   current resume barely says it in their language.

2. **Do you understand cost and latency?** Frontier tokens cost money and time.
   Routing cheap calls to cheap models, prompt caching, token budgeting,
   batching. A senior AI engineer is trusted with the bill. Signal that you
   think about it.

3. **Have you shipped to real users, in production?** This is your weakest
   signal and the one they weight most. "Portfolio project" reads as "never
   survived contact with real traffic." You cannot fully fake this, but you can
   close the gap (see below).

4. **Can you measure quality instead of vibes?** "It works well" is a junior
   answer. "I built an eval set of N cases and tracked pass rate across model
   versions" is a senior one. Measurement is the seniority tell.

5. **Will your code be a liability?** Tested, documented, maintained, readable.
   Your public repos with green CI answer this *before* the interview. Use them.

If a bullet on your resume answers none of these five, cut it.

---

## What the role actually is (and your fit)

"AI Engineer" in 2026 is three different jobs wearing one title. Know which one
each posting means, because it changes how you order your resume.

| Flavor | What they do | Your fit |
|---|---|---|
| **LLM Application / AI Engineer** | Build products *on* LLMs: RAG, agents, tool-calling, prompt + eval pipelines, latency/cost tuning. Not training models. | **Strong.** This is the bullseye. Most common posting. |
| **AI Platform / Infra** | Inference serving, eval infrastructure, observability, the reliability layer under the models. | **Strong.** Your deterministic-substrate, content-addressed deploy, reproducibility work lands here. |
| **ML Engineer** | Train and fine-tune models, data pipelines, MLOps. | Weaker. Don't lead here unless the posting demands it. |

Lead with the first two. They are where your real, verifiable work lives.

---

## Red flags that auto-reject (and which you've been hitting)

These are reflex rejections. The reader does not deliberate; they move on.

- **"A paradigm I developed."** Inventing a framework/paradigm with no adoption,
  papers, or citations reads as not-invented-here and grandiosity, not brilliance.
  Senior engineers are trusted *because* they reach for proven tools first. Cut it.
- **Private jargon** ("directive engineering," "Russian Doll containment,"
  "sovereign over rented"). Reads as someone who will not integrate with the
  team's existing stack and language. Translate every term to standard.
- **Inflated self-title over an empty history.** "AI Systems Architect" above
  `[Previous Employment]` placeholders reads as unemployment in costume. A
  modest accurate title over concrete bullets beats a grand title over blanks.
- **Buzzword soup with no specifics or numbers.** "Leveraged cutting-edge AI to
  drive synergies." Says nothing. They can't verify it, so they discount it.
- **Claims of provability/perfection.** "Behavior is provable, not hoped-for"
  with nothing next to it reads as overconfidence. Show the mechanism instead:
  "schema-validated outputs with a verifier pass, so malformed model output
  never reaches the next stage."

---

## The bullet formula

Every resume bullet, same shape:

> **[Strong verb] [system you built] [with standard tech] that [measurable
> outcome or capability], [the notable engineering decision].**

Action, substance, standard tools, impact, judgment. No adjectives doing the
work that facts should do.

### Your real work, reframed in their language

Same projects you already have. Rewritten so a skeptic leans in instead of
bouncing. Fill the `[N]`/`[X]` with real numbers wherever you can; even rough
ones beat none.

- **Built a deterministic multiplayer game engine** where state is derived from
  a seed and an append-only command log, so every client replays identical
  events and converges on byte-identical state, eliminating an entire class of
  state-divergence bugs. *(Event sourcing + deterministic lockstep. Answers Q1, Q4.)*

- **Designed a zero-downtime deployment system** with atomic, content-addressed
  releases and health-gated automatic rollback: each release is hashed into a
  verifiable manifest, promoted by atomic symlink swap, and reverted
  automatically if post-deploy health checks fail. *(Real infra. Answers Q3, Q5.)*

- **Built an LLM context tool** (`bfx-ingest`, open source) that assembles
  deterministic, content-addressed context from a codebase, deduplicating by
  hash to cut tokens and produce a reproducible root hash for pinned evals and
  prompt-cache hits. Tested, CI across four Node versions. *(Answers Q2, Q4, Q5.)*

- **Designed a model-routing layer** that pre-filters requests with cheap
  heuristics and constraint checks before escalating to a frontier model, so
  premium tokens are spent only where premium reasoning is required. *(Cost/latency.
  Answers Q2. Note: drop the "Schwarz Diamond" framing; describe the routing logic plainly.)*

- **Built an event-sourcing runtime** (`ButterflyFx`, open source) that wraps any
  reducer to give content-addressed, hash-chained, tamper-evident state with
  deterministic replay, making reproducibility and audit architectural
  properties rather than afterthoughts. Each property covered by tests. *(Answers Q4, Q5.)*

Notice what changed: no paradigm, no coined terms, every line names a standard
pattern and a verifiable outcome. The work was always good. The framing was
hiding it.

---

## The self-employed gap: frame it honestly and strong

Do not hide it and do not inflate it. The honest senior framing:

> **Independent engineering, 2020 to present.** Designed and shipped end-to-end
> systems solo: a deterministic multiplayer platform, a reproducible deployment
> pipeline, and open-source developer tools (links). Deep focus on reliability,
> reproducibility, and cost-efficiency of LLM-backed systems.

Then let the repos and live sites carry the proof. "Solo, end-to-end, here is
the running code" is a real strength: it says you can own a problem from nothing
to production. The weakness it cannot cover is *real users at scale*, so do not
claim that; claim what is true and let it be strong on its own.

---

## Close the production gap (do this, it is worth more than resume edits)

The one thing that would most move you from "interesting" to "hire": evidence of
something running in production that you can point to with a number. You are
closer than you think.

- Put a **live URL** on each project (you have the VPS). "Running here" beats
  "built this."
- Add a tiny **eval harness** to one LLM project and report a real number:
  "47-case eval set, 91% pass rate, tracked across model versions." That single
  line answers the seniority question better than a paragraph of adjectives.
- Add **CI badges** and a **one-command run** (`npx ...`) to each repo README.
  Friction-free verification is what a skimmer rewards.

---

## The funnel: who reads what

- **Recruiter screen (30 seconds, non-technical).** Matches keywords to the job
  description. Make sure the standard terms from the posting literally appear:
  RAG, evals, LLM, Python, production, CI/CD. No jargon they can't match.
- **Hiring-manager screen (2 minutes, technical).** Runs the five questions.
  Skims for specifics, numbers, and links. Clicks one repo if you make it easy.
- **Interview.** Now [interview-fluency.md](interview-fluency.md) takes over: lead
  with the standard term, then explain the real depth underneath.

Three audiences, one rule: **say the verifiable thing in the standard word.**
You have the verifiable things. This is just learning to point at them in the
language the reader is already listening for.
