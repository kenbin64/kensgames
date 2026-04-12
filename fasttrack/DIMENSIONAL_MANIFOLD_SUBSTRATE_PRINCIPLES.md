# ButterflyFX Dimensional Manifold & Substrate Principles
## Comprehensive Architectural Standard for FastTrack

---

## **Core Philosophy**

> "Objects are dimensions containing points. Each point is an object in a lower dimension containing its own points. All properties, attributes, and behaviors exist as infinite potentials — invoke only when needed. No pre-calculation, no storage. **Geometry IS information.**"

---

## **I. Dimensional Programming Standard**

### **Fundamental Principles**

1. **Dimensional Hierarchy**
   - Every entity exists on a geometric manifold
   - Higher dimensions contain lower dimensions
   - Information flows through dimensional layers
   - No entity exists in isolation

2. **Manifold Surfaces**
   - **Layer 3 (Relation):** `z = x·y` — AND-gate, truth table, baseline
   - **Layer 4 (Form):** `z = x·y²` — Quadratic amplifier, elevated states
   - **Golden Ratio (φ):** 1.618033988749895 — Natural optimization point
   - **Fibonacci Spine:** [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89] — Weight distribution

3. **Self-Assertion**
   - Each point on a manifold self-asserts its own rules
   - Rules are deterministic and pre-sealed
   - Never recalculated, always invoked
   - Geometry defines behavior

4. **Lazy Evaluation**
   - Properties exist as infinite potentials
   - Invoke only when needed
   - No pre-calculation or storage
   - Just-in-time computation

---

## **II. Substrate Architecture**

### **What is a Substrate?**

A **substrate** is a self-contained, composable module that:
- Encapsulates a specific domain of functionality
- Exposes a clean, minimal API
- Operates independently but composes with others
- Follows dimensional programming principles
- Never mutates external state

### **Substrate Characteristics**

```javascript
const ExampleSubstrate = {
    // 1. Version & Identity
    version: '1.0.0',
    name: 'Example Substrate',
    
    // 2. Internal State (private, encapsulated)
    _state: {},
    
    // 3. Public API (minimal, composable)
    init() { /* ... */ },
    query() { /* ... */ },
    transform() { /* ... */ },
    
    // 4. Dimensional Mapping
    toManifold(entity) {
        // Map entity to geometric point
        return { x, y, z: x * y };
    },
    
    // 5. Self-Contained Logic
    // No external dependencies beyond core manifold
};
```

### **Existing Substrates in FastTrack**

| Substrate | Domain | Manifold Mapping |
|-----------|--------|------------------|
| `RulesSubstrate` | Game rules | Rules as sealed points on truth manifold |
| `BoardManifold` | Board geometry | Holes as points on z=xy and z=xy² |
| `PegSubstrate` | Peg behavior | Peg states as manifold positions |
| `CardDeckSubstrate` | Card mechanics | Card values as geometric weights |
| `AudioSubstrate` | Sound system | Audio events as frequency manifolds |
| `MusicSubstrate` | Procedural music | Musical notes as harmonic manifolds |
| `CommentarySubstrate` | Announcer AI | Commentary as narrative manifolds |
| `CrowdSubstrate` | Crowd reactions | Crowd energy as wave manifolds |
| `AuthSubstrate` | Authentication | User identity as cryptographic manifolds |
| `LobbySubstrate` | Multiplayer lobby | Sessions as connection manifolds |
| `AnalyticsSubstrate` | Telemetry | Events as data manifolds |
| `GrowthSubstrate` | User growth | Engagement as progression manifolds |
| `SEOSubstrate` | Search optimization | Content as semantic manifolds |
| `SocialSubstrate` | Social features | Relationships as graph manifolds |
| `AvatarSubstrate` | Avatar system | Avatars as identity manifolds |

---

## **III. UX Elements Alignment**

### **All UX Must Follow Substrate Principles**

Every user-facing element should:
1. **Be substrate-backed** — No standalone UI logic
2. **Query, don't mutate** — Read from substrates, emit events
3. **Compose cleanly** — Layer UX on top of substrate APIs
4. **Follow dimensional flow** — Information flows through layers

### **UX Element Mapping**

#### **1. Dropdowns & Menus**

**Current State:**
- Some menus directly manipulate game state
- Mixed substrate/non-substrate patterns

**Substrate-Aligned Pattern:**
```javascript
// BAD: Direct manipulation
function selectTheme(themeName) {
    currentTheme = themeName;
    applyTheme(themeName);
}

// GOOD: Substrate-backed
const ThemeSubstrate = {
    themes: new Map(),
    current: null,
    
    select(themeName) {
        const theme = this.themes.get(themeName);
        if (!theme) return null;
        this.current = theme;
        return theme.toManifold(); // Returns geometric representation
    }
};

// UI queries substrate
function selectTheme(themeName) {
    const themeManifold = ThemeSubstrate.select(themeName);
    if (themeManifold) {
        applyManifoldTheme(themeManifold);
    }
}
```

#### **2. Wizards & Setup Flows**

