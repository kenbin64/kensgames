# The Russian Doll — Hello World of Dimensional Programming

*The simplest program that proves the paradigm works.*

---

## Traditional Hello World

Every programming paradigm has a Hello World — the smallest possible program that demonstrates the system is alive.

```
print("Hello, World!")
```

It proves: the environment runs, output works, you're ready to build.

Dimensional Programming's Hello World proves something different: **that state is derived, not stored — and that every output wraps all prior outputs.**

---

## Dimensional Hello World

```javascript
// Dimensional Programming — Hello World
// The Russian Doll

const manifold = (x, y) => ({
  z:     `${x} · ${y}`,
  bloom: (nextY) => manifold(`${x} · ${y}`, nextY)
})

const d0 = manifold("Hello", "World")
console.log(d0.z)                    // "Hello · World"

const d1 = d0.bloom("Developer")
console.log(d1.z)                    // "Hello · World · Developer"

const d2 = d1.bloom("Universe")
console.log(d2.z)                    // "Hello · World · Developer · Universe"

const d3 = d2.bloom("∞")
console.log(d3.z)                    // "Hello · World · Developer · Universe · ∞"
```

**What just happened:**

| Step | x | y | z (manifested) |
|------|---|---|----------------|
| d0 | `"Hello"` | `"World"` | `"Hello · World"` |
| d1 | `"Hello · World"` | `"Developer"` | `"Hello · World · Developer"` |
| d2 | `"Hello · World · Developer"` | `"Universe"` | `"Hello · World · Developer · Universe"` |
| d3 | `"Hello · World · Developer · Universe"` | `"∞"` | `"Hello · World · Developer · Universe · ∞"` |

Each `z` becomes the next `x`. Nothing is discarded. Every prior state is contained inside the current one.

That is the Russian Doll.

---

## What This Proves

### 1. z is never stored — it is derived

There is no variable holding `d0.z` after `d1` exists. The value is recomputed on access from `x` and `y`. If you need it again, you derive it again.

### 2. z becomes the next x

`d1` does not "extend" `d0`. `d1` is a new manifold observation where the seed is the entire prior manifested state. The prior state is now the identity.

### 3. The doll contains all prior dolls

`d3.z` contains everything that came before it. You can read the full history from any `z` because every bloom wraps all prior blooms.

### 4. The manifold never changes — the observation does

`manifold()` is a pure function. The field is stable. What changes is which identity you bring to it and which modifier you apply. Different seeds, different observations, different emergences — same underlying field.

---

## Compared to Traditional Hello World

| Property | Traditional | Dimensional |
|----------|-------------|-------------|
| State model | Variable assigned and overwritten | Each state wraps all prior states |
| Output | Printed and gone | Contained inside the next output |
| Memory | Explicit storage required | Implicit in the doll structure |
| History | Lost unless you log it | Structurally preserved |
| Mutation | `message = newMessage` overwrites | `bloom()` wraps — nothing destroyed |

---

## The Full Pattern

```
z = x · y          ← one observation
z → x′             ← z becomes the next identity
x′ · y′ → z′       ← new observation, wrapping the old
z′ → x′′           ← and again
...
```

This is not iteration. There is no loop. Each step is a complete, self-contained observation of the field. The recursion is in the structure of the identity, not in the control flow of the program.

---

## Why This Is the Right Hello World

Traditional Hello World proves the runtime works.

The Russian Doll proves the paradigm works:

- `z = x · y` ✓
- z is derived, not stored ✓
- z becomes the next x ✓
- Prior states are structurally preserved ✓
- The manifold is stable; the observations change ✓

If you understand the Russian Doll, you understand Dimensional Programming.

---

*Kenneth Bingham — ButterflyFx — X-Dimensional Paradigm*
