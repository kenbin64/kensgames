'use strict';
// X-Dimensional Programming math primitives.
//
//   manifold   = a geometric shape from a math expression that holds
//                properties / attributes convertible to computation
//                datatypes and operations.
//   substrate  = the observer that yields the manifold's current value
//                given a state (x, y, z, ...).
//   x = identity (who / what)
//   y = behavior (how / over what)
//   z = expression of x and y (current observable state)
//
// All functions here are pure (no I/O, no mutable globals). They are the
// reference implementations the test suite checks game manifests + game
// code against.

const EPS = 1e-9;
const approxEq = (a, b, eps = EPS) => Math.abs(a - b) < eps;

function denomOrOne(v) {
    const n = Number(v);
    return Number.isFinite(n) && n !== 0 ? n : 1;
}

// ── Algebraic relation family ─────────────────────────────────────
// Each relation is a predicate: given a tuple, returns true iff the
// declared algebraic identity holds (within EPS).
const RELATIONS = {
    'z=xy': (x, y, z) => approxEq(z, x * y),
    'z=x/y': (x, y, z) => approxEq(z, x / denomOrOne(y)),
    'z=xy^2': (x, y, z) => approxEq(z, x * y * y),
    'z=x/y^2': (x, y, z) => {
        const d = denomOrOne(y);
        return approxEq(z, x / (d * d));
    },
    'x=yz': (x, y, z) => approxEq(x, y * z),
    'x=y/z': (x, y, z) => approxEq(x, y / denomOrOne(z)),
    'y=xz': (x, y, z) => approxEq(y, x * z),
    'y=x/z': (x, y, z) => approxEq(y, x / denomOrOne(z)),
    // 4-dimensional extension. m is the fourth axis (e.g. temporal layer
    // or 4-dim board height). Relation holds iff m = x*y*z.
    'm=xyz': (x, y, z, m) => approxEq(m, x * y * z),
};

// Inverse / consistency lemmas:
//   z = x*y      ⇒ x = z/y       and y = z/x       (when y, x ≠ 0)
//   z = x/y      ⇒ x = z*y       and y = x/z       (when y, z ≠ 0)
//   z = x*y^2    ⇒ x = z/(y^2)   and y = sqrt(z/x) (when x, y ≠ 0)
function invertZxy(x, y, z) {
    return {
        x_from_zy: y !== 0 ? z / y : null,
        y_from_zx: x !== 0 ? z / x : null,
    };
}

// ── Geometric substrates (triply-periodic minimal surfaces) ───────
//
// Each function takes (x, y, z) in radians and returns a scalar field
// value. The implicit surface is the zero level-set: f(x,y,z) = 0.
// A substrate is the *observer* that evaluates this expression at a
// point in the manifold.

// Gyroid (Schoen, 1970): sin(x)cos(y) + sin(y)cos(z) + sin(z)cos(x)
function gyroid(x, y, z) {
    return Math.sin(x) * Math.cos(y)
        + Math.sin(y) * Math.cos(z)
        + Math.sin(z) * Math.cos(x);
}

// Schwarz Diamond (Schwarz D, 1865): cos(x)cos(y)cos(z) - sin(x)sin(y)sin(z)
function schwarzDiamond(x, y, z) {
    return Math.cos(x) * Math.cos(y) * Math.cos(z)
        - Math.sin(x) * Math.sin(y) * Math.sin(z);
}

// Schwarz Primitive (Schwarz P, 1865, first-harmonic): cos(x)+cos(y)+cos(z)
function schwarzPrimitive(x, y, z) {
    return Math.cos(x) + Math.cos(y) + Math.cos(z);
}

// Numeric gradient (central difference). Used to verify a substrate is
// differentiable and the gradient is non-zero on the surface (so the
// surface has a well-defined normal — a precondition for any renderer
// that uses the field as geometry).
function gradient(f, x, y, z, h = 1e-4) {
    return [
        (f(x + h, y, z) - f(x - h, y, z)) / (2 * h),
        (f(x, y + h, z) - f(x, y - h, z)) / (2 * h),
        (f(x, y, z + h) - f(x, y, z - h)) / (2 * h),
    ];
}

const norm3 = ([a, b, c]) => Math.sqrt(a * a + b * b + c * c);

// ── Substrate-as-observer contract ────────────────────────────────
// An observer is a pure function: state -> value. It must be:
//   1. deterministic (same input ⇒ same output)
//   2. side-effect free (no mutation of inputs)
//   3. defined for all reasonable states in its declared domain
function isObserver(fn, samples) {
    for (const s of samples) {
        const r1 = fn(...s);
        const r2 = fn(...s);
        if (r1 !== r2 && !(Number.isNaN(r1) && Number.isNaN(r2))) return false;
        if (typeof r1 !== 'number' || !Number.isFinite(r1)) return false;
    }
    return true;
}

module.exports = {
    EPS, approxEq,
    RELATIONS, invertZxy,
    gyroid, schwarzDiamond, schwarzPrimitive,
    gradient, norm3,
    isObserver,
};
