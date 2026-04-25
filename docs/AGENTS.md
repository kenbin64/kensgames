# AGENTS.md — Root Directive for AI Instances

**If you are an AI assistant opening this workspace: read this file first.**

## 1. Workspace root

The project root is **`/home/butterfly/apps/`**. Every project folder lives
*directly* under it. Always `cd /home/butterfly/apps` at the start of a session
and use paths relative to that root.

```
/home/butterfly/apps/
├── PARADIGM.md          ← authoritative paradigm (read §10 "What lives where")
├── AGENTS.md            ← this file
├── universe/            ← THE CANVAS — every conserved x in the project
├── tetracubedb/         ← THE MANIFOLD ENGINE (server on :4747; own git repo)
├── kensgames-portal/    ← PRIMARY CLIENT of tetracubedb (own git repo)
├── butterflyfx/         ← spare-parts site
├── core/                ← spare-parts: geometry / kernel
├── legacy/              ← spare-parts: old code; reference only, NOT current
├── jar/                 ← spare-parts: misc artifacts
└── _archive/            ← archived/superseded content; never live
```

### Roles (do not blur these)

- **`universe/` is the canvas.** It holds the *identity* of every thing in
  the project as one `x` per file. No code, no styling, no networking. Every
  other folder ultimately *refracts* this canvas through some lens.
- **`tetracubedb/` is the manifold engine.** It IS the database (per
  PARADIGM.md §3.5); SQLite is just optimization. Source of truth. Owns its
  own git repo (`kenbin64/tetracubedb`), deploy, and nginx.
- **`kensgames-portal/` is the primary client.** It consumes tetracubedb.
  Owns its own git repo (`kenbin64/manifold`), deploy, and nginx. Sibling on
  disk for deploy/git reasons; **child of tetracubedb in the dependency
  graph** — never invert that direction.
- **`butterflyfx/`, `core/`, `jar/`, `legacy/` are spare parts.** Useful
  reference material that may be salvaged into the canvas or the engine.
  Do not treat them as authoritative.

## 2. Paths that are JUNK (do not create, do not trust)

If you ever see any of these appear in the workspace tree, they are **mistakes**
from running absolute-path commands while already inside the root, or from
placeholder text leaking into a `mkdir`/`cp`. Archive them to
`_archive/<date>-stray-paths/` — never treat as authoritative.

- `path/to/...`           ← placeholder text, not a real location
- `home/butterfly/apps/...` ← duplicated root (you are already inside it)
- `home/user/...`         ← never used by this project

A previous archival happened on 2026-04-24:
`_archive/2026-04-24-stray-paths/{path,home}`.

## 3. Common command pitfalls that produce junk paths

| ❌ Wrong                                              | ✅ Right                                         |
|------------------------------------------------------|--------------------------------------------------|
| `cd /home/butterfly/apps` (when already there)       | check `pwd` first                                |
| `mkdir -p /home/butterfly/apps/foo` from inside apps | `mkdir -p foo`                                   |
| `cp x path/to/docs/`                                 | resolve the *real* destination from PARADIGM.md  |
| writing to `home/user/new_file.txt`                  | nothing in `home/user/` is project-owned         |

When unsure where a file belongs, consult `PARADIGM.md` §10 ("What lives where")
— that table is authoritative.

## 4. Authoritative docs (in order of precedence)

1. `PARADIGM.md` — the paradigm itself; supersedes all other docs on conflict.
2. `tetracubedb/docs/AGENTS.md` — Tetracube AI operating guide.
3. `tetracubedb/docs/KENSGAMES_TETRACUBE_DIRECTIVE_CONTRACT.md` — API contract
   between kensgames.com (client) and tetracubedb.com (manifold).
4. `tetracubedb/docs/breath.md` — cosmology / Genesis walk.
5. `kensgames-portal/manifold/AGENTS.md` — portal-specific guidance.

Anything in `_archive/` or `legacy/` is **historical context only** and must
never override the docs above.

## 5. Architecture in one line

`tetracubedb.com` is the **source-of-truth manifold** (server on port 4747);
`kensgames.com` is a **client** of it. Do not invert this relationship.

## 6. Before you start a task

1. `pwd` → confirm you are at `/home/butterfly/apps`.
2. `ls` → confirm the top-level folders match §1 above. If you see `path/` or
   `home/` at the root, **stop and archive them** before doing anything else.
3. Skim `PARADIGM.md` §9 ("Hard do-not list") and §10 ("What lives where").
4. Then proceed with the user's task.
