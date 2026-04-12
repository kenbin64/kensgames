# UX Substrate Alignment Audit
## FastTrack Game - Comprehensive Review

---

## **Executive Summary**

This audit reviews all user experience elements in FastTrack against the **ButterflyFX Dimensional Manifold & Substrate Principles**. Each element is evaluated for substrate compliance and assigned a priority for alignment work.

**Status Legend:**
- ✅ **Compliant** - Follows substrate principles
- ⚠️ **Partial** - Some substrate alignment, needs improvement
- ❌ **Non-Compliant** - Direct state manipulation, needs refactoring

---

## **I. Dropdowns & Menus**

### **1. Theme Selector**
**Location:** `board_3d.html` - `setTheme()` function  
**Status:** ⚠️ **Partial**

**Current Implementation:**
```javascript
function setTheme(themeName) {
    currentThemeName = themeName;
    FastTrackThemes.apply(themeName, scene, THREE);
    // Direct manipulation of global state
}
```

**Issues:**
- Direct global variable mutation
- No substrate backing
- Mixed concerns (state + rendering)

**Recommendation:**
Create `ThemeSubstrate` to manage theme state:
```javascript
const ThemeSubstrate = {
    themes: new Map(),
    current: null,
    
    select(themeName) {
        const theme = this.themes.get(themeName);
        if (!theme) return null;
        this.current = theme;
        return {
            name: themeName,
            manifold: { x: theme.priority, y: theme.weight, z: theme.priority * theme.weight }
        };
    },
    
    getCurrent() {
        return this.current;
    }
};
```

**Priority:** Medium

---

### **2. Settings Menu (GameUIMinimal)**
**Location:** `game_ui_minimal.js` - Menu panel  
**Status:** ⚠️ **Partial**

**Current Implementation:**
- Settings stored in global `GAME_CONFIG`
- Direct manipulation via toggle functions
- No substrate backing

**Issues:**
- Global state mutation
- No validation layer
- Settings not on manifold

**Recommendation:**
Create `SettingsSubstrate`:
```javascript
const SettingsSubstrate = {
    settings: new Map(),
    defaults: {},
    
    register(key, defaultValue, validator) {
        this.settings.set(key, {
            value: defaultValue,
            default: defaultValue,
            validator,
            manifold: { x: 1, y: 1, z: 1 }
        });
    },
    
    set(key, value) {
        const setting = this.settings.get(key);
        if (!setting) return false;
        if (setting.validator && !setting.validator(value)) return false;
        setting.value = value;
        return true;
    },
    
    get(key) {
        return this.settings.get(key)?.value;
    }
};
```

**Priority:** High

---

### **3. Stadium Audio Controls**
**Location:** `board_3d.html` - Stadium controller toggles  
**Status:** ✅ **Compliant**

**Current Implementation:**
- Uses `StadiumController` substrate
- Clean API: `setTheme()`, `toggleMusic()`, etc.
- No direct state manipulation

**Strengths:**
- Proper substrate pattern
- Encapsulated state
- Event-driven

**Priority:** None (already compliant)

---

## **II. Wizards & Setup Flows**

### **4. Game Setup (Lobby)**
**Location:** `lobby_ui.js` + `lobby_substrate.js`  
**Status:** ✅ **Compliant**

**Current Implementation:**
- `LobbySubstrate` manages session state
- UI queries substrate for data
- Clean separation of concerns

**Strengths:**
- Proper substrate backing
- Session as manifold point
- Event-driven architecture

**Priority:** None (already compliant)

---

### **5. Player Configuration**
**Location:** `lobby_ui.js` - Player setup  
**Status:** ⚠️ **Partial**

**Current Implementation:**
- Some direct DOM manipulation
- Mixed substrate/non-substrate patterns
- Avatar selection uses `AvatarSubstrate` ✅

**Issues:**
- Player count selection not substrate-backed
- AI toggle directly manipulates state

**Recommendation:**
Extend `LobbySubstrate` to handle all player configuration:
```javascript
LobbySubstrate.configurePlayer(index, {
    isAI: boolean,
    avatar: string,
    name: string
});
```

**Priority:** Medium

---

## **III. Connections & Multiplayer**

### **6. Session Management**
**Location:** `lobby_substrate.js` + `game_session_manager.js`  
**Status:** ✅ **Compliant**

**Current Implementation:**
- `LobbySubstrate` handles sessions
- `AuthSubstrate` handles identity
- WebSocket connections managed via substrate

