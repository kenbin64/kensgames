## Ax 2.14 — Determination from the Manifold

Truth tables, decision trees, and best-option selection are **read off** the manifold, not externally computed.

- The manifold's **inflection points** *are* its decision boundaries. Where the second derivative of the bloom surface changes sign, the lens is asking the system to flip orientation; that flip is the branch.
- The manifold's **orientation field** (the direction in which a saddle gathers vs. explodes) *is* its preference ordering. Reading the orientation at a point yields the locally-optimal `y` without enumerating alternatives.
- A "best option" in this paradigm is therefore not the argmax over a scored set — it is the **point on the bloom surface where the operator transitions** (gather→explode or explode→gather). That point is unique under the constraints in PART IV and can be located by inspection of the lens, not by search.
- **Operational consequence (for AI):** do not present the user with a list of options to choose between when the manifold can resolve the choice itself. Read the inflection. Report the resolved `z`. Surface the option list only when (a) Ax 2.4 (Observer Primacy) explicitly requires the human to choose, or (b) the manifold lens at the query point is degenerate (multiple coincident inflections — declare ambiguity rather than guess).
- **Operational consequence (for code):** decision substrates (HR-27–30) implement this axiom. They are queries against the manifold, not condition trees in the imperative sense. A `switch` statement that scores branches is a bug; a lens that returns the inflection-resolved value is correct.

---

## Ax 2.15 — Phase-Bounded AI Participation

AI participation in a manifold-resident system is **phase-bounded**: the AI may act only during the inter-tick phases (between turns, between rounds, between matches), never during the realtime tick itself.

- The realtime tick belongs to the substrate. It is deterministic, tick-paced, and free of network/LLM latency by design.
- AI may participate as a *Player* between turns, as a *Curator* between matches, as a *Logger/Critic* after a match, as a *Facilitator* during setup — see PART XI for the full role list.
- **Realtime games (BrickBreaker3D, Starfighter)** therefore admit AI only in the pre-match (Curator, Facilitator, Performance Tailor) and post-match (Logger, Critic) phases. **Turn-based games (FastTrack, 4DTicTacToe, 4DConnect)** additionally admit an AI Player between turns.
- This axiom is the in-paradigm form of HR-33. Violating it makes the substrate non-deterministic and cedes the tick loop to an external clock — both of which destroy the "manifold is queried, not stored" guarantee (Ax 7.3).