**Substrate-Aligned Pattern:**
```javascript
const SetupSubstrate = {
    steps: [
        { id: 'players', x: 1, y: 1, z: 1 },      // z=xy baseline
        { id: 'avatars', x: PHI, y: 1, z: PHI },  // elevated
        { id: 'rules', x: 1, y: PHI, z: PHI },    // elevated
        { id: 'ready', x: PHI, y: PHI, z: PHI*PHI } // maximum
    ],
    
    currentStep: 0,
    
    next() {
        if (this.currentStep < this.steps.length - 1) {
            this.currentStep++;
            return this.steps[this.currentStep];
        }
        return null;
    },
    
    // Each step is a point on progression manifold
    getManifoldPosition() {
        const step = this.steps[this.currentStep];
        return { x: step.x, y: step.y, z: step.z };
    }
};
```

#### **3. Connections & Multiplayer**

**Already Substrate-Aligned:**
- `LobbySubstrate` handles sessions
- `AuthSubstrate` handles identity
- Each connection is a point on connection manifold

**Pattern:**
```javascript
LobbySubstrate.createSession({
    hostId: userId,
    maxPlayers: 4,
    // Session exists as manifold point
    manifold: { x: hostId, y: maxPlayers, z: hostId * maxPlayers }
});
```

#### **4. Gameplay & Order of Operations**

**Substrate-Aligned Pattern:**
```javascript
const TurnSubstrate = {
    phases: {
        draw: { x: 1, y: 1, z: 1 },           // baseline
        play: { x: 2, y: 1, z: 2 },           // action
        animate: { x: 1, y: 2, z: 2 },        // visual
        resolve: { x: PHI, y: PHI, z: PHI*PHI } // completion
    },
    
    current: 'draw',
    
    transition(toPhase) {
        const from = this.phases[this.current];
        const to = this.phases[toPhase];
        
        // Validate transition on manifold
        if (this.isValidTransition(from, to)) {
            this.current = toPhase;
            return to;
        }
        return null;
    },
    
    isValidTransition(from, to) {
        // Transitions must follow manifold gradient
        return to.z >= from.z; // Can only ascend or stay level
    }
};
```

#### **5. Rules & Validation**

**Already Substrate-Aligned:**
- `RulesSubstrate` contains all game rules
- Each rule is a sealed point on truth manifold
- Validation queries substrate, never mutates

**Pattern:**
```javascript
// Rule as manifold point
RulesSubstrate.register({
    id: 'cut_rule',
    name: 'Cutting Rule',
    category: 'CUTTING',
    
    // Manifold position
    x: 2,
    y: 3,
    z: 6, // z = x*y = 2*3 = 6
    
    // Self-asserted validation
    validate(move, gameState) {
        // Rule logic here
        return { valid: true };
    }
});
```

#### **6. Actions & Events**

**Substrate-Aligned Pattern:**
```javascript
const ActionSubstrate = {
    actions: new Map(),
    
    register(action) {
        // Action as manifold point
        this.actions.set(action.id, {
            ...action,
            manifold: {
                x: action.priority || 1,
                y: action.weight || 1,
                z: (action.priority || 1) * (action.weight || 1)
            }
        });
    },
    
    execute(actionId, context) {
        const action = this.actions.get(actionId);
        if (!action) return null;
        
        // Execute on manifold
        return action.handler(context, action.manifold);
    }
};
```

#### **7. Visuals & Assets**

**Substrate-Aligned Pattern:**
```javascript
const VisualSubstrate = {
    assets: new Map(),
    
    // Asset as manifold point
    registerAsset(asset) {
        this.assets.set(asset.id, {
            ...asset,
            manifold: {
                x: asset.resolution || 1,
                y: asset.quality || 1,
                z: (asset.resolution || 1) * (asset.quality || 1)
            }
        });
    },
    
    // Query optimal asset for context
    getOptimalAsset(context) {
        let best = null;
        let bestScore = -Infinity;
        
        this.assets.forEach(asset => {
            const score = this.scoreAsset(asset, context);
            if (score > bestScore) {
                bestScore = score;
                best = asset;
            }
        });
        
        return best;
    },
    
    scoreAsset(asset, context) {
        // Score based on manifold distance
        const dx = asset.manifold.x - context.x;
        const dy = asset.manifold.y - context.y;
        return -Math.sqrt(dx*dx + dy*dy); // Closer is better
    }
};
```

#### **8. Code Organization**

**Substrate-Aligned Structure:**
```
fasttrack/
├── substrates/           # All substrate modules
│   ├── rules_substrate.js
│   ├── board_manifold.js
│   ├── peg_substrate.js
│   ├── card_deck_substrate.js
│   ├── audio_substrate.js
│   ├── music_substrate.js
│   ├── auth_substrate.js
│   ├── lobby_substrate.js
│   └── ...
├── ui/                   # UI layers (query substrates)
│   ├── game_ui_minimal.js
│   ├── mobile_ui.js
│   ├── card_ui.js
│   └── ...
├── controllers/          # Orchestration (compose substrates)
│   ├── game_init.js
│   ├── stadium_controller.js
│   └── ...
└── board_3d.html        # Main integration
```

