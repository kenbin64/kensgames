# bfx-ingest: real numbers on a real codebase

*A [ButterflyFx](https://butterflyfx.us) tool.*


A measured, reproducible look at what `bfx-ingest` actually does on a real
project, not a pitch. Every figure below was produced by running the tool and
the included [bench.js](bench.js) on this repository. Character, file, and
duplicate counts are **exact**. Token and dollar figures are **labelled
estimates** (the standard chars/4 heuristic at typical posted pricing). Re-run it
yourself and check.

## The task

Feed a real, messy, multi-project codebase (a 1,593-file game portal) to an LLM
as context. The manual way is to hand-pick and paste files: slow, incomplete,
error-prone, and different every time. The question is what a deterministic
ingest tool saves you, in numbers.

## What I ran

```bash
node bench.js ..          # the whole repo
node bench.js ../server   # one real Node service inside it
node bfx-ingest.test.js   # the test suite
```

## Results (measured)

| Target | Files | Exact duplicates | Characters | Est. tokens | Root hash |
|---|---:|---:|---:|---:|---|
| Full repo | 1,593 | 103 | 18,207,681 | ~4,551,921 | `de893aba` |
| `server/` service | 56 | 0 | 723,549 | ~180,888 | `f648944b` |

Est. cost to send the full repo once, at typical posted input pricing:
**~$2.28** (budget, $0.50/M) · **~$13.66** (frontier, $3/M) · **~$68.28**
(premium, $15/M).

## The four wins, each with its number

**1. Automation: 1,593 files into one artifact, in one command.**
What was manual copy-paste across 1,593 files and 18.2 million characters becomes
a single deterministic command. Nothing forgotten, nothing pasted twice, no
manual labor. This is the everyday productivity win and it is total.

**2. Token visibility before you spend a token.**
The tool reported the full repo as **~4.55M tokens**. That instantly tells you it
will not fit a 200k context window, so you scope it down *before* wasting a call
or hitting a wall mid-conversation. Knowing the size up front is the difference
between one clean call and several failed ones.

**3. Determinism, verified, not claimed.**
Ingesting `server/` twice produced the **identical root hash `f648944b`** both
times. Same input always yields the same bytes and the same hash, on any machine.
That is what makes the context **reproducible for evals** (pin the exact context a
result came from) and **cacheable** (next point).

**4. Dedup: measured and honest.**
On this repo it found and collapsed **103 exact-duplicate files**, removing
65,779 characters: **0.4%** here. It is modest on a clean repo and larger on
heavily vendored or monorepo trees. The tool tells you the real number instead of
promising a big one.

## The recurring win: deterministic context makes prompt caching pay

The single biggest cost saver is not dedup, it is **prompt caching**, and
determinism is what unlocks it. Providers bill *byte-identical* repeated context
at a fraction of the rate (commonly ~10% of input price on a cache hit).
Hand-pasted context drifts between turns and keeps missing the cache.
`bfx-ingest` produces byte-identical context every time, so it hits.

Worked example, using the real `server/` context (180,888 tokens), iterating 20
times in one debugging session (assumptions stated, math shown):

- **Drifting / uncached:** 20 × 180,888 = **3,617,760** input tokens.
- **Deterministic + cached** (1 full call + 19 cache hits at ~10%):
  180,888 + 19 × 18,089 = **524,575** input tokens.
- **Saved: ~3.09M input tokens, about 85% of input cost for that session.**

At posted input pricing, that one session:

| | Uncached | Deterministic + cached | Saved |
|---|---:|---:|---:|
| frontier ($3/M) | $10.85 | $1.57 | **~$9.28** |
| premium ($15/M) | $54.27 | $7.87 | **~$46.40** |

Assumptions are explicit (20 iterations, ~10% cache-read rate). Change them and
the conclusion holds in shape: deterministic context turns most of your repeated
input cost into a cache hit, and that recurs every session.

## What is exact vs estimated (the honesty box)

- **Exact:** file counts, character/byte counts, duplicate counts, the dedup
  percentage, and the root hash. These are computed from your bytes.
- **Estimated:** token counts (chars/4 heuristic) and all dollar figures (at the
  posted prices shown). The dedup **percentage** is tokenizer-independent because
  it removes whole files, so it holds for any tokenizer.
- **Varies by repo:** dedup savings depend entirely on how much your tree
  duplicates. Clean single projects show ~0%; vendored monorepos show more.

## Reproduce every number

```bash
git clone <repo> && cd tools
node bench.js ..            # the figures in the table above
node bfx-ingest.test.js     # 9/9 passing
```

No dependencies, no network. Nothing here asks for trust; it asks to be re-run.

## Share-ready summary

> I built `bfx-ingest`, a zero-dependency CLI that turns a codebase into clean,
> deterministic LLM context in one command. On a real 1,593-file repo it produced
> a single verifiable context artifact and reported it as ~4.55M tokens, so I knew
> instantly it needed scoping for a 200k window. Same input always yields the same
> root hash, which makes the context reproducible for evals and byte-identical for
> prompt caching. In a typical 20-iteration debugging session on one service, that
> determinism turns ~85% of repeated input cost into cache hits (~$9 to $46 saved
> per session at posted pricing, assumptions shown). Tested, no deps, no network,
> and every number is reproducible by re-running the included benchmark.
