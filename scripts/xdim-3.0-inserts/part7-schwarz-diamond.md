## Ax 7.4 — The Schwarz-Diamond Substrate

The **Schwarz Diamond** is the auxiliary lens used wherever the paradigm needs an *atomic-lattice* manifold — a structure in which **every point structurally supports every other point**. It is named after the atomic structure of a real diamond, where each carbon sits in a tetrahedral relation to four neighbours and the lattice as a whole is rigid because no point can move without all the others reorganising. The same is true here: it is the manifold form of mutual-support.

### 7.4.1 — Geometric character

- **Unit cell.** A single Schwarz-Diamond cell is the bloom of $z = x \cdot y$ on its native domain. It is two **interlaced helices** (one per chirality) that close into a single rigid shape.
- **Cube fit.** A unit Schwarz-Diamond cell **fits perfectly inside a unit cube, touching all eight corners**. This is its packing signature and the reason it tiles cleanly into cubic lattices (see 7.4.3 below). It is also the reason a Schwarz-Diamond unit and a cube share a coordinate system without conversion — they are dual under the canonical lens.
- **Cycle form.** Two cells joined at a 90° rotation form the *complete cycle* — $z = xy \cdot (90°) \cdot z = xy$ — the smallest closed substrate. Three or more cells along the x-axis form a *line*; this is the Starfighter spine and the FastTrack track.
- **Spin trace.** A unit cell rotated about its z-axis traces a **black-widow mark** — two opposed lobes joined at a contracted waist; the *zero-point* (the contracted waist) **moves up and down along the axis depending on rotation direction**. This is one of the most depictable signatures of the substrate and is the basis of the void-page Exhibit B animation.

### 7.4.2 — Mutual-support property

Every point on a Schwarz-Diamond cell participates in the bloom of every other point. Removing or perturbing any single point reorganises the entire cell. Operationally:

- A query at any one $(x, y)$ resolves *with reference to* the rest of the cell — there is no local-only evaluation. This is what gives the substrate its *holographic* feel and its strong invariance under partial information loss.
- The substrate is therefore **not addressable by index alone** — the address is the *role of the point in the cell*, not its coordinate in a flat array. This is also why §1 of `SUBSTRATES.md` insists Schwarz Diamond is an *auxiliary lens* never used for storage or routing: addressing it as a database voids its mutual-support property.

### 7.4.3 — Lattice composition (rows, planes, cubes)

Schwarz-Diamond cells **interlace in xyz patterns** to form composite substrates:

- **Row** — n cells along x, alternating chirality. Used for the FastTrack track spine and the Starfighter convoy lane.
- **Plane** — n × m cells in xy with chirality alternating in a checkerboard. Used for the brick-field in BrickBreaker3D.
- **Cube** — n × m × k cells in xyz with three-axis chirality alternation. This is the **honeycomb spaceship hive** in Starfighter and the **cube** in 4DConnect. Both are the same substrate addressed by different lenses; the hive lens emphasises traversal between cells, the connect lens emphasises winning-line topology across cells.

The interlacing is **mandatory** — adjacent cells of the same chirality cannot share a face without producing a singular point that violates Con 4.1 (Division Constraint). The chirality alternation is what makes the lattice non-singular.

### 7.4.4 — Relation to the canonical Gyroid substrate

Per `SUBSTRATES.md`, the **Gyroid is the canonical substrate** — it is what the system *stores against, indexes against, and routes by*. The Schwarz Diamond is **never** used for any of those things. Its job is to provide the atomic-lattice character where the gameplay or visualisation requires mutual-support semantics (the hive, the cube, the diamond animations). All long-term state lives on the Gyroid; the Schwarz Diamond is summoned for query-time geometry and dissolved when the query closes.