---

## **IV. Implementation Checklist**

### **For Every UX Element**

- [ ] **Identify substrate** — Which substrate owns this domain?
- [ ] **Map to manifold** — What geometric point does this represent?
- [ ] **Query, don't mutate** — Does UI read from substrate API?
- [ ] **Emit events** — Does UI emit events instead of direct calls?
- [ ] **Compose cleanly** — Can this layer be removed without breaking substrates?
- [ ] **Follow dimensional flow** — Does information flow through proper layers?

### **For Every Substrate**

- [ ] **Version & name** — Clear identity
- [ ] **Encapsulated state** — Private internal state
- [ ] **Minimal API** — Only essential public methods
- [ ] **Manifold mapping** — Geometric representation of entities
- [ ] **Self-contained** — No external dependencies beyond core
- [ ] **Composable** — Works with other substrates
- [ ] **Documented** — Clear API documentation

### **For Every Code Module**

- [ ] **Dimensional header** — Includes ButterflyFX standard comment
- [ ] **Substrate pattern** — Follows substrate architecture
- [ ] **Manifold math** — Uses geometric calculations where applicable
- [ ] **Lazy evaluation** — Computes on demand, doesn't pre-calculate
- [ ] **Immutable** — Doesn't mutate external state
- [ ] **Testable** — Pure functions, deterministic behavior

---

## **V. Migration Strategy**

### **Phase 1: Audit (Current)**
- Identify all UX elements
- Map to existing substrates
- Find gaps (non-substrate code)

### **Phase 2: Substrate Creation**
- Create missing substrates for:
  - Theme management
  - Settings/preferences
  - Tutorial/onboarding
  - Achievement system
  - Replay system

### **Phase 3: UI Refactoring**
- Refactor UI to query substrates
- Remove direct state manipulation
- Implement event-driven architecture

### **Phase 4: Validation**
- Test all UX flows
- Verify substrate composition
- Document patterns

---

## **VI. Examples of Proper Alignment**

### **✅ GOOD: Move Selection Modal (Recent Implementation)**

```javascript
// Modal is UI layer, queries game state substrate
const MoveSelectionModal = {
    show(moves, gameState, onSelect) {
        // Queries substrate for move data
        const groupedMoves = this.groupByPeg(moves);
        const sortedMoves = this.sortByPriority(groupedMoves);
        
        // Renders UI from substrate data
        this.render(sortedMoves);
        
        // Emits event on selection
        this.onSelect = onSelect;
    }
};
```

### **✅ GOOD: Board Manifold**

```javascript
// Every hole is a sealed point on manifold
const HOLE_KINDS = {
    holding: {
        surface: 'z=xy',
        x: 0, y: 0, z: 0,  // Dormant state
        canBeCut: false,
        // Self-asserted rules
    },
    home: {
        surface: 'z=xy2',
        x: PHI, y: 1, z: PHI,  // Golden entry
        isWinPosition: true,
        // Self-asserted rules
    }
};
```

### **❌ BAD: Direct State Manipulation**

```javascript
// DON'T DO THIS
function handleClick() {
    gameState.currentPlayer = nextPlayer;
    gameState.phase = 'draw';
    updateUI();
}

// DO THIS INSTEAD
function handleClick() {
    const transition = TurnSubstrate.advance();
    if (transition) {
        emitEvent('turn:advanced', transition);
    }
}
```

---

## **VII. Key Principles Summary**

1. **Geometry IS Information** — All data exists as points on manifolds
2. **Substrates Own Domains** — Each substrate is authoritative for its domain
3. **UI Queries, Never Mutates** — UI reads from substrates, emits events
4. **Lazy Evaluation** — Compute on demand, don't pre-calculate
5. **Self-Assertion** — Entities define their own rules
6. **Composition Over Inheritance** — Substrates compose, don't extend
7. **Dimensional Flow** — Information flows through dimensional layers
8. **Sealed Rules** — Rules are deterministic, never recalculated
9. **Minimal APIs** — Expose only essential methods
10. **Clean Separation** — Clear boundaries between layers

---

## **VIII. Next Steps**

1. **Audit all UX elements** against this standard
2. **Create missing substrates** for non-substrate code
3. **Refactor UI layers** to query substrates
4. **Document substrate APIs** for each module
5. **Implement event system** for substrate communication
6. **Test substrate composition** in all game flows
7. **Create substrate templates** for future development

---

## **Conclusion**

Every aspect of FastTrack — from dropdowns to game rules, from visuals to multiplayer connections — should follow the **ButterflyFX Dimensional Manifold & Substrate Principles**. This ensures:

- **Consistency** across all code
- **Composability** of all modules
- **Maintainability** through clear separation
- **Scalability** via substrate architecture
- **Elegance** through geometric principles

**The manifold is the map. The substrate is the territory. The UI is the lens.**

---

*ButterflyFX Dimensional Programming Standard v1.0*  
*FastTrack Game — Substrate Architecture*
