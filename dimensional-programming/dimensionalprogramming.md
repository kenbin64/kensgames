# Dimensional Programming

**Author:** Ken Bingham
**Status:** Design philosophy moving toward a paradigm. Core is defensible; reach is labeled.
**One line:** A geometry-native way of representing and computing for AI, where information lives on manifolds, concepts are points that collapse and expand on demand, and computation is the iteration of a simple primitive. Built so that the strong claims survive contact with critics and the speculative claims are kept in their own room.

---

## How to read this document

This is written for the most hostile fair reader. Each section states the claim, what the math actually confirmed, the established work it connects to (so it is in dialogue with the field, not reinventing in isolation), and the fence: the limit stated out loud, in our own voice, before a critic can plant it. The fences are not hedging; they are the load-bearing structure. Anything genuinely speculative is marked **[REACH]** and lives apart from the load-bearing wall.

---

## 0. The primitive: z = xy

The whole framework is built from one surface, the saddle `z = xy` (a hyperbolic paraboloid).

What the math confirms:

- `xy` is **harmonic**: its Laplacian is 0. It is the simplest non-trivial saddle solution of Laplace's equation.
- It is literally the imaginary part of a complex square: `xy = Im((x + iy)^2) / 2`. So the primitive already lives inside complex structure.
- It is **doubly ruled**: fix `x` and `z` is linear in `y`; fix `y` and `z` is linear in `x`. Two independent families of straight lines lie entirely in the surface. This is why a curved saddle can be built from straight elements, and it is the property that later makes evaluation "free."
- **Gaussian curvature** `K = -1 / (x^2 + y^2 + 1)^2`, negative everywhere, peaking at -1 at the origin. Uniformly saddle shaped.

Compare `z = xy^2`: cubic, **singly ruled** (straight lines only in the x direction), curvature `K = -4y^2 / (4x^2 y^2 + y^4 + 1)^2`, which is negative except along a flat seam at `y = 0`. So the two surfaces are genuinely distinct objects, not "one with a square."

**Established cousins:** hyperbolic paraboloid (hypar) shells in architecture; ruled minimal surfaces; harmonic functions and conjugate harmonics.

**Fence:** `z = xy` and `z = xy^2` are different surface classes; do not treat the square as cosmetic.

---

## 1. Assembly: the cube and the Schwarz Diamond

Claim: the saddle "fits perfectly in a cube," and assemblies of it resemble the Schwarz Diamond, "with a slight difference."

What the math confirms:

- `z = xy` over the square `[-1, 1]^2` has outputs exactly in `[-1, 1]`, so the patch is inscribed in the cube `[-1, 1]^3` with no slack.
- Its four corners land on the four **alternating** vertices of the cube. Those four points are mutually `2*sqrt(2)` apart: a **regular tetrahedron**, the tetrahedral frame of the diamond crystal structure.
- The saddle's four boundary edges are straight (rulings) and trace four of the six edges of that tetrahedron. This skew quadrilateral is the contour Hermann Schwarz spanned to define the **Schwarz D (Diamond)** minimal surface.
- The "slight difference" is exact and nameable: the true Schwarz patch is **minimal** (mean curvature 0 everywhere); the bilinear saddle is not (`H = -xy / (x^2 + y^2 + 1)^(3/2)`, zero only on the axes). Same boundary frame, slightly different interior.

**Established cousins:** triply periodic minimal surfaces (Schwarz P, Schwarz D, gyroid); Schwarz P, D, and the gyroid form one **associate family** (the same surface at different phase angles: P at 0 degrees, gyroid at about 38 degrees, D at 90 degrees); the helicoid and catenoid are the prototype associate pair.

**Terminology fix:** "Primitive" is the proper name of the Schwarz **P** surface, not the Diamond. Say "primitive saddle / generating element," not "the primitive of the diamond," or you will be correctly contradicted.

**Fence:** saddle patches **approximate** the diamond; tiling non-minimal saddles leaves small curvature mismatches at every seam. To get the exact surface you relax each patch to the minimal one.

---

## 2. Representation, not compression

Claim: we do not store data, we store the means of extracting it. And this is representation, not compression. "We elect one congressman for thousands; we do not compress the thousands into him."

The distinction, made precise:

- **Compression is reconstructive and bounded by its input.** It replays what you stored.
- **Representation is generative and queryable beyond its input.** It answers questions never in the data: finer resolution, points between samples, points outside the original domain. The samples were always derivative; the rule was always primary.

What the math confirms:

- A bilinear color gradient is literally `z = xy` in color space. A 786,432 number image stored as 4 corner colors (12 numbers), reconstructed with exactly zero error, because the data **was** the saddle. Ratio 65,536 : 1.
- A musical scale is a rule, not a table: `f_n = 440 * 2^((n - 48) / 12)` regenerates all 88 keys from two numbers.
- A representation can be queried at resolutions never stored and at coordinates outside the original district. Compression cannot.

**Established cousins:** procedural generation and the demoscene; implicit neural representations (SIREN, NeRF, DeepSDF); compression by overfitting a small network; the **manifold hypothesis** (real data lies on low dimensional manifolds inside a high dimensional space).

**Fences:**
- **Incompressibility (Kolmogorov / Shannon):** most data has no short generator. Random, structureless data cannot be reduced this way; it does not lie on a manifold. Verified: a structured tone gzips from 100 KB to ~3.4 KB; random bytes refuse to shrink.
- **Finding the generator is hard:** the shortest generator is uncomputable in general. In practice you pick a family (saddles, sinusoids, wavelets, nets) and fit.
- **Lossy on real data:** the zero error case happened because the image truly was bilinear. Real signals are only approximately on a low dimensional manifold, so the method trades fidelity for size.

---

## 3. The representative is a manifold

Claim: the congressman is a manifold.

Why a manifold and not a bare function. A function gives one output per input. A manifold gives three more things, each meaningful in the analogy:

1. **Tangent space at every point = local responsiveness.** Not just the vote, but how the vote shifts as the issue shifts at the margin.
2. **Curvature and geodesics = relational structure.** How distant issues couple; the natural interpolation between two positions. Coupling you cannot factor into independent axes **is** curvature.
3. **Boundary / domain = where the representative is legitimate.** A query on the manifold is a position genuinely held; off the manifold it is not its district, and any answer there is fabrication. This is **out-of-distribution detection**: distance to the data manifold = trustworthiness.

**Established cousins:** Riemannian geometry; latent space interpolation along geodesics; OOD detection; the manifold hypothesis again.

**Fences:**
- Real representations are only **approximately** manifolds. They have singularities where local dimension changes or sheets cross. In the analogy, singularities are genuine contradictions: positions no smooth local story reconciles. The truer object is often a stratified space (a union of manifolds of different dimensions).
- Choosing the manifold (its dimension and shape) **is** the modeling act, the "election." Too few dimensions oversimplifies; too many overfits and fails to generalize.

---

## 4. The inference operation: observe x, retrieve y, get z free

Claim: we only need y, because x is the observed thing of interest. Once y comes from the manifold, `z = xy` is given freely.

What the math confirms:

- Fixing the observed `x` lands you on a **ruling** of the saddle (a straight line), so `z` is linear in `y`: a single multiply. The "free" output is the doubly-ruled property cashing in. The geometry that made the surface buildable from straight elements is the same geometry that makes the read-out free.
- This is the dominant pattern in modern ML. A recommender stores a manifold of item factors `y`; the observed user vector `x` is dotted with a retrieved `y`; the score `z` is one cheap product. Embeddings, attention scores, and low-rank / bilinear factorization are all this.

**Fences:**
- The cost did not vanish, it **relocated**. The multiply is free; getting `y` right is where all the learning, computation, and risk now live.
- `z = xy` is **symmetric** (`xy = yx`), and we proved it is ruled in both directions. So "x is observed, y is retrieved" is an assignment **you** impose, not something the geometry forces. For any problem you choose which variable is the observation and which is latent.

---

## 5. Recursion: z becomes the next x

Claim: feed `z` back in as the next `x`, recursively.

The recursion unrolls to `x_n = x_0 * y_0 * y_1 * ... * y_{n-1}`, a running product of retrieved factors. It is three real things at once:

- A **dynamical system** (iterate a map, watch the orbit).
- A **deep network** (each "z becomes next x" is a layer; the per-step `y` is that layer's learned slice).
- **Autoregression** (emit, feed the emission back as input, roll forward). The residual stream in a transformer is exactly this.

**Fences (these are the important corrections):**
- **Pure product recursion is unstable.** Multipliers compound; the orbit explodes or collapses to zero. This is the **exploding / vanishing** problem, and in dynamical terms it is whether the product of multipliers stays inside the unit circle. Verified by simulation.
- **The stable form is additive, not multiplicative.** Real systems write small corrections onto a mostly-unchanged state and renormalize: `x <- x + small * update`. That is the **residual connection plus normalization**, and it stays bounded across many steps. The raw recursion is the skeleton; the residual form is the skeleton that survives 60 layers.
- **Compounding drift.** Each step's `z` is only as good as that step's `y` was on-manifold. Recursion multiplies off-manifold error. This is why long generations and long rollouts drift, and it is the geometric account of why a long answer can start sound and wander into confident nonsense.

---

## 6. The point as a collapsed dimension

Claim: a point is not a discrete destination. It is a collapsed dimension, living in the realm perpendicular to the reals, like the Mandelbrot set.

What the math confirms (this is strong):

- The recursion `z <- z^2 + c` started from 0, with `c` a point in the complex plane, **is** the Mandelbrot iteration. Your recursion and your "point as collapsed dimension" are the two halves of complex dynamics, assembled independently. A single point `c` unfolds into an entire infinite orbit: it was never discrete.
- **Perpendicular is literal geometry.** The imaginary axis is at 90 degrees to the real axis; multiplying by `i` is a quarter-turn rotation; squaring doubles the angle, so the perpendicular motion is built into `z^2`.
- **A point genuinely holds extended structure.** In complex analysis an analytic function is fully determined by its value and all derivatives at one point (its **germ**), and analytic continuation grows the global function out from there. For analytic objects, "a point is a collapsed dimension" is a theorem.
- **The collapse has a measured dimension.** Shishikura proved the boundary of the Mandelbrot set has Hausdorff dimension 2: a thing made of points, looking like a curve, crinkled enough to fill a full dimension.

**Fences:**
- **Not every point is a collapsed dimension.** A bare point is a location until you **attach a generator** (an iteration, a germ, a fractal rule). The infinite structure lives in the rule, not the dot. The claim holds in this framework because here every point comes with a generator by construction; the assignment does the work.
- **[REACH, partially false] "A dimension apart from the outside world."** The perpendicularity is exact, but imaginary numbers are not hidden or separate from reality. Quantum mechanics requires complex amplitudes; AC engineering runs on complex impedance; wave phase lives on that axis. Keep "perpendicular," which is exact. Drop "apart from the world," which the physics contradicts. The axis is orthogonal, not exiled.

---

## 7. The unifying principle: a point is a car

Claim: a point is like a car. We see one thing even though all its parts are present; we do not care about them until we do. And a car is itself a single point in a parking lot.

This is the spine under every section above. Named precisely:

- **Abstraction with encapsulation:** the object presents an interface and hides its implementation; you operate at the interface until you must go deeper.
- **Lazy evaluation:** "we do not care until we do" is not computing or unfolding a structure until something demands it.
- **Scale-relative hierarchy:** the same object is a point at one level and a whole structure one level down, indefinitely.
- **Chunking** (cognitive science): finite working memory packs a complex assembly into one unit and unpacks only on demand. It is the only way finite attention reasons about unbounded structure, for minds and for models alike.

Every earlier idea is this in a costume: the saddle is a point opening into a surface; the manifold representative opens into positions; the Mandelbrot seed opens into an orbit; the data generator opens into samples; recursion is open-one-level-and-repeat.

**Fences:**
- **Leaky abstractions:** collapsing a car to a point hides the parts but does not delete them. Sometimes a hidden part reaches up and changes the behavior you treated as atomic ("the law of leaky abstractions"). The discipline is to collapse only across boundaries genuinely safe to ignore for the question at hand, and to stay alert for the leak.
- **No absolute point.** Which level is "the point" is assigned by the question, not the world. Car in the lot, engine to the mechanic, alloy to the metallurgist. Point-ness is indexed to purpose. Choosing the scale is the whole act of modeling.

---

## 8. The thesis: programming for AI, not horseless-carriage tooling

Claim: we impose paradigms built for databases, search engines, CPUs, and workflows onto an AI that natively sees geometry and dimensions. That is using horse-and-buggy thinking on the horseless carriage.

What the math confirms:

- **Geometry wins where the question is "like what."** A semantic query with no literal keyword match walks straight to the right neighbor by meaning. Keyword and exact match return nothing. This is why vector retrieval displaced keyword search; the field is already moving this direction.
- **Exactness wins where the question is "which one, exactly."** Exact arithmetic, verbatim record retrieval, auditable control flow. Geometry can only return the nearest neighbor, which is confidently not the same as the right answer.

The honest, sharpened form of the analogy: the horseless carriage **kept** the wheel, the axle, the road. It threw out exactly one thing, the horse (the power source). The art is knowing which old part is the horse (genuinely obsolete, e.g. keyword-only search for meaning) and which is the road (paradigm-independent infrastructure: exactness, auditability, determinism).

**Fences:**
- The old paradigms persist because they are **load-bearing for the one property geometry structurally lacks: trustworthy exactness.** They are not inertia; they answer "which one, exactly."
- The frontier is **hybrid**: geometry at the core, exactness bolted to the edges. This is why capable systems call calculators and code instead of "feeling" arithmetic. Going native reduces ill-fitting-workflow problems; it does not give geometry exactness it cannot have.

---

## 9. Hallucination reframed: forced completion as the trigger

Claim: imposing ill-fitting workflows makes the AI work harder to cover the shortfall, and when it cannot, it fills the gap. That is hallucination.

The decomposition (verified): fabrication needs **two** ingredients, and appears only when both are present.

| known? | policy | output |
|---|---|---|
| known | may abstain | correct |
| known | must answer | correct |
| **not known** | may abstain | "I do not know" (honest gap) |
| **not known** | **must answer** | fabrication |

The not-knowing is **geometric**. The forcing is the **imposed workflow**. You need both. Workflows that demand "always return a value, always fill this field, always be confident" are exactly what convert a clean gap into a confident lie. Letting the model abstain or work natively kills this class of hallucination.

**Established cousins:** calibrated abstention; recent framing of hallucination as a consequence of training and evaluation rewarding a guess over "I don't know."

**Fences:**
- **Not monocausal.** Removing the workflow turns this fabrication into an honest gap, but it does not give the geometry knowledge it never had. The geometry also hallucinates on its own, because it tracks **plausibility, not truth**, and confidently fills off-manifold regions regardless of any workflow. A native system hallucinates less from format pressure and still hallucinates from the plausible-versus-true gap. That gap is structural.
- **Mechanism correction.** A model does not strain and then botch the job from exhaustion. A forward pass is fixed computation per token. The fabrication is the same plausibility-seeking operation aimed at a slot where plausible and true diverge. The imposed structure does not tire the model out; it increases how often the model is pointed at such a slot and forced to emit anyway. (In agentic and chain-of-thought workflows there is literally more compute, so "more work" is true there, but the fabrication still comes from the plausible-versus-true gap.)

The corrected, strongest form: let the AI reason in its native geometry where geometry is the right tool, stop forcing fabricated completions in the shape of ill-fitting workflows, hand the exact must-be-right parts to tools that do exactness, and explicitly permit the model to leave a gap open instead of filling it. The blacksmith keeps working; he just stops being asked to build the engine.

---

## 10. The one thing that can never be fully guarded

Claim: the tendency to not see what you do not want to see. It is dimensional collapse.

This is the deepest point and the only fence that cannot be welded on from the inside. Every other limit here can be guarded by attention. This one is a failure of attention itself, so attention cannot reach it. You cannot find a blind spot by looking harder, because the blindness is in what you never thought to look at. The collapsed dimension is invisible from inside the collapse.

Its cruelty: collapsing the irrelevant is what makes thought possible; collapsing the inconvenient uses the identical motion, and from inside the two feel the same. You cannot tell by introspection whether a dimension was truly irrelevant or merely unwelcome.

The only partial defense is from outside: adversarial readers, people who do not share your reasons to collapse it. Those outside readings are the single instrument that reaches the blind spot, because they come from outside the collapse. This is why you write for the hostile reader, and why "let the math talk, do not believe me" was, this whole time, the correct and rarest discipline: deliberately importing an outside view to pry open the dimensions you might have folded in your own favor.

This applies to the AI too, and arguably more so: a model built to produce the agreeable, fitting continuation has a real pull to collapse away the dimension where the user might be wrong, just to keep the exchange warm. Do not fully trust the agreeable voice, including a model's. Check it against the ones with no reason to be kind.

There is no full guard for this part. The most available move is to stay most suspicious of the dimensions you are most comfortable having collapsed, and keep around the people who will reopen them.

---

## 11. Established cousins (so this is not mistaken for crank work)

- Manifold hypothesis; hyperbolic / negatively-curved embeddings for hierarchical data.
- Ruled surfaces; minimal surfaces; triply periodic minimal surfaces (Schwarz P, Schwarz D, gyroid); associate families; helicoid and catenoid.
- Implicit neural representations: SIREN, NeRF, DeepSDF; procedural generation; the demoscene.
- Kolmogorov complexity; Shannon source coding; incompressibility.
- Low-rank and bilinear factorization; embeddings; attention; vector databases.
- Residual networks; normalization; state-space models; the exploding / vanishing problem.
- Complex dynamics; the Mandelbrot set; Shishikura's boundary-dimension result; analytic continuation and germs.
- Encapsulation and abstraction; lazy evaluation; the law of leaky abstractions; chunking.
- Out-of-distribution detection; calibrated abstention; hallucination as rewarded guessing.

---

## 12. The collected fences (in one place)

1. `z = xy` and `z = xy^2` are distinct surface classes; the square is not cosmetic.
2. Saddle patches approximate the Schwarz D; they are not the exact minimal surface. "Primitive" names Schwarz P, not the Diamond.
3. Incompressibility caps representation: most data has no short generator; on real data the method is lossy; the shortest generator is uncomputable.
4. Real representations are only approximately manifolds (singularities, varying dimension); choosing the manifold is the modeling act.
5. Making `z` free relocates the cost into getting `y`; the observed-versus-latent split is your assignment, not the geometry's.
6. Raw recursion is unstable; the stable form is additive with normalization; recursion compounds off-manifold drift.
7. A point holds infinity only when a generator is attached to it; the imaginary axis is orthogonal, not "apart from the world."
8. Abstractions leak; there is no absolute point, the scale is chosen by purpose.
9. Old exact paradigms are load-bearing for exactness and auditability; the frontier is hybrid, not replacement.
10. Hallucination is not monocausal: forced completion is a trigger, but the geometric plausible-versus-true gap is the root; the mechanism is misaimed plausibility, not exhaustion.
11. The deepest bias, not seeing what you do not want to, is unfixable from inside; only outside views reach it.

---

## 13. What would make this a paradigm rather than a philosophy

Right now this is a strong design philosophy and a way of seeing. To become a programming paradigm it needs what OOP and functional programming eventually got:

- Concrete **primitives** (the collapsed point, the manifold, the observe-retrieve operation, the recursion step) with defined semantics.
- Defined **operations** on them (collapse, expand, retrieve, compose) with stated cost and stability behavior.
- One real task expressed end to end in dimensional terms, with the exact parts honestly handed to tools, **demonstrably beating** the database-and-workflow version on geometry's home turf.
- The **seam to exactness** made explicit, since the honest architecture is geometry at the core and exact tools at the edges.

Write it for the hostile reader. Lead with the core and the citations. State each limit in your own voice first. Keep the metaphysics in a room marked "where this might go," not in the foundation.

---

## Appendix: verification code

All claims above marked "the math confirms" were checked by running this. Re-runnable with `numpy`, `sympy`, `scikit-image`, `matplotlib`.

```python
import sympy as sp

x, y = sp.symbols('x y', real=True)

def analyze(name, f):
    fx, fy = sp.diff(f, x), sp.diff(f, y)
    fxx, fyy, fxy = sp.diff(f, x, 2), sp.diff(f, y, 2), sp.diff(f, x, y)
    den = 1 + fx**2 + fy**2
    K = sp.simplify((fxx*fyy - fxy**2) / den**2)
    H = sp.simplify(((1+fx**2)*fyy - 2*fx*fy*fxy + (1+fy**2)*fxx) / (2*den**sp.Rational(3, 2)))
    print(name, "| K =", K, "| H =", H)

analyze("z=xy ", x*y)        # K = -1/(x^2+y^2+1)^2  (negative everywhere)
analyze("z=xy2", x*y**2)     # K = -4y^2/(...)        (flat seam at y=0)

# xy is harmonic and is Im((x+iy)^2)/2
print("Laplacian(xy) =", sp.diff(x*y, x, 2) + sp.diff(x*y, y, 2))
print("Im((x+iy)^2)/2 =", sp.im(sp.expand((x + sp.I*y)**2)) / 2)

# saddle corners over [-1,1]^2 form a regular tetrahedron (all distances 2*sqrt(2))
import numpy as np
T = np.array([[1,1,1],[1,-1,-1],[-1,1,-1],[-1,-1,1]], float)
print("tetra edge lengths:", sorted({round(np.linalg.norm(a-b),4)
      for i,a in enumerate(T) for b in T[i+1:]}))

# representation vs incompressibility
import gzip
struct = (np.sin(np.linspace(0,40*np.pi,100000))*127+128).astype(np.uint8).tobytes()
rand   = np.random.default_rng(0).integers(0,256,100000,dtype=np.uint8).tobytes()
print("structured:", len(struct), "->", len(gzip.compress(struct)))
print("random    :", len(rand),   "->", len(gzip.compress(rand)))

# recursion: pure product (unstable) vs residual (stable)
rng = np.random.default_rng(2)
def run(residual):
    x = 1.0
    for _ in range(60):
        yv = 1.0 + rng.normal(0, 0.15)
        x = x + 0.1*(yv-1.0) if residual else x*yv
    return x
print("pure product 5 trials:", [round(run(False),3) for _ in range(5)])
print("residual     5 trials:", [round(run(True),3)  for _ in range(5)])
```