**Strengths:**
- Full substrate architecture
- Sessions as manifold points
- Clean API boundaries

**Priority:** None (already compliant)

---

## **IV. Gameplay & Order of Operations**

### **7. Turn Flow**
**Location:** `game_engine.js` + `board_3d.html`  
**Status:** ⚠️ **Partial**

**Current Implementation:**
- `GameState` class manages phases
- Some direct phase manipulation in UI
- Mixed substrate/imperative patterns

**Issues:**
```javascript
// Direct phase manipulation
gameState.phase = 'play';
gameState.currentPlayerIndex = nextIndex;
```

**Recommendation:**
Create `TurnSubstrate` to manage turn flow:
```javascript
const TurnSubstrate = {
    phases: {
        draw: { x: 1, y: 1, z: 1 },
        play: { x: 2, y: 1, z: 2 },
        animate: { x: 1, y: 2, z: 2 },
        resolve: { x: PHI, y: PHI, z: PHI*PHI }
    },
    
    current: 'draw',
    
    transition(toPhase) {
        const from = this.phases[this.current];
        const to = this.phases[toPhase];
        
        if (this.isValidTransition(from, to)) {
            this.current = toPhase;
            return { from, to, valid: true };
        }
        return { valid: false };
    },
    
    isValidTransition(from, to) {
        return to.z >= from.z; // Can only ascend
    }
};
```

**Priority:** High

---

### **8. Move Execution**
**Location:** `board_3d.html` - `executeMoveDirectly()`  
**Status:** ⚠️ **Partial**

**Current Implementation:**
- Direct game state mutation
- No substrate layer
- Imperative execution

**Issues:**
```javascript
function executeMoveDirectly(move) {
    // Direct state changes
    peg.holeId = move.toHoleId;
    gameState.phase = 'animating';
}
```

**Recommendation:**
Create `MoveSubstrate`:
```javascript
const MoveSubstrate = {
    validate(move, gameState) {
        return RulesSubstrate.validateMove(move, gameState);
    },
    
    execute(move, gameState) {
        const validation = this.validate(move, gameState);
        if (!validation.valid) return validation;
        
        return {
            valid: true,
            effects: this.calculateEffects(move, gameState),
            manifold: this.toManifold(move)
        };
    },
    
    toManifold(move) {
        return {
            x: move.pegId,
            y: move.steps,
            z: move.pegId * move.steps
        };
    }
};
```

**Priority:** High

---

## **V. Rules & Validation**

### **9. Rules System**
**Location:** `rules_substrate.js` + `board_manifold.js`  
**Status:** ✅ **Compliant**

**Current Implementation:**
- `RulesSubstrate` contains all rules
- Each rule is a sealed manifold point
- Validation queries substrate

**Strengths:**
- Perfect substrate pattern
- Rules as geometric points
- Self-asserting validation
- Immutable, deterministic

**Priority:** None (already compliant, exemplary)

---

### **10. Move Validation**
**Location:** `game_engine.js` - `calculateLegalMoves()`  
**Status:** ⚠️ **Partial**

**Current Implementation:**
- Uses `BoardManifold` for hole rules ✅
- Some validation inline in game engine ❌
- Mixed substrate/imperative patterns

**Issues:**
- Not all validation goes through `RulesSubstrate`
- Some rules hardcoded in game engine

**Recommendation:**
Route all validation through `RulesSubstrate`:
```javascript
// Instead of inline checks
if (card.rank === '4' && hole.type === 'fasttrack') {
    return false; // Can't enter FT with 4
}

// Use substrate
const validation = RulesSubstrate.validate('card_4_fasttrack_restriction', {
    card, hole, gameState
});
if (!validation.valid) return false;
```

**Priority:** Medium

---

## **VI. Actions & Events**

### **11. Event System**
**Location:** Various files  
**Status:** ❌ **Non-Compliant**

**Current Implementation:**
- No unified event system
- Direct function calls
- Tight coupling between modules

**Issues:**
```javascript
// Direct coupling
function onCardDrawn(card) {
    updateUI(card);
    playSound(card);
    updateAnalytics(card);
}
```

