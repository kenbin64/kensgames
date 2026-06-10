# Cover Letter Template (tailor per job)

How to use: copy the block below, fill every [BRACKET], delete the guidance lines,
keep it to about 250 to 350 words. Mirror the job description's own words where they
are genuinely true of you. Never claim a tool or result you cannot back up. House
style: no em-dashes.

---

## Template

[Date]

Dear [Hiring manager name, or "Hiring Team" if unknown],

I am applying for the [exact role title] role at [Company]. [One sentence on why this
company or product specifically: name something real about them so it is clearly not a
mass-send.] I build the reliability layer around software and AI, and I prove my work
with tests and reproducible numbers, which is what drew me to this position.

[Proof paragraph. Pick the ONE achievement closest to the job description and tell it as
a short story with a number. Examples to choose from:]
- For an AI / LLM role: "Most recently I wrapped a generation pipeline in a deterministic
  verifier and took unsupported, hallucinated output from about 39% to 0%, while best-of-N
  kept the answer rate high. I also cut repeated LLM input cost by roughly 85% in a typical
  session through deterministic, cacheable context."
- For a backend / platform role: "I designed an atomic, content-addressed release system
  with health checks and automatic rollback, and re-architected multiplayer netcode to
  event sourcing that replays byte-identical state from one seed, eliminating an entire
  class of state-divergence bugs."
- For a regulated / high-trust domain: "I delivered mission-critical U.S. Air Force systems
  under strict DoD change control and held a Secret clearance, and built healthcare
  interoperability pipelines (HL7 / FHIR) at Humana."

[Fit paragraph. Map two or three of THEIR stated requirements to your real experience,
using their keywords. Example: "Your posting asks for [X], [Y], and [Z]. I have [specific
true experience with X], [specific true experience with Y], and [specific true experience
with Z]."]

I own problems end to end, from architecture through production deployment, and I would
bring that to [Company]. You can see working examples with their numbers at
github.com/kenbin64 and theconduit.me. I would welcome the chance to talk.

Sincerely,
Kenneth W. Bingham
801-425-2652 | ken.bingham64@gmail.com | linkedin.com/in/kenneth-bingham-11378b10

---

## Worked example (generic AI Engineer role)

Dear Hiring Team,

I am applying for the AI Engineer role at Acme AI. Your focus on shipping LLM features that
stay reliable in production is exactly the problem I work on. I build the reliability layer
around AI, and I prove my work with tests and reproducible numbers.

Most recently I wrapped a generation pipeline in a deterministic verifier and took
unsupported, hallucinated output from about 39% to 0%, while best-of-N kept the answer rate
high. In a related tool I cut repeated LLM input cost by roughly 85% in a typical iterative
session through deterministic, content-addressed context, proven by a reproducible benchmark.
Both are open source and runnable.

Your posting asks for strong Python, experience with RAG and evaluation, and someone
comfortable owning infrastructure. I have built evaluation and verification harnesses,
structured-output validation, and model routing; self-hosted local models (Llama, Qwen,
DeepSeek) behind a directive-controlled layer; and I run my own Linux VPS with zero-downtime,
auto-rollback deploys. I also bring 10+ years across regulated domains, including U.S. Air
Force programs and healthcare interoperability, where reliability is not optional.

I own problems from architecture through production, and I would bring that to Acme AI.
Working examples with their numbers are at github.com/kenbin64 and theconduit.me. I would
welcome the chance to talk.

Sincerely,
Kenneth W. Bingham
801-425-2652 | ken.bingham64@gmail.com | linkedin.com/in/kenneth-bingham-11378b10
