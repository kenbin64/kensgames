# Starfighter Docs — Consistency / Errata

This note exists to resolve a small but important documentation mismatch around **end-of-round repairs** and the **between-wave transition**.

## Canonical interpretation
Starfighter uses the full mission-cycle loop (briefing → launch → combat → return → docking → refit/reward → optional test flight → next briefing → relaunch).

Within that loop there is also a short **in-space between-wave/debrief window** during the return-to-carrier transition.

### Repairs & resupply (authoritative behavior)
- **In-space between-wave window (return/debrief)**
  - Shields: **fully restore**
  - Fuel: **replenished**
  - Torpedoes: **replenished**
  - Hull: **not instantly repaired while still in space**

- **Docking / Refit & Reward phase (carrier bay)**
  - Hull: **repaired during refit**
  - Ammo/countermeasures: **restocked during refit**
  - Performance summary + XP/credits/rank/unlocks are presented here

This interpretation is intended to satisfy both:
- The **Mission Cycle** document’s detailed docking/refit sequence (repairs and refit activity in the bay), and
- The **Unified Design** document’s short “between-wave phase” spec (a brief debrief/resupply window where hull is not yet repaired).

## If documents disagree
When two documents appear to conflict, treat the **Mission Cycle** and **Progression Bible** as the primary sources, and interpret the Unified Design’s “between-wave phase” as the short in-space portion of the return-to-carrier transition.
