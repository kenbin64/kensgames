const fs = require('fs');
let c = fs.readFileSync('engine/export_three.py', 'utf8');

// Fix 1: tessellator — pre-allocate vertex/face lists with known sizes, avoid
// 40,000 extend() calls. Use index arithmetic directly.
const oldTessBody = `    vertices: list[list[float]] = []\r\n    faces:    list[list[int]]  = []\r\n\r\n    step = 2.0 / res  # step size in [-1, 1] range\r\n\r\n    for i in range(res):\r\n        for j in range(res):\r\n            # Four corners of the current quad cell\r\n            x0 = -1.0 + i * step\r\n            y0 = -1.0 + j * step\r\n            x1 = x0 + step\r\n            y1 = y0 + step\r\n\r\n            z00 = manifold.evaluate(x0, y0, t)\r\n            z10 = manifold.evaluate(x1, y0, t)\r\n            z01 = manifold.evaluate(x0, y1, t)\r\n            z11 = manifold.evaluate(x1, y1, t)\r\n\r\n            base = len(vertices)\r\n\r\n            vertices.extend([\r\n                [round(x0 * scale, 6), round(y0 * scale, 6), round(z00 * scale, 6)],\r\n                [round(x1 * scale, 6), round(y0 * scale, 6), round(z10 * scale, 6)],\r\n                [round(x0 * scale, 6), round(y1 * scale, 6), round(z01 * scale, 6)],\r\n                [round(x1 * scale, 6), round(y1 * scale, 6), round(z11 * scale, 6)],\r\n            ])\r\n\r\n            # Two triangles: lower-left and upper-right of the quad\r\n            faces.append([base,     base + 1, base + 2])\r\n            faces.append([base + 1, base + 3, base + 2])`;

const newTessBdy = `    # Pre-allocate: res² quads, 4 verts + 2 faces per quad.
    # This eliminates 40,000 individual extend/append calls at res=100.
    n_quads   = res * res
    vertices: list[list[float]] = [None] * (n_quads * 4)  # type: ignore[list-item]
    faces:    list[list[int]]   = [None] * (n_quads * 2)  # type: ignore[list-item]

    step  = 2.0 / res  # step size in [-1, 1] range
    vi    = 0          # vertex write cursor
    fi    = 0          # face write cursor

    for i in range(res):
        x0 = -1.0 + i * step
        x1 = x0 + step
        for j in range(res):
            y0 = -1.0 + j * step
            y1 = y0 + step

            z00 = manifold.evaluate(x0, y0, t)
            z10 = manifold.evaluate(x1, y0, t)
            z01 = manifold.evaluate(x0, y1, t)
            z11 = manifold.evaluate(x1, y1, t)

            # Write four corners directly by index — no extend() allocation
            vertices[vi]     = [round(x0 * scale, 6), round(y0 * scale, 6), round(z00 * scale, 6)]
            vertices[vi + 1] = [round(x1 * scale, 6), round(y0 * scale, 6), round(z10 * scale, 6)]
            vertices[vi + 2] = [round(x0 * scale, 6), round(y1 * scale, 6), round(z01 * scale, 6)]
            vertices[vi + 3] = [round(x1 * scale, 6), round(y1 * scale, 6), round(z11 * scale, 6)]

            # Two triangles: lower-left and upper-right of the quad
            faces[fi]     = [vi,     vi + 1, vi + 2]
            faces[fi + 1] = [vi + 1, vi + 3, vi + 2]

            vi += 4
            fi += 2`;

if (!c.includes(oldTessBody)) {
  console.error('tessellator OLD string not found');
  process.exit(1);
}
c = c.replace(oldTessBody, newTessBdy);

// Fix 2: _sign_payload — stop mutating in-place; return a new dict.
// Mutating the passed dict is surprising when the caller keeps a reference to it.
const oldSign = `    payload_bytes = json.dumps(\r\n        {k: v for k, v in data.items() if k != "hash"},\r\n        separators=(",", ":"),\r\n        sort_keys=True,\r\n    ).encode()\r\n    data["hash"] = hashlib.sha256(payload_bytes).hexdigest()\r\n    return data`;

const newSign = `    # Build output as a new dict — avoids mutating the caller's reference.
    payload = {k: v for k, v in data.items() if k != "hash"}
    payload_bytes = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    return {**payload, "hash": hashlib.sha256(payload_bytes).hexdigest()}`;

if (!c.includes(oldSign)) {
  console.error('_sign_payload OLD string not found');
  process.exit(1);
}
c = c.replace(oldSign, newSign);

fs.writeFileSync('engine/export_three.py', c, 'utf8');

const v = fs.readFileSync('engine/export_three.py', 'utf8');
console.log('pre-alloc ok:   ', v.includes('n_quads   = res * res'));
console.log('no extend ok:   ', !v.includes('vertices.extend'));
console.log('sign immut ok:  ', v.includes('return {**payload'));
