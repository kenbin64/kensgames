# 🦋 bfx-ingest

*Part of the [ButterflyFx](https://butterflyfx.us) toolkit.*

**Turn any codebase into clean, deterministic, token-efficient context for an LLM — in one command.**

```bash
npx bfx-ingest ./my-project --format md --out context.md
```

Feeding a repo to ChatGPT, Claude, or Cursor is messy: you paste files by hand, blow the context window, send the same vendored code twice, and get a different blob every time so you can't cache or reproduce it. `bfx-ingest` fixes that.

```
🦋 my-project: 142 files → ~96,300 tokens (saved 11,200 via dedup) · root 8f3ac21d · format md
```

## Why you need this

- **Reproducible evals.** Pin the exact context a prompt ran against, by hash. Same context, same comparison, no drift.
- **Lower bills.** Content-dedup cuts tokens before they reach the window, and byte-identical context hits the provider's prompt cache instead of being re-billed.
- **Provenance you can prove.** The root hash and manifest show exactly what code the model saw, for security, IP, and compliance review.

## Why trust this

- **Local and dependency-free.** Pure Node, no packages, no network. Your code never leaves your machine.
- **You can verify it yourself, not take my word.** Same repo in produces byte-identical output and the same root hash out, on any machine. Reproducibility is something you can re-run and check, not a claim.
- **One small file, open to read.** The whole tool is [bfx-ingest.js](bfx-ingest.js). No build step, nothing compiled or obfuscated, MIT licensed. Read it before you run it.

## Why it's built the way it is (the AI-engineering parts)

- **Model-shaped output.** `--format md` for GPT/Cursor, `--format xml` for Claude (it prefers `<file>` tags), `--format json` for your own pipeline/RAG step. One ingest, the right shape for the model.
- **Token budget you can see.** Every run reports an estimated token count so you know before you paste whether it fits a 32k / 128k / 200k window.
- **Content-dedup = real token savings.** Identical files (vendored libs, generated code, copied configs) are content-addressed and included **once**; the rest reference them. The run tells you how many tokens you saved. On a monorepo that is money.
- **Deterministic + verifiable.** Same repo in → byte-identical output and the **same root hash** out, on any machine. That is what makes it usable for things that matter in production AI:
  - **reproducible evals** — pin the exact context a prompt was run against;
  - **prompt caching** — identical context bytes hit the cache instead of re-billing;
  - **provenance** — the root hash + manifest prove *exactly* what code the model saw (useful for security, IP, and compliance reviews).
- **Local and dependency-free.** Pure Node, no packages, no network. Your code never leaves your machine.

## Usage

```bash
bfx-ingest <folder> [options]

  --format  md | xml | json     output shape (default: md)
  --out     FILE                write to a file (default: stdout, so it pipes)
  --max-kb  N                    skip files larger than N KB (default: 256)
```

Pipe it straight into anything:

```bash
bfx-ingest ./src --format md | pbcopy            # straight to clipboard
bfx-ingest ./src --format json > ctx.json        # into a RAG / eval pipeline
```

It skips the usual junk (`.git`, `node_modules`, `dist`, build output, binaries, lockfiles) and honours a basic `.gitignore`.

## How it works

The folder is walked deterministically and each file is content-addressed (a stable hash of its bytes). Identical files collapse to a single body; the whole tree reduces to one root hash that names the exact context. Output formats are projections of that one addressed structure, which is why the JSON, Markdown, and XML all describe the same bytes and the same root. The reproducibility and the provenance are not features bolted on top — they fall out of addressing the content instead of just concatenating it.

## Honest limitations / roadmap

- Token counts are the standard `chars / 4` heuristic. A `--tiktoken` flag for exact, model-specific counts is the obvious next step.
- No context-window chunking yet (split a huge repo into N window-sized parts) — planned.
- `.gitignore` support is basic (common patterns), not the full spec.

## License

MIT.