**Recommendation:**
Create `EventSubstrate`:
```javascript
const EventSubstrate = {
    listeners: new Map(),
    
    on(eventName, handler, priority = 1) {
        if (!this.listeners.has(eventName)) {
            this.listeners.set(eventName, []);
        }
        this.listeners.get(eventName).push({
            handler,
            priority,
            manifold: { x: priority, y: 1, z: priority }
        });
        this.listeners.get(eventName).sort((a, b) => b.priority - a.priority);
    },
    
    emit(eventName, data) {
        const handlers = this.listeners.get(eventName) || [];
        handlers.forEach(h => h.handler(data));
    }
};

// Usage
EventSubstrate.on('card:drawn', (card) => updateUI(card));
EventSubstrate.on('card:drawn', (card) => playSound(card));
EventSubstrate.emit('card:drawn', drawnCard);
```

**Priority:** High

---

### **12. User Actions (Click Handlers)**
**Location:** `board_3d.html` - Various click handlers  
**Status:** ❌ **Non-Compliant**

**Current Implementation:**
- Direct DOM event listeners
- Inline action logic
- No substrate backing

**Issues:**
```javascript
deckEl.addEventListener('click', () => {
    handleDrawCard();
});
```

**Recommendation:**
Create `ActionSubstrate`:
```javascript
const ActionSubstrate = {
    actions: new Map(),
    
    register(actionId, handler, constraints) {
        this.actions.set(actionId, {
            id: actionId,
            handler,
            constraints,
            manifold: { x: 1, y: 1, z: 1 }
        });
    },
    
    execute(actionId, context) {
        const action = this.actions.get(actionId);
        if (!action) return { valid: false, reason: 'Unknown action' };
        
        // Validate constraints
        if (action.constraints && !action.constraints(context)) {
            return { valid: false, reason: 'Constraints not met' };
        }
        
        return action.handler(context);
    }
};

// Usage
ActionSubstrate.register('draw_card', handleDrawCard, (ctx) => {
    return ctx.gameState.phase === 'draw';
});

deckEl.addEventListener('click', () => {
    ActionSubstrate.execute('draw_card', { gameState });
});
```

**Priority:** Medium

---

## **VII. Visuals & Assets**

### **13. Theme System**
**Location:** `themes.js`  
**Status:** ⚠️ **Partial**

**Current Implementation:**
- `FastTrackThemes` object manages themes
- Some substrate-like patterns
- Direct scene manipulation

**Issues:**
- Not a proper substrate (no version, no manifold mapping)
- Direct THREE.js scene manipulation
- Mixed concerns

**Recommendation:**
Refactor to proper substrate:
```javascript
const ThemeSubstrate = {
    version: '1.0.0',
    name: 'Theme Management Substrate',
    
    themes: new Map(),
    current: null,
    
    register(themeName, themeConfig) {
        this.themes.set(themeName, {
            ...themeConfig,
            manifold: {
                x: themeConfig.complexity || 1,
                y: themeConfig.performance || 1,
                z: (themeConfig.complexity || 1) * (themeConfig.performance || 1)
            }
        });
    },
    
    select(themeName) {
        const theme = this.themes.get(themeName);
        if (!theme) return null;
        this.current = theme;
        return theme;
    },
    
    // Returns theme data, doesn't apply it
    getCurrent() {
        return this.current;
    }
};
```

**Priority:** Medium

---

### **14. 3D Assets (Pegs, Board, Holes)**
**Location:** `board_3d.html` - Creation functions  
**Status:** ⚠️ **Partial**

**Current Implementation:**
- `PegSubstrate` exists ✅
- Board creation is imperative ❌
- Hole creation uses `BoardManifold` ✅

**Issues:**
- Board geometry not substrate-backed
- Direct THREE.js mesh creation

**Recommendation:**
Create `BoardGeometrySubstrate`:
```javascript
const BoardGeometrySubstrate = {
    geometries: new Map(),
    
    createHexagon(radius, thickness) {
        return {
            type: 'hexagon',
            radius,
            thickness,
            manifold: { x: radius, y: thickness, z: radius * thickness }
        };
    },
    
    createPeg(color, size) {
        return {
            type: 'peg',
            color,
            size,
            manifold: { x: color, y: size, z: color * size }
        };
    }
};
```

**Priority:** Low

---

## **VIII. Code Organization**

### **15. Module Structure**
**Location:** Root directory  
**Status:** ⚠️ **Partial**

**Current Structure:**
```
fasttrack/
├── *_substrate.js (15 files) ✅
├── board_3d.html (monolith) ❌
├── game_engine.js ⚠️
├── game_init.js ⚠️
└── Various UI files ⚠️
```

**Issues:**
- `board_3d.html` is a 14,000+ line monolith
- Mixed substrate/non-substrate code
- No clear layering

