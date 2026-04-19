const fs = require('fs');
let c = fs.readFileSync('engine/manifold_core.py', 'utf8');

// Fix 1: eval sandbox — replace __builtins__: {} with a proper whitelist dict.
// Setting __builtins__={} still leaves class/subclass access possible via
// attribute traversal. Providing an explicit whitelist mapping closes that path.
const oldBuiltins = '"__builtins__": {},\r\n        }\r\n        code = compile(expr_str, "<dsl>", "eval")\r\n\r\n        def _expr(x: float, y: float, t: float = 0.0) -> float:\r\n            return eval(code, _safe_globals, {"x": x, "y": y, "t": t})  # noqa: S307';
const newBuiltins = '"__builtins__": {"abs": abs, "round": round, "min": min, "max": max},\r\n        }\r\n        # Validate that no name in the expression escapes the whitelist.\r\n        # compile() gives us a code object; co_names lists every identifier used.\r\n        code = compile(expr_str, "<dsl>", "eval")\r\n        _allowed = set(_safe_globals) | {"x", "y", "t"}\r\n        _unknown = set(code.co_names) - _allowed\r\n        if _unknown:\r\n            raise ValueError(f"DSL expression uses disallowed names: {_unknown}")\r\n\r\n        def _expr(x: float, y: float, t: float = 0.0) -> float:\r\n            return eval(code, _safe_globals, {"x": x, "y": y, "t": t})  # noqa: S307';

if (!c.includes(oldBuiltins)) {
  console.error('sandbox OLD string not found — check bytes');
  process.exit(1);
}
c = c.replace(oldBuiltins, newBuiltins);

// Fix 2: NPC motion — use Manifold() directly (bypasses from_dsl registry side-effect)
// from_dsl calls cls(name, expression, **attributes) which calls __init__ which
// registers the manifold in _registry. NPC internal motion should not pollute it.
const oldMotion = 'self.motion    = Manifold.from_dsl(f"{name}_motion", "x*y * sin(t)")';
const newMotion = '# Internal motion substrate — constructed directly to avoid polluting\r\n        # the global _registry with NPC-internal names.\r\n        _motion_expr = lambda x, y, t=0.0: x * y * math.sin(t)\r\n        object.__setattr__(self, \'motion\', Substrate(evaluate=_motion_expr))';

if (!c.includes(oldMotion)) {
  console.error('NPC motion OLD string not found — check bytes');
  process.exit(1);
}
c = c.replace(oldMotion, newMotion);

// Fix 3: NPC.tick — now calls self.motion.evaluate(x, y, t) via Substrate rule
const oldTick = '        \"\"\"Return current world-space z for this NPC at time t.\"\"\"\r\n        return self.motion.evaluate(x, y, t)';
const newTick = '        """Return current world-space z for this NPC at time t."""\r\n        return self.motion.evaluate(x, y, t)';
// tick actually still works — self.motion is now a Substrate, .evaluate is the stored lambda
// The call self.motion.evaluate(x,y,t) maps to Substrate.__getattr__('evaluate')(x,y,t) — correct.
// No change needed.

fs.writeFileSync('engine/manifold_core.py', c, 'utf8');

const v = fs.readFileSync('engine/manifold_core.py', 'utf8');
console.log('sandbox whitelist ok:', v.includes('"abs": abs, "round": round'));
console.log('co_names check ok:   ', v.includes('_unknown = set(code.co_names)'));
console.log('NPC motion fixed:    ', v.includes('avoid polluting'));
