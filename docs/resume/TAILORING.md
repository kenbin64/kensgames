# Tailoring guide: one resume, fitted to each job

The master is `resume.md`. Do not rewrite it per job. Instead make a copy, then do the
four quick moves below. The whole point is to mirror the job description's real language
so an automated screener (ATS) scores a high keyword match and a human sees an obvious fit,
without ever claiming something untrue.

## The one rule
Only mirror keywords that are genuinely true of you. If a posting wants Kubernetes and you
have not run it, leave it out. A false keyword that surfaces in an interview costs you more
than a missed match. Integrity is the whole brand.

## The four moves (about 10 minutes per application)

1. **Set the target line.** In the Summary, change the last sentence to name the role:
   "Seeking a [their exact title] role where [the thing they emphasize] matters."

2. **Reorder Core Skills to lead with their stack.** Put the languages and tools the posting
   names first, in their wording (for example move "Python" or ".NET" to the front). Keep
   only true items. ATS and humans both read the first line hardest.

3. **Pick the right 4 achievements.** From the bank below, move the 4 that match the posting
   to the top of Selected Achievements. Drop ones that are irrelevant to this role.

4. **Match the cover letter.** Use `cover-letter-template.md`, choose the proof paragraph
   that fits, and map three of their stated requirements to your real experience in their words.

## Keyword and achievement bank (all true, pick what fits)

**AI / LLM reliability roles**
- Hallucinated output ~39% to 0% via a deterministic verifier; best-of-N kept answer rate high.
- ~85% repeated LLM input-cost cut via deterministic, content-addressed, cacheable context.
- Evaluation and verification harnesses; structured / JSON outputs; tool and function calling.
- Model routing and cost-aware tier selection; prompt caching; token budgeting.
- Self-hosted local models (Llama, Qwen, DeepSeek, Mistral, Phi-3) via Ollama and LM Studio.
- RAG, vector search, long-context reliability, drift control.

**Backend / platform / infrastructure roles**
- Event-sourced, deterministic netcode; byte-identical state from one seed; killed a bug class.
- Atomic, content-addressed releases; health checks; automatic and one-command rollback.
- Node.js, Express, Spring Boot, REST, microservices, WebSockets.
- PostgreSQL, SQL Server, Oracle, MySQL, SQLite; schema design, indexing, optimization.
- Linux, nginx, Docker, PM2; self-managed VPS; zero-downtime deploys.
- Azure DevOps pipelines, GitHub Actions, CI/CD automation.

**Regulated / high-trust domains**
- U.S. Air Force programs under DoD change control; held a Secret clearance.
- Healthcare interoperability (HL7 / FHIR) at Humana; .NET 6 services.
- Fintech: credit-union core banking and teller platform; financial-data aggregation at Finicity.
- Tamper-evident, hash-chained, auditable state; provable provenance.

**Full-stack / front-end roles**
- Angular, React, WebGL2, Three.js; interactive 3D; dependency-free JavaScript.
- The Conduit: 123 deterministic automated tests, signed go-live gate, 3D network view.
- End-to-end ownership: database to API to front end to cloud deploy.

## Quick ATS hygiene
- Keep standard section headings (Summary, Core Skills, Experience, Education). Done in `resume.md`.
- Submit as PDF from `resume-print.html` (Print > Save as PDF) or paste `resume.md` as plain text.
- No tables, text boxes, headers/footers, or images in the file you upload. Both provided files are clean.
- Spell out and abbreviate key terms once each where natural (for example "CI/CD" and "continuous integration").
- Match the job title wording in your Summary target line.

## Files
- `resume.md` - master, sendable, plain text for job-board paste.
- `resume-print.html` - open in a browser, Print > Save as PDF for recruiters.
- `cover-letter-template.md` - per-job letter with a worked example.
- `resume-public.md` / the butterflyfx.us page - public version: no contact details, employer
  shown generically, "Open to hybrid and remote". Contact lives on the About / Contact page.
