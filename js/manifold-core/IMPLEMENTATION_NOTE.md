# manifold-core: what it actually is

Honest scope note, so this layer is claimed accurately.

**manifold-core is a coordinate-indexed store, not a derivation.** `ManifoldSurface`
(`manifold_surface.js`) is a shim over the unified Manifold (`../manifold.js`). Its
`write(coordinate, data)` hashes the coordinate and stores the data in a `Map`
(`_data.set(hash, { coordinate, data, ... })`); `read(coordinate)` retrieves it by the
same hash. The geometry (the coordinate, `z = x*y`) is used as the **key** and for spatial
queries (`distance`, `queryNearby`), but the data is **stored and read back, not derived
from geometry**.

**What the tests prove.** `run_tests.js` (33 checks, green) verifies that this store works:
write, read, registry, coordinate mapping, the substrate-lens pattern. They do **not**
demonstrate "derive data from geometry, store nothing," because the implementation does not
do that here.

**Claim it as what it is:** a working coordinate-indexed spatial store with a clean,
tested modular substrate (lens) architecture. That is true and worth claiming.

**Do not claim it as derive-not-store.** The genuine derive-from-geometry idea (values
computed from `z = x*y` with nothing persisted) is demonstrated elsewhere, in the
interactive geometry demos, not in this storage layer.
