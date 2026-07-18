# FastTrack v2 Standards (binding)

The rules this rewrite is built to. Every file and function is checked against these.

## Code quality
- No spaghetti. Single responsibility per function; single topic per file.
- No function over ~40 lines without a clear reason; no file mixes logic with DOM or rendering.
- Separation of concerns in the browser: CSS in `.css` files, JavaScript in `.js` files, HTML
  in `.html` files. No inline styles or scripts of substance in the HTML.
- Configuration lives in JSON or YAML, never hardcoded in source.
- Game rules live in JSON or YAML (or Drools), read by the engine, never re-encoded in code.
  `fasttrack.rules.json` is the source of truth.
- Self-documenting names; comments explain why, not what.

## Manifold / ButterflyFx (functional, never decoration)
- The board is the dimensional substrate; a move is an honest traversal of it. The dimensional
  framing must do real work or it is not used (no manifold claims bolted onto discrete logic,
  no performance claims).
- Audio is synthesized from the manifold coordinates: no sound files. The music can be any
  theme-fitting piece, but its notes are derived from z=xy (the surface produces the sound),
  the way the bugzapper does.
- Lens by data kind: z=xy for anything with a waveform or spectrum (the perpendicular along z
  is the complex exponential, a helix; wavelength, phase, inflection, angle, distance, and
  color spectrum are all read off it); z=xy^2 for functional / quadratic-table data. z=xy is
  the harmonic, complex-plane object; z=xy^2 is the quadratic surface, not the complex one.
- Perpendicularity is a curve, not a corner: the saddle slides smoothly through every angle,
  so pegs arc between holes and audio/animation curve through right angles rather than snapping.

## Naming and faithful port
- The engine and the 3D scene speak the proven semantic hole names: `ft-{p}`,
  `side-left-{p}-{1..4}`, `outer-{p}-{0..3}`, `home-{p}`, `side-right-{p}-{1..4}` (14 per wedge,
  84 around). `rules.json`'s flat `outer-{p}-{1..14}` stays as the canonical data mapping
  (position 1 = ft, 8 = safe entrance, 10 = home).
- The move and turn logic is ported from the proven `fasttrack-game-core.js`, not re-derived,
  so the rules stay exactly the same. The turn engine is render-decoupled (the proven turn fix
  becomes a structural guarantee, not a patch).

## Delta-only service (storage)
- Game state persists as a base (seed plus players) plus the ordered move events, replayed to
  any point. Each move is a delta. Content-addressed dedup; never re-serve unchanged content
  (ETag and 304); send only the delta when a client has a base. See server SERVICE-STANDARD.md.

## Look and feel (reuse the scene unchanged)
- v2 reuses the existing 3D scene as-is: the billiard speakeasy room, paneling, floor,
  chandelier, sconces, neon, the nine paintings hung two per wall with their fineartamerica buy
  links, the billiard-ball pegs jumping (arcing) hole to hole. Visually and audibly identical,
  except the audio is now manifold-synthesized.

## Mobile / smartphone
- Smartphones get a different, lighter experience, not the desktop scene shrunk. On phones, drop
  the heavy 3D room background for performance and present a clean, board-focused view.
  (Interpretation of "no background on phones except phones" pending Ken's confirmation; the
  intent captured here is: phones stay fast and board-first, without the full 3D environment.)

## UI and popups (the board is sacred during play)
- No control, button, or popup ever covers the board during gameplay.
- Every popup is dismissable.
- Popups never appear during a game action (a move, a peg animation, a turn resolving). They
  wait for the action to finish.
