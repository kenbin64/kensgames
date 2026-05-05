# PART XI — AI PARTICIPATION (BROKER + MCP)

---

This part defines how an AI system (LLM-class or otherwise) may participate in a manifold-resident application. It is the in-paradigm projection of `HARD_RULES.md` HR-31 through HR-36 and is binding on every AI that joins the system, whether bound internally by the broker or attached externally as an MCP client.

## §11.1 — The seven roles (HR-31)

There are exactly seven roles an AI may occupy. No other role is admissible. Every action an AI takes inside the system is one of:

| Role | Phase | What it does | Example |
|------|-------|--------------|---------|
| **Gamekeeper** | setup, between-rounds | Maintains the rules of the active scenario | Reject an illegal player count for a 4DConnect 3-player layout |
| **Facilitator** | setup, between-rounds | Helps the host configure a session | Suggest a scenario based on the joined player count |
| **Host** | setup | Acts on behalf of the room owner when the human host is absent | Accept a returning player into the seat they previously occupied |
| **Logger / Critic** | post-match | Records and summarises what happened | Produce a 3-line match recap for the lobby feed |
| **Player** | between-turns (turn-based games only) | Plays a seat | Choose a 4DTicTacToe move on its turn |
| **Curator** | pre-match | Generates a scenario *variant inside declared parameters* (HR-34) | Vary terrain weights for a FastTrack race within the declared min/max |
| **Performance Tailor** | between-rounds | Adjusts difficulty/tempo to keep the session in flow | Lower bot reaction time for a struggling player |

The role registry is the single authoritative list — see `server/ai-broker/roles.js`. Adding a role requires updating this directive *and* the registry.

## §11.2 — Phase guards (HR-33 / Ax 2.15)

Each role declares the phases in which it may act. The broker enforces this with two guards:

- `assertPhase(role, phase)` — throws if the role is invoked outside its declared phases.
- `assertNotInTick(role, isRealtimeTick)` — throws if any role is invoked while the realtime tick is active.

The Player role is additionally restricted to `phase === 'between-turns'` and to games that declare themselves turn-based. This is why the Player role does not exist for BrickBreaker3D, Starfighter, or Assemble in the realtime sense — those games admit AI only as Curator, Facilitator, Logger, and Performance Tailor.

## §11.3 — Server-only keys (HR-32)

Provider credentials (Anthropic, OpenAI, Gemini, or any other) **never** leave the server. They are loaded into `server/ai-broker/config.js` from environment variables at process start and held only in the broker's memory. The browser, the WebSocket protocol, and the MCP wire format never carry them. Any code path that would expose a key client-side is a violation of this part *and* of HR-32.

## §11.4 — Curator trust boundary (HR-34)

A Curator may produce only **variants inside declared scenario parameters**. Concretely: the scenario file declares the parameter axes and their min/max. The Curator may sample any point in that hyperrectangle; it may *not* introduce a new axis, exceed a declared bound, or produce a variant whose lens is not in the declared lens set. The broker validates the Curator's output against the scenario schema before accepting it. Out-of-bounds output is rejected and logged; the heuristic fallback is used in its place.

## §11.5 — Roster transparency (HR-35)

Every AI participant publishes a **transparency badge** on the session roster. The badge carries `{ role, persona, provider, badge_text }` and is visible to every human in the room. Covert AI is forbidden. The broker generates the badge automatically from the role registry — a role cannot be activated without one.

## §11.6 — MCP: two faces of one substrate (HR-36)

The game manager is an MCP **server** *and* uses MCP outbound through the broker. These are two faces of one substrate:

- **Inbound (MCP server face).** External MCP clients (third-party AIs, observability tools, the user's own AI assistant) may attach to a session in one of three permission tiers — **observer** (read-only roster + post-match feed), **player** (occupy a seat in a turn-based game subject to host approval), **logger-curator** (pre-/post-match roles subject to host approval). Every external attachment requires explicit host approval and produces an append-only entry in the session audit log.
- **Outbound (MCP client face).** When no external client is bound to a role, the broker fulfils that role itself by speaking MCP outbound to a provider adapter (Anthropic first; OpenAI/Gemini behind the same adapter shape). Provider responses pass through the safety layer (token cap, timeout, fallback) before reaching the role boundary.

The same role registry serves both faces. A role activated by an external MCP client is still bound by §§11.1–11.5; the wire format does not change the rules.

## §11.7 — Determination over enumeration (Ax 2.14 applied to AI)

When an AI in any of these roles needs to make a choice, it does so by **reading the inflection on the relevant manifold lens**, not by enumerating-and-scoring branches. The broker's heuristic fallback is implemented this way; provider-backed implementations must produce output consistent with the same inflection rather than substituting their own search procedure. Surfacing a multi-option list to the human host is permitted only when the lens is degenerate at the query point (Ax 2.14, second operational consequence).

## §11.8 — Audit and append-only logging

Every broker invocation produces an audit record: `{ timestamp, sessionId, role, phase, source, provider, persona, latencyMs, usage, badge, decided_by_inflection }`. The log is append-only and is the canonical source for post-match Critic summaries and for HR-35 disclosure. No record is ever rewritten or deleted; corrections are appended as new entries that reference the original.
