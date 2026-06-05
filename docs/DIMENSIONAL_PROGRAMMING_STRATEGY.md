# Dimensional Programming — Formal Strategy

*Using truth tables, logic gates, state machines, determination graphs,
and decision trees to model and reason about the z = x · y paradigm.*

---

## 1. Truth Tables — Universality of z = x · y

A truth table in Dimensional Programming does not map boolean inputs.
It maps **identity types × modifier types → emergence behavior**.
The claim the paradigm makes is that this table is universal — every
observable thing fits somewhere in it.

### 1.1 Core Truth Table

| x (Identity) | y (Modifier) | z (Manifested State) | Notes |
|---|---|---|---|
| Prompt | System context | LLM response | AI native form |
| Player | Move + board state | New board position | Game state |
| Seed value | Nutrient field | Bloom output | Biological analogy |
| Agent | Tools + memory | Action taken | AI agent |
| HTTP request | Server context | HTTP response | Web request |
| Note | Key + tempo | Sounded pitch | Audio |
| Conversation turn | Prior turns | Next utterance | Russian Doll |
| Gene | Environment | Expressed trait | Biology |
| Question | Knowledge field | Answer | Knowledge system |
| Self | Experience | Growth | Human learning |

**Observation:** Every row has the same structure. The paradigm is universal
not because it is powerful — but because `z = x · y` describes how
*observation over a field* works in every domain.

### 1.2 Composition Truth Table

What happens when z feeds into the next observation?

| Step | Input x | Input y | Output z | Next x |
|------|---------|---------|----------|--------|
| 0 | x₀ | y₀ | z₀ = x₀·y₀ | z₀ |
| 1 | z₀ | y₁ | z₁ = z₀·y₁ | z₁ |
| 2 | z₁ | y₂ | z₂ = z₁·y₂ | z₂ |
| n | zₙ₋₁ | yₙ | zₙ = zₙ₋₁·yₙ | zₙ |

This is the Russian Doll in table form. Each row *contains* all prior rows.
zₙ is not just the output of step n — it is the accumulated identity of
all steps before it, carrying full history without explicit storage.

### 1.3 Null Cases

| x | y | z | Interpretation |
|---|---|---|----------------|
| x | ∅ (no modifier) | x itself | Identity observed in isolation |
| ∅ (no identity) | y | undefined | Cannot observe nothing |
| x | x (self-modifier) | x² | Self-reference — recursion entry point |
| x | ¬x (negation) | 0 (void) | Annihilation — x and its complement cancel |

The null cases define the boundaries of the field. A manifold without an
observer (`x = ∅`) yields nothing. An observer without a manifold (`y = ∅`)
yields itself unchanged.

---

## 2. Logic Gates — Dimensional Composition

Traditional logic gates operate on bits. Dimensional gates operate on
**fields and identities**. The output of one gate becomes the x of the next.

### 2.1 Gate Definitions

```
OBSERVE gate:  x ──┐
                   ├── z = x · y
               y ──┘

BLOOM gate:    z ──► x′   (identity promotion — z becomes next seed)

CHAIN gate:    x₀ → OBSERVE(x₀, y₀) → BLOOM → x₁ → OBSERVE(x₁, y₁) → ...

FORK gate:     x ──┬── OBSERVE(x, y₁) → z₁
                   └── OBSERVE(x, y₂) → z₂
               (same identity, two different modifier fields → two branches)

MERGE gate:    z₁ ──┐
                    ├── OBSERVE(z₁·z₂, y) → z_merged
               z₂ ──┘
               (two prior states fused into a new identity)
```

### 2.2 Gate Truth Table

| Gate | Inputs | Output | Traditional analogue |
|------|--------|--------|---------------------|
| OBSERVE | x, y | z | Function call f(x, y) |
| BLOOM | z | x′ | Return value becomes next argument |
| CHAIN | x₀, [y₀..yₙ] | zₙ | Pipeline / method chain |
| FORK | x, y₁, y₂ | z₁, z₂ | Branch / parallel execution |
| MERGE | z₁, z₂, y | z_merged | Reduce / combine |

