// ═══════════════════════════════════════════════════════════════════════════
// STARFIGHTER — ENEMY CODEX / THREAT DATABASE (declarative entries)
// ═══════════════════════════════════════════════════════════════════════════
// One entry per MANIFOLD_ARCHETYPES key, plus support craft. Hostile entries
// list class, abilities, vulnerabilities, and lore. Friendly entries are
// shorter — used in the same overlay under a separate tab.
//
// Numeric stat ranges are illustrative (matching deriveCombatProfile output
// across waves 1–10). The codex never invents combat numbers — for live
// values it reads window.Starfighter.getState().player.lockedTarget.
//
// id MUST equal the entity.type used by core.js. The validation probe in
// tests/paradigm/codex.cjs asserts this and that every glbKey resolves to a
// file under starfighter/assets/models/.

const SFCodexData = (function () {
  'use strict';

  // ── Hostile fauna of Hive Sigma ─────────────────────────────────────────
  const HOSTILE = [
    {
      id: 'enemy', designation: 'Hive Drone Fighter', shortName: 'Drone',
      class: 'Light Fighter', faction: 'Hive Sigma', threatLevel: 2,
      glbKey: 'enemy', glbFile: 'AlienEnemyFighter.glb', firstWave: 1,
      silhouette: 'Compact organic-metallic hybrid. Chitinous wing panels, paired engine vents, soft bioluminescent emerald glow along the spine.',
      abilities: [
        { name: 'Single-shot Laser', kind: 'weapon', notes: 'Mid-range pulse. Cooldown ~1.5 s.' },
        { name: 'Spread Volley', kind: 'weapon', notes: 'Cone of three from wave 2 onward.' },
        { name: 'Lock Evasion', kind: 'tactic', notes: 'Breaks vector when targeted by player.' },
        { name: 'Predator Avoidance', kind: 'tactic', notes: 'Veers off when a Predator is within range.' },
      ],
      vulnerabilities: [
        'No shields — every hit damages the hull.',
        'Predictable arc when chasing a single target.',
        'Wing root explodes on direct laser hit (instant kill from rear).',
      ],
      backstory: 'The most numerous combat unit deployed by Hive Sigma motherships. Grown in nutrient vats aboard each carrier and launched in clusters of four to six. Individually disposable; collectively overwhelming. UEDF threat analysts believe drone behaviour is coordinated by a sub-sentient swarm pheromone field rather than command radio.',
    },
    {
      id: 'interceptor', designation: 'Needle Interceptor', shortName: 'Needle',
      class: 'Fast Interceptor', faction: 'Hive Sigma', threatLevel: 3,
      glbKey: 'interceptor', glbFile: 'Interceptor_Needle.glb', firstWave: 1,
      silhouette: 'Long, narrow, bilaterally symmetric blade hull. Twin afterburner ports. Lightly shielded.',
      abilities: [
        { name: 'Twin-pulse Laser', kind: 'weapon', notes: 'Higher fire rate than a Drone. Always uses spread fire from wave 2.' },
        { name: 'Close-range Jink', kind: 'tactic', notes: 'Random lateral burst when within ~300 m of player.' },
        { name: 'High Sustained Speed', kind: 'tactic', notes: 'Top speed roughly 2× a Drone.' },
      ],
      vulnerabilities: [
        'Thin shielding — a single torpedo hit usually breaches.',
        'Predictable jink pattern — the burst direction is field-derived and pre-computable.',
        'Long unshielded engine spine.',
      ],
      backstory: 'A Hive variant bred for pursuit roles. The Needle hull is too fragile for sustained combat but excels at running down isolated targets. Often deployed in pairs to flank a wing or chase down crippled UEDF craft.',
    },
    {
      id: 'bomber', designation: 'Leviathan Tick Bomber', shortName: 'Tick',
      class: 'Heavy Bomber', faction: 'Hive Sigma', threatLevel: 3,
      glbKey: 'bomber', glbFile: 'Bomber_Leviathan Tick.glb', firstWave: 1,
      silhouette: 'Bulbous abdomen, six folded grappling limbs, ventral bomb cradle. Slow, ungraceful, lethal at close range.',
      abilities: [
        { name: 'Proximity Bomb', kind: 'weapon', notes: 'Drops every ~6 s. Detonates in radius — splash damage to anything close.' },
        { name: 'Heavy Hull', kind: 'tactic', notes: 'Roughly 2.5× Drone HP at the same wave.' },
      ],
      vulnerabilities: [
        'Slow turn rate — easy to circle.',
        'No shields.',
        'Bomb cradle is exposed: a hit on the underside detonates loaded ordnance prematurely.',
      ],
      backstory: 'Bombers do not engage fighters. Their role is to close on capital targets — UEDF baseships, stations, supply tankers — and saturate them with proximity charges. A single Tick can level a fuel tanker if left unattended.',
    },
    {
      id: 'predator', designation: 'Predator Drone', shortName: 'Predator',
      class: 'Apex Hunter', faction: 'Hive Sigma', threatLevel: 5,
      glbKey: 'predator', glbFile: 'AlienEnemyPreditorDrone.glb', firstWave: 4,
      silhouette: 'Massive — roughly 480 m. Fanged forward intake, articulated grasping arms, lime-green bioluminescence visible from kilometres.',
      abilities: [
        { name: 'Plasma Lance', kind: 'weapon', notes: 'Slow plasma bolt. Falls off with distance from source. ~3 s cooldown.' },
        { name: 'Egg Spawn', kind: 'tactic', notes: 'Periodically lays an egg cluster. Eggs hatch into Younglings that bore into nearby ships.' },
        { name: 'Consume', kind: 'tactic', notes: 'Latches onto disabled craft to absorb mass.' },
      ],
      vulnerabilities: [
        'Slow turn at this scale — a fast fighter can stay in its blind cone.',
        'Plasma cooldown is long; the window after a discharge is safe.',
        'Younglings can be intercepted before they latch.',
      ],
      backstory: 'Predators are mature Hive organisms — older, larger drones that have been left to grow rather than expended in combat. UEDF designation lists them as apex threats; engagements without wing support are not recommended below pilot rank Lieutenant.',
    },
    {
      id: 'dreadnought', designation: 'Hive Throne Dreadnought', shortName: 'Throne',
      class: 'Capital — Siege', faction: 'Hive Sigma', threatLevel: 5,
      glbKey: 'dreadnought', glbFile: 'Dreadnought_Hive Throne.glb', firstWave: 6,
      silhouette: 'Cathedral-scale chitinous spire bristling with turret arrays and a single forward beam aperture. Heavily shielded.',
      abilities: [
        { name: 'Defensive Turrets', kind: 'weapon', notes: 'Continuous turret fire on a ~2 s interval.' },
        { name: 'Heavy Torpedo', kind: 'weapon', notes: 'Long-range guided ordnance. ~15 s cooldown. 6000 m engagement range.' },
        { name: 'Beam Charge', kind: 'weapon', notes: 'Charges visibly before discharge — can be interrupted.' },
        { name: 'Capital Shielding', kind: 'tactic', notes: '~50% of total HP is regenerating shield.' },
      ],
      vulnerabilities: [
        'Shield is exhaustible — sustained fire opens a hull window.',
        'Beam charge is visually telegraphed — you have ~2 s to break line of sight.',
        'Almost stationary — easy to circle for a torpedo run on the rear.',
      ],
      backstory: 'A Throne represents a Hive nest that has matured into a forward command structure. They are deployed to anchor sieges and rarely manoeuvre. Destroying one collapses every Drone within its pheromone field.',
    },
    {
      id: 'alien-baseship', designation: 'Hive Mothership', shortName: 'Mothership',
      class: 'Capital — Carrier', faction: 'Hive Sigma', threatLevel: 5,
      glbKey: 'alien-baseship', glbFile: 'AlienMotherShip.glb', firstWave: 3,
      silhouette: 'Kilometre-class organic vessel. Forward maw, aft hatchery, slow rotation. Visible from across the engagement sphere.',
      abilities: [
        { name: 'Heavy Torpedo', kind: 'weapon', notes: 'Long-range guided. ~4 s firing interval. Targets the UEDF baseship by preference.' },
        { name: 'Drone Production', kind: 'tactic', notes: 'Spawns Drone clusters as the wave progresses.' },
      ],
      vulnerabilities: [
        'No active shielding.',
        'Massive cross-section — every torpedo hits.',
        'Slow rotation — engine plume can be approached from a single safe vector.',
      ],
      backstory: 'The Mothership is the strategic threat of every Hive incursion. Each one carries enough biomass to seed an entire fleet of Drones, Interceptors, and Bombers. UEDF doctrine is clear: ignore the fighters, kill the carrier.',
    },
    {
      id: 'hive-queen', designation: 'Hive Queen', shortName: 'Queen',
      class: 'Capital — Boss (W10)', faction: 'Hive Sigma', threatLevel: 5,
      glbKey: 'hive-queen', glbFile: 'HiveQueen_BossW10.glb', firstWave: 10,
      silhouette: 'Cathedral-organic crown — a Mothership grown into a sentient command organism. Pulsing magenta core visible kilometres out.',
      abilities: [
        { name: 'Multiple Weapon Phases', kind: 'weapon', notes: 'Phase-driven loadout — torpedoes, beam, drone bursts.' },
        { name: 'Capital Shielding', kind: 'tactic', notes: 'Largest shield pool in the Hive bestiary.' },
        { name: 'Pheromone Field', kind: 'tactic', notes: 'Buffs every Hive unit within range while alive.' },
      ],
      vulnerabilities: [
        'Phase transitions briefly drop her shield.',
        'Magenta core is a critical-damage zone.',
        'No drone production — once the field collapses, no reinforcements.',
      ],
      backstory: 'The terminal form of a Hive Mothership. Encountered only at the climax of a sustained campaign (wave 10). Killing her permanently severs the local pheromone field — every Hive unit in the system goes catatonic.',
    },
  ];

  // ── UEDF allied craft ───────────────────────────────────────────────────
  const FRIENDLY = [
    { id: 'wingman', designation: 'UEDF Mk-IV Starfighter (Wing)', class: 'Allied Fighter', glbKey: 'ally', glbFile: 'HumanFriendlStarFighter.glb', notes: 'Crewed by ANPC pilots — each has a callsign, OCEAN personality vector, and a written backstory. Read their dialogue.' },
    { id: 'baseship', designation: 'UEDF Battleship (Carrier)', class: 'Allied Capital', glbKey: 'baseship', glbFile: 'HumanSpaceBattleShip.glb', notes: 'Your home carrier. Hosts the launch bay. If destroyed: mission over.' },
    { id: 'station', designation: 'Orbital Station (Artificial Gravity)', class: 'Allied Structure', glbKey: 'station', glbFile: 'HumanSpaceStationWithAritificalGravity.glb', notes: 'Resupply and repair platform. Heavily shielded.' },
    { id: 'tanker', designation: 'Fuel Tanker', class: 'Allied Support', glbKey: 'tanker', glbFile: 'friendlyfueltanker.glb', notes: 'Refuels player on docking. Bombers prioritise these.' },
    { id: 'medic', designation: 'Medical Frigate', class: 'Allied Support', glbKey: 'medic', glbFile: 'freindly_medical_frigate.glb', notes: 'Hull repair on docking. Vulnerable — defend during rescue waves.' },
    { id: 'rescue', designation: 'Rescue Shuttle', class: 'Allied Support', glbKey: 'rescue', glbFile: 'Rescue Shuttle .glb', notes: 'Recovers ejected pilots. Lightly armed.' },
  ];

  function byId(id) {
    return HOSTILE.find(e => e.id === id) || FRIENDLY.find(e => e.id === id) || null;
  }

  function allHostileIds() { return HOSTILE.map(e => e.id); }
  function allFriendlyIds() { return FRIENDLY.map(e => e.id); }

  return { HOSTILE, FRIENDLY, byId, allHostileIds, allFriendlyIds };
})();

if (typeof module !== 'undefined') module.exports = SFCodexData;
if (typeof window !== 'undefined') window.SFCodexData = SFCodexData;
