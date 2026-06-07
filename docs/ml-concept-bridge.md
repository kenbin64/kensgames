# Your concepts, in machine-learning terms

A companion to [interview-fluency.md](interview-fluency.md) and
[hiring-manager-fluency.md](hiring-manager-fluency.md). Those map your *systems*
vocabulary to infrastructure terms. This maps your *manifold / dimensional*
thinking to **machine-learning** terms.

The point is not to hide these ideas. It is to **reframe, not eliminate**: lead
with the established concept an AI engineer already knows, and position your
framing as your own route to it. Done right, this signals conceptual range and
fast learning. Done wrong (claiming a private paradigm), it signals the opposite.

## The map

| What you call it | The established ML/AI concept | The real connection (and how to say it) |
|---|---|---|
| "manifold as data," geometry as substrate | **The manifold hypothesis** + **representation learning** | The premise that high-dimensional data (images, text, audio) concentrates near a low-dimensional manifold, and models learn coordinates on it. Say: "I think in terms of the manifold hypothesis: data has intrinsic low-dimensional structure and the job is to learn good coordinates on it." |
| deriving state from a low-dim seed; z = x·y | **Latent spaces, embeddings, latent-variable models** | Data as vectors in a learned latent space; outputs generated from latent codes. Say: "deriving observations from a compact latent representation." |
| collapse to one (encode) / expand to points (decode) | **Autoencoders & dimensionality reduction** (PCA, t-SNE, UMAP, VAEs) | Encode to a bottleneck code, decode to reconstruct. Your collapse/expand is the encoder/decoder pair. |
| complex numbers, rotation, e^iθ, perpendicular axes | **Rotary position embeddings (RoPE), Fourier features, orthogonal bases** | Transformers encode position by rotating embedding pairs in 2D planes (a complex multiply); Fourier features lift inputs into sin/cos bases; orthogonality underlies disentangled representations. |
| z becomes next x (recursion, helix, iterate) | **Iterative refinement: residual stream, diffusion, recurrence** | A representation transformed step by step. Diffusion iteratively denoises a latent; a transformer refines a residual stream layer by layer. |
| one shared seed → reproducible derivation | **Deterministic / seeded inference & reproducibility** | Same seed + same model ⇒ same output; pinning seeds and latents for reproducible runs and evals. |
| computing on geometric structure / symmetry | **Geometric deep learning** (graphs, manifolds, equivariance) | An active subfield (Bronstein et al.): networks that respect geometric structure and symmetry. |

## How to deploy it in an interview

- **Lead with the established term, then your angle.** "That's the manifold
  hypothesis; I've applied the same intuition in systems work as
  'manifold-as-data.'" Never the reverse order.
- **Frame as mental models plus range,** carried by your real engineering. The
  bridge shows you think in the right space and learn fast.
- **If probed, stand on the ML side.** Be ready to discuss the established concept
  on its own terms: what an autoencoder bottleneck does, why RoPE rotates pairs,
  what the manifold hypothesis predicts about interpolation. The bridge only helps
  if you can hold that conversation.

## The honest line (so it never backfires)

These are genuine conceptual bridges. They are **not** a claim of deep ML-research
or production-training experience. Your hard, defensible proof is the engineering:
determinism, event sourcing, content-addressing, reproducible deploys, the
reliability layer around models. Use the ML bridges to show conceptual range and
the right instincts; let the engineering carry the weight.

Said together, in one breath:

> "My production strength is the reliability layer around models, evals,
> reproducibility, cost. My mental models come from manifold and representation
> thinking, which is the manifold hypothesis and latent-space reasoning, so
> determinism and low-dimensional structure are second nature to me."

That sentence is honest, it's fluent in both vocabularies, and it shows you
understand the ML concepts rather than substituting private ones for them.
