"""
Manifold Core — base classes for the Dimensional Programming Framework.

Axioms:
    Manifold = Expression + Attributes + Substrate
    z = xy   — higher dimension contains and derives the lower
    Recursion happens between dimensions, not within them
"""

import math
from typing import Callable, Any


# ---------------------------------------------------------------------------
# Substrate
# ---------------------------------------------------------------------------

class Substrate:
    """Rules that extract or derive behavior/data from a manifold."""

    def __init__(self, **rules: Any):
        self.rules = rules

    def __getattr__(self, name: str) -> Any:
        try:
            return self.rules[name]
        except KeyError:
            raise AttributeError(f"Substrate has no rule '{name}'")

    def __repr__(self) -> str:
        return f"Substrate({self.rules})"


# ---------------------------------------------------------------------------
# Manifold
# ---------------------------------------------------------------------------

class Manifold:
    """
    A mathematical object that is simultaneously:
      - a point in a higher dimension
      - a whole in a lower dimension

    Parameters
    ----------
    name       : unique identifier used by the Runtime registry
    expression : callable(x, y, t=0, **kwargs) → z (float)
    **attributes: substrate values (texture, sound, behavior, …)
    """

    _registry: dict[str, "Manifold"] = {}

    def __init__(self, name: str, expression: Callable, **attributes: Any):
        self.name = name
        self.expression = expression
        self.attributes = attributes
        Manifold._registry[name] = self

    # ------------------------------------------------------------------
    # Convenience factories
    # ------------------------------------------------------------------

    @classmethod
    def register(cls, name: str, expression: Callable, **attributes: Any) -> "Manifold":
        """Create and register a manifold in one call."""
        return cls(name, expression, **attributes)

    @classmethod
    def from_dsl(cls, name: str, expr_str: str, **attributes: Any) -> "Manifold":
        """
        Compile a simple DSL expression string into a callable.

        Supported variables: x, y, t
        Supported functions: sin, cos, tan, sqrt, abs, pi, e

        Example
        -------
        Manifold.from_dsl("terrain", "x*y * sin(x)")
        """
        _safe_globals = {
            "sin": math.sin, "cos": math.cos, "tan": math.tan,
            "sqrt": math.sqrt, "abs": abs,
            "pi": math.pi, "e": math.e,
            "__builtins__": {"abs": abs, "round": round, "min": min, "max": max},
        }
        # Validate that no name in the expression escapes the whitelist.
        # compile() gives us a code object; co_names lists every identifier used.
        code = compile(expr_str, "<dsl>", "eval")
        _allowed = set(_safe_globals) | {"x", "y", "t"}
        _unknown = set(code.co_names) - _allowed
        if _unknown:
            raise ValueError(f"DSL expression uses disallowed names: {_unknown}")

        def _expr(x: float, y: float, t: float = 0.0) -> float:
            return eval(code, _safe_globals, {"x": x, "y": y, "t": t})  # noqa: S307

        return cls(name, _expr, **attributes)

    # ------------------------------------------------------------------
    # Evaluation
    # ------------------------------------------------------------------

    def evaluate(self, x: float, y: float, t: float = 0.0) -> float:
        """Return z = expression(x, y, t)."""
        return float(self.expression(x=x, y=y, t=t))

    def __repr__(self) -> str:
        return f"Manifold(name={self.name!r}, attrs={list(self.attributes)})"


# ---------------------------------------------------------------------------
# NPC manifold helper
# ---------------------------------------------------------------------------

class NPC(Manifold):
    """
    Autonomous NPC as a composite manifold.

    Each NPC is simultaneously:
      - a point in the world (3D position)
      - a whole system of cognition, motion, emotion, dialogue
    """

    def __init__(self, name: str, goal: str = "explore", emotion_state: str = "curious"):
        super().__init__(
            name=name,
            expression=lambda x, y, t=0.0: x * y * math.sin(t),
        )
        self.cognition = Substrate(goal=goal, drives=["curiosity", "survival"])
        # Internal motion substrate — constructed directly to avoid polluting
        # the global _registry with NPC-internal names.
        _motion_expr = lambda x, y, t=0.0: x * y * math.sin(t)
        object.__setattr__(self, 'motion', Substrate(evaluate=_motion_expr))
        self.emotion   = Substrate(state=emotion_state, valence=0.7, arousal=0.5)
        self.dialogue  = Substrate(corpus=f"{name}_corpus", style="terse")

    def tick(self, x: float, y: float, t: float) -> float:
        """Return current world-space z for this NPC at time t."""
        return self.motion.evaluate(x, y, t)


# ---------------------------------------------------------------------------
# Runtime registry
# ---------------------------------------------------------------------------

class ManifoldInstance:
    """Wraps a registered manifold for runtime access."""

    def __init__(self, manifold: Manifold):
        self.manifold = manifold
        self.name     = manifold.name


class Runtime:
    """Thin registry facade — observe registered manifolds by name."""

    @staticmethod
    def observe(name: str) -> ManifoldInstance:
        manifold = Manifold._registry.get(name)
        if manifold is None:
            raise KeyError(f"No manifold registered as '{name}'. "
                           f"Available: {list(Manifold._registry)}")
        return ManifoldInstance(manifold)

    @staticmethod
    def list_manifolds() -> list[str]:
        return list(Manifold._registry.keys())