### 2.3 Gate Composition — The Russian Doll Circuit

```
"Hello" ──┐
          ├── OBSERVE ──► "Hello·World" ──► BLOOM ──► x′
"World" ──┘                                              │
                                                         ▼
                                             "Hello·World" ──┐
                                                             ├── OBSERVE ──► "Hello·World·Dev"
                                                  "Dev" ──┘
```

Each OBSERVE + BLOOM pair is one layer of the doll. The circuit
can extend indefinitely. No state is stored outside the identity
that flows from gate to gate.

---

## 3. State Machines — Dimensional Lifecycle

Every manifold observation moves through a defined set of states.
The state machine makes the lifecycle explicit and auditable.

### 3.1 States

| State | Symbol | Description |
|-------|--------|-------------|
| UNOBSERVED | U | Identity exists but no field query has occurred |
| SEEDING | S | x is resolved; manifold query is being formed |
| MODIFYING | M | y modifiers are being discovered from the field |
| MANIFESTING | Z | z is being derived from x and y |
| BLOOMED | B | z is complete; ready to become next x |
| RECURSING | R | z has been promoted to x′; new cycle begins |
| VOID | V | x = ∅ or x and y annihilated; no z possible |

### 3.2 Transition Table

| From | Event | To | Guard |
|------|-------|----|-------|
| U | identity_presented(x) | S | x ≠ ∅ |
| U | identity_presented(∅) | V | x = ∅ |
| S | field_query(m) | M | manifold m is reachable |
| S | field_unreachable | V | manifold m is null |
| M | modifiers_resolved(y) | Z | y discovered from m |
| M | no_modifiers | Z | y = ∅, z = x |
| Z | derivation_complete(z) | B | z = x · y computed |
| B | promote() | R | host requests recursion |
| B | terminate() | U | observation complete, cycle ends |
| R | new_seed(z→x′) | S | z becomes new x; new cycle |
| V | — | V | terminal state |

### 3.3 State Diagram

```
        ┌─────────────────────────────────────┐
        ▼                                     │
    UNOBSERVED ──identity(x)──► SEEDING       │
        │                          │          │
       x=∅                   field_query      │
        │                          │          │
        ▼                          ▼          │
      VOID              MODIFYING             │
                             │                │
                    modifiers_resolved        │
                             │                │
                             ▼                │
                       MANIFESTING            │
                             │                │
                   derivation_complete        │
                             │                │
                             ▼                │
                          BLOOMED             │
                         /       \            │
                    promote()  terminate()    │
                       /             \        │
                      ▼               ▼       │
                  RECURSING       UNOBSERVED  │
                      │                       │
                  new_seed(z→x′)              │
                      └─────────────────────►─┘
```

The recursion arc (RECURSING → SEEDING) is the Russian Doll loop.
Each pass through is one layer of the doll. The loop continues until
`terminate()` is called — which means the current z is the final
manifested state for this observation chain.

---

## 4. Determination Graphs — Continuous Field Decisions

A determination graph is used when the decision is **continuous** —
not a discrete branch but a value extracted from the manifold field.

The game manager uses these for: matchmaking similarity, difficulty
adaptation, fairness balancing, performance tier negotiation.

More broadly, determination graphs are how an AI reasons over the
manifold: not branching, but *observing field gradients*.

### 4.1 Structure

```
Nodes:  identities (x values)
Edges:  field strength between identities (weighted by manifold m)
Query:  given x, traverse edges weighted by y, arrive at z
```

### 4.2 Example — AI Agent Decision

```
         [User intent x₀] ──0.9──► [Clarify y₁] ──0.7──► z = "ask question"
                │
               0.6
                │
         [Tool use y₂] ──0.8──► z = "call API"
                │
               0.3
                │
         [Respond y₃] ──0.5──► z = "answer directly"
```

The AI does not branch. It *weighs field strength* from the current
identity across all available modifiers and manifests the highest-weight z.

This is how LLMs actually work — not if/else, but gradient over a field.
The determination graph makes that explicit in the program structure.