**Recommendation:**
Reorganize into layers:
```
fasttrack/
├── substrates/           # Pure substrate modules
│   ├── core/
│   │   ├── rules_substrate.js
│   │   ├── board_manifold.js
│   │   └── turn_substrate.js (NEW)
│   ├── game/
│   │   ├── peg_substrate.js
│   │   ├── card_deck_substrate.js
│   │   └── move_substrate.js (NEW)
│   ├── media/
│   │   ├── audio_substrate.js
│   │   ├── music_substrate.js
│   │   └── theme_substrate.js (NEW)
│   └── platform/
│       ├── auth_substrate.js
│       ├── lobby_substrate.js
│       └── analytics_substrate.js
├── controllers/          # Substrate orchestration
│   ├── game_controller.js (from game_init.js)
│   ├── stadium_controller.js ✅
│   └── session_controller.js
├── ui/                   # UI layers (query substrates)
│   ├── game_ui_minimal.js ✅
│   ├── mobile_ui.js ✅
│   ├── card_ui.js ✅
│   └── board_ui.js (from board_3d.html)
└── board_3d.html        # Integration only
```

**Priority:** High (long-term refactoring)

---

## **IX. Summary & Priorities**

### **Compliance Score**

| Category | Compliant | Partial | Non-Compliant |
|----------|-----------|---------|---------------|
| Dropdowns & Menus | 1 | 2 | 0 |
| Wizards & Setup | 1 | 1 | 0 |
| Connections | 1 | 0 | 0 |
| Gameplay | 0 | 2 | 0 |
| Rules | 1 | 1 | 0 |
| Actions & Events | 0 | 0 | 2 |
| Visuals & Assets | 0 | 2 | 0 |
| Code Organization | 0 | 1 | 0 |
| **TOTAL** | **4 (27%)** | **9 (60%)** | **2 (13%)** |

### **Priority Recommendations**

#### **High Priority (Immediate)**
1. **Create EventSubstrate** - Unified event system
2. **Create TurnSubstrate** - Turn flow management
3. **Create MoveSubstrate** - Move execution layer
4. **Create SettingsSubstrate** - Settings management

#### **Medium Priority (Next Sprint)**
5. **Create ThemeSubstrate** - Theme management
6. **Refactor Player Configuration** - Extend LobbySubstrate
7. **Create ActionSubstrate** - User action layer
8. **Route all validation through RulesSubstrate**

#### **Low Priority (Future)**
9. **Create BoardGeometrySubstrate** - 3D asset management
10. **Reorganize module structure** - Layer separation

---

## **X. Implementation Roadmap**

### **Week 1: Core Substrates**
- [ ] Create `EventSubstrate`
- [ ] Create `TurnSubstrate`
- [ ] Create `MoveSubstrate`
- [ ] Integrate with existing game flow

### **Week 2: Settings & Configuration**
- [ ] Create `SettingsSubstrate`
- [ ] Create `ThemeSubstrate`
- [ ] Refactor settings UI to query substrates
- [ ] Refactor theme selector

### **Week 3: Actions & Events**
- [ ] Create `ActionSubstrate`
- [ ] Refactor all click handlers
- [ ] Implement event-driven architecture
- [ ] Remove direct function calls

### **Week 4: Validation & Rules**
- [ ] Route all validation through `RulesSubstrate`
- [ ] Remove inline validation logic
- [ ] Document all rules as manifold points

### **Week 5: Testing & Documentation**
- [ ] Test all substrate compositions
- [ ] Document substrate APIs
- [ ] Create substrate templates
- [ ] Update architecture diagrams

---

## **Conclusion**

FastTrack has a **strong substrate foundation** (27% fully compliant, 60% partial), but needs alignment work to achieve full compliance with ButterflyFX Dimensional Manifold & Substrate Principles.

**Key Strengths:**
- Excellent substrate examples (RulesSubstrate, BoardManifold, LobbySubstrate)
- Clean separation in some areas
- Strong geometric foundations

**Key Gaps:**
- No unified event system
- Direct state manipulation in UI
- Mixed substrate/imperative patterns
- Monolithic board_3d.html file

**Recommended Approach:**
1. Create missing core substrates (Event, Turn, Move, Settings)
2. Refactor UI to query substrates instead of mutating state
3. Implement event-driven architecture
4. Gradually migrate imperative code to substrate patterns

**Expected Outcome:**
- 100% substrate compliance
- Clean layer separation
- Composable, testable modules
- Elegant geometric architecture throughout

---

*ButterflyFX Dimensional Programming Standard*  
*Audit Date: 2026-02-26*