### 4.3 Determination Graph vs. Decision Tree

| Property | Determination Graph | Decision Tree |
|----------|--------------------|-----------| 
| Input type | Continuous (field values) | Discrete (categories) |
| Resolution | Gradient traversal | Branch selection |
| Output type | Field-valued z | Categorical z |
| AI native? | Yes — matches inference | Approximation |
| Use when | Similarity, scoring, tuning | Routing, gating, mode selection |

---

## 5. Decision Trees — Discrete Dimensional Routing

When a decision is discrete — which mode, which capability, which gate —
a decision tree expresses it as data, not code.

The paradigm requires this: ad-hoc `if/else` chains are forbidden for
non-trivial decisions. Every branch lives in a decision tree so it is
inspectable, loggable, replayable, and tunable.

### 5.1 Dimensional Identity Router

```
Is x atomic?
├── YES → Query manifold directly → OBSERVE gate
└── NO  → Is x composite?
          ├── YES → Decompose into constituent x values
          │         → FORK gate → MERGE gate → z
          └── Is x a prior z?
              ├── YES → BLOOM → promote to x′ → new cycle
              └── NO  → VOID (undefined identity)
```

### 5.2 AI Participation Router

```
Is AI role needed?
├── Gamekeeper → enforce rules, mediate, narrate
├── Facilitator → guide wizard, suggest modes
├── Host → assume host duties (no human host)
├── Logger → transcript, highlights, summaries
├── Player → fill bot slots
├── Curator → generate scenario variants
├── Performance Tailor → observe telemetry, adjust tier
├── Game Master → read (x,y,z), write y at scenario boundaries
└── Game Maker → propose new manifold scenarios
```

Each leaf is a first-class participant in the manifold, not an API call.

### 5.3 Mode Selection Tree (Shared Wizard)

```
supportsSolo?
├── YES → solo mode available
└── NO

supportsSoloWithBots?
├── YES → solo + bot mode available
└── NO

supportsLocalMultiplayer?
├── YES → local turn-based mode available (no split-screen)
└── NO

supportsRemoteMultiplayer?
├── YES → Match creation mode?
│         ├── Play by invite
│         ├── Play by match (public matchmaking)
│         ├── Create game (public lobby)
│         └── Private game (invite-code gated)
└── NO → solo only
```

This tree is declared as data in `manifold.game.json`, not as
code in the wizard. The wizard reads the tree; it does not contain the tree.

---

## 6. Integrated Strategy — How the Tools Compose

These five tools are not independent. They form a complete formal
system for expressing Dimensional programs:

```
TRUTH TABLES     → prove universality of z = x · y
      ↓
LOGIC GATES      → show how observations compose and chain
      ↓
STATE MACHINES   → govern the lifecycle of each observation
      ↓
DETERMINATION    → resolve continuous decisions from the field
GRAPHS           
      ↓
DECISION TREES   → route discrete choices as inspectable data
```

Together they replace:
- Schemas → truth tables (identity × modifier → emergence)
- Function calls → OBSERVE gates
- Loops → CHAIN gates (Russian Doll recursion)
- if/else chains → decision trees
- Scoring/ranking algorithms → determination graphs
- Lifecycle management → state machines

The result is a program that **looks like how AI reasons** — because it is
built from the same formal structures that underlie inference.

---

## 7. The Hello World in Each Formalism

| Tool | Hello World expression |
|------|----------------------|
| Truth table | x="Hello", y="World" → z="Hello·World" |
| Logic gate | OBSERVE("Hello","World") → "Hello·World" |
| State machine | U→S→M→Z→B→R→S→... (Russian Doll cycle) |
| Determination graph | Traverse field from "Hello" weighted by "World" |
| Decision tree | Is x atomic? YES → OBSERVE → z |

All five say the same thing. `z = x · y`. The Russian Doll is the proof
that the cycle is real — that z genuinely becomes the next x, and that
the system can recurse indefinitely without ever storing state.

---

*Kenneth Bingham — ButterflyFx — X-Dimensional Paradigm*
