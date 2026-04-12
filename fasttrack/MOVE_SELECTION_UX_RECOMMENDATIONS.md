# FastTrack Move Selection UX - Analysis & Recommendations

## Current Implementation Analysis

### **Existing Move Selection Methods**

1. **Direct Hole Clicking** (Primary Method)
   - Player clicks on tiny 3D hole meshes on the board
   - Holes are ~10-20px visual targets on screen
   - Works: Desktop with mouse precision
   - Fails: Mobile devices, wandering camera, zoomed-out views

2. **Peg Clicking with Dropdown** (Secondary Method)
   - Click on peg → Shows dropdown menu with all destinations
   - Dropdown shows: Icon, destination name, step count
   - Works: When peg is visible and clickable
   - Fails: Pegs can be small, dropdown positioning issues on mobile

3. **Peg Number Labels** (Visual Aid)
   - Shows "#1", "#2", etc. above pegs with moves
   - Helps identify which pegs can move
   - Works: Desktop
   - Fails: Labels can overlap, hard to read on mobile

4. **Path Highlighting** (Visual Feedback)
   - Highlights destination holes in green/yellow
   - Shows path trails for some moves
   - Works: Good visual feedback
   - Fails: Doesn't solve click target problem

5. **Auto-Execute Single Move** (Smart Default)
   - Automatically executes when only 1 legal move exists
   - Works: Excellent UX for forced moves
   - Fails: N/A (works well)

---

## UX Pain Points

### **Critical Issues**

1. **Tiny Touch Targets on Mobile**
   - Holes: 10-20px screen space
   - Pegs: 15-30px screen space
   - Apple/Android guidelines: Minimum 44x44px touch targets
   - **Result:** Frustrating mis-clicks, accidental moves

2. **Camera Wandering**
   - Cinematic camera rotates/moves during gameplay
   - Holes move on screen as camera pans
   - **Result:** Player aims for hole, camera moves, clicks wrong spot

3. **Depth Perception Issues**
   - 3D board with perspective
   - Holes at different Z-depths
   - **Result:** Hard to tell which hole you're clicking

4. **Multiple Pegs with Moves**
   - 2-5 pegs may have legal moves simultaneously
   - Each peg may have 2-10 possible destinations
   - **Result:** 10-50 tiny holes highlighted, overwhelming

5. **FastTrack Choice Complexity**
   - Same destination, different paths (FT entry vs perimeter)
   - Player must understand strategic difference
   - **Result:** Confusion about which option to pick

6. **Split Move (Card 7) Complexity**
   - Two-step process: Select peg → destination → peg → destination
   - Each step requires precise clicking
   - **Result:** 4 precise clicks on tiny targets

### **Secondary Issues**

7. **Dropdown Positioning**
   - Dropdown can appear off-screen on mobile
   - Blocks view of board
   - Requires scrolling on small screens

8. **No Undo/Confirm**
   - Accidental clicks execute immediately
   - No "Are you sure?" for critical moves
   - **Result:** Rage-inducing mis-clicks

9. **Lack of Move Preview**
   - Hard to visualize outcome before clicking
   - No "what if" exploration
   - **Result:** Analysis paralysis or rushed decisions

10. **Accessibility**
    - No keyboard navigation
    - No voice control
    - Difficult for users with motor impairments

---

## Recommended Solution: **Unified Move Selection Modal**

### **Core Concept**

Replace tiny hole clicking with a **full-screen, touch-friendly move selection interface** that appears whenever the player has choices.

### **Design Principles**

1. **Large Touch Targets** - Minimum 60x60px buttons (exceeds 44px guideline)
2. **Clear Visual Hierarchy** - Group by peg, show strategic context
3. **One-Tap Selection** - Single tap executes move (no multi-step clicking)
4. **Persistent Until Chosen** - Modal stays visible, camera can rotate freely
5. **Smart Defaults** - Auto-execute single moves, suggest best moves
6. **Mobile-First** - Designed for touch, enhanced for desktop

---

## Implementation Design

### **Option A: Bottom Sheet Modal (Recommended for Mobile)**

```
┌─────────────────────────────────────┐
│         FASTTRACK BOARD             │
│                                     │
│         (3D View)                   │
│                                     │
│                                     │
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │  Choose Your Move (3 options)   │ │
│ ├─────────────────────────────────┤ │
│ │                                 │ │
│ │  🎯 Peg #1                      │ │
│ │  ┌───────────────────────────┐ │ │
│ │  │ ⚡ Enter FastTrack  →  7  │ │ │ ← 60px tall
│ │  └───────────────────────────┘ │ │
│ │  ┌───────────────────────────┐ │ │
│ │  │ 📍 Outer Track     →  7  │ │ │
│ │  └───────────────────────────┘ │ │
│ │                                 │ │
│ │  🎯 Peg #2                      │ │
│ │  ┌───────────────────────────┐ │ │
│ │  │ ⚔️ Cut Opponent!   →  7  │ │ │
│ │  └───────────────────────────┘ │ │
│ │                                 │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

**Features:**
- Slides up from bottom (native mobile pattern)
- Covers 40-60% of screen
- Board still visible above
- Swipe down to dismiss (shows board, re-opens on tap)
- Scrollable if many moves

### **Option B: Centered Card Modal (Recommended for Desktop)**

```
┌─────────────────────────────────────┐
│                                     │
│    ┌─────────────────────────┐     │
│    │  Choose Your Move       │     │
│    │  ────────────────────   │     │
│    │                         │     │
│    │  🎯 Peg #1              │     │
│    │  ┌───────────────────┐ │     │
│    │  │ ⚡ FastTrack → 7 │ │     │
│    │  └───────────────────┘ │     │
│    │  ┌───────────────────┐ │     │
│    │  │ 📍 Outer    → 7 │ │     │
│    │  └───────────────────┘ │     │
│    │                         │     │
│    │  🎯 Peg #2              │     │
│    │  ┌───────────────────┐ │     │
│    │  │ ⚔️ Cut!     → 7 │ │     │
│    │  └───────────────────┘ │     │
│    │                         │     │
│    │         [Cancel]        │     │
│    └─────────────────────────┘     │
│                                     │
└─────────────────────────────────────┘
```

**Features:**
- Centered overlay with backdrop blur
- Keyboard navigation (arrow keys, Enter)
- ESC to cancel and see board
- Hover effects on desktop

### **Option C: Hybrid Approach (Best of Both Worlds)**

**Mobile:** Bottom sheet
**Desktop:** Centered card OR keep existing dropdown (it works well on desktop)
**Tablet:** Bottom sheet (portrait) / Centered card (landscape)

---

## Detailed Feature Specifications

### **1. Move Card Design**

Each move option is a large, tappable card:

```html
<div class="move-option" data-move-id="move-123">
    <div class="move-icon">⚡</div>
    <div class="move-details">
        <div class="move-title">Enter FastTrack</div>
        <div class="move-subtitle">7 steps · Strategic advantage</div>
    </div>
    <div class="move-badge">
        <span class="badge-steps">7</span>
    </div>
</div>
```

**Styling:**
- Height: 60-80px (large touch target)
- Padding: 12-16px
- Border-radius: 8-12px
- Background: Gradient based on move type
- Active state: Scale 0.95, haptic feedback
- Disabled state: Opacity 0.5, grayscale

**Color Coding:**
- 🟢 **Green** - Safe moves (no risk)
- 🟡 **Yellow** - Strategic moves (FastTrack, Bullseye)
- 🔴 **Red** - Aggressive moves (Cutting opponents)
- 🔵 **Blue** - Safe zone / Winner hole
- ⚪ **Gray** - Neutral moves

### **2. Grouping by Peg**

When multiple pegs have moves:

```
Peg #1 (Home Position)
├─ Move A
├─ Move B
└─ Move C

Peg #2 (FastTrack)
├─ Move D
└─ Move E
```

**Benefits:**
- Clear which peg you're moving
- Easy to compare options for same peg
- Reduces cognitive load

### **3. Smart Sorting**

Moves sorted by:
1. **Strategic Value** (AI scoring)
2. **Move Type** (Cuts > FastTrack > Safe Zone > Regular)
3. **Distance** (Longer moves first)

**Optional:** Show "⭐ Recommended" badge on best move

### **4. Move Preview on Hover/Long-Press**

**Desktop:** Hover over move → Highlights path on board
**Mobile:** Long-press move → Shows preview, release to cancel, tap to confirm

**Preview Shows:**
- Animated path from current position to destination
- Peg ghost at destination
- Cut indicator if applicable
- Strategic tooltip

### **5. Confirmation for Critical Moves**

**Trigger confirmation for:**
- Cutting opponent when you have safer options
- Leaving FastTrack when you could stay
- Moving backward (Card 4)
- Exiting Bullseye

**Confirmation UI:**
```
┌─────────────────────────┐
│  ⚠️ Confirm Move        │
│                         │
│  Cut opponent's peg?    │
│  They'll return to      │
│  holding area.          │
│                         │
│  [Cancel]  [Confirm ⚔️] │
└─────────────────────────┘
```

### **6. Card 7 Split Mode Enhancement**

**Current:** 4 precise clicks (peg → hole → peg → hole)
**Proposed:** 2 taps on large cards

**Step 1: Choose First Move**
```
┌─────────────────────────────────────┐
│  7 Card Split - First Move (1-6)    │
├─────────────────────────────────────┤
│  🎯 Peg #1                           │
│  ┌─────────────────────────────────┐│
│  │ Move 1 step  (6 left for Peg 2) ││
│  │ Move 2 steps (5 left for Peg 2) ││
│  │ Move 3 steps (4 left for Peg 2) ││
│  │ ...                              ││
│  └─────────────────────────────────┘│
│                                      │
│  🎯 Peg #2                           │
│  ┌─────────────────────────────────┐│
│  │ Move 1 step  (6 left for Peg 1) ││
│  │ ...                              ││
│  └─────────────────────────────────┘│
└─────────────────────────────────────┘
```

**Step 2: Choose Second Move**
```
┌─────────────────────────────────────┐
│  7 Card Split - Second Move (4 left)│
├─────────────────────────────────────┤
│  ✅ Peg #1 moved 3 steps             │
│                                      │
│  🎯 Peg #2 - Move exactly 4 steps    │
│  ┌─────────────────────────────────┐│
│  │ 📍 Destination A  →  4 steps    ││
│  │ ⚔️ Cut opponent!  →  4 steps    ││
│  └─────────────────────────────────┘│
└─────────────────────────────────────┘
```

**Benefits:**
- No tiny hole clicking
- Clear remaining steps
- Shows first move result
- One tap per move

### **7. Accessibility Features**

**Keyboard Navigation:**
- Tab: Cycle through moves
- Arrow keys: Navigate moves
- Enter: Select move
- ESC: Cancel/close modal
- Number keys: Quick select (1-9)

**Screen Reader:**
- Announce move count on open
- Read move details on focus
- Confirm selection audibly

**Haptic Feedback (Mobile):**
- Light tap: Hover/focus move
- Medium tap: Select move
- Strong tap: Illegal move attempt

### **8. Fallback for Tiny Screens**

On very small screens (<375px width):
- Full-screen modal (100% height)
- Larger text (16-18px minimum)
- Simplified move descriptions
- Sticky header with "X of Y moves"

---

## Implementation Roadmap

### **Phase 1: Core Modal System** (High Priority)

1. Create `MoveSelectionModal` class
2. Detect mobile vs desktop
3. Build bottom sheet for mobile
4. Build centered card for desktop
5. Integrate with existing `calculateLegalMoves()`
6. Replace hole clicking with modal trigger

**Files to Modify:**
- `board_3d.html` - Add modal HTML structure
- New file: `move_selection_modal.js` - Modal logic
- `mobile_ui.js` - Integrate with mobile UI
- CSS updates for styling

### **Phase 2: Enhanced Move Cards** (Medium Priority)

1. Implement move type detection (cut, FT, safe zone)
2. Add color coding and icons
3. Implement grouping by peg
4. Add smart sorting algorithm
5. Show strategic hints/badges

### **Phase 3: Preview & Confirmation** (Medium Priority)

1. Hover/long-press preview system
2. Path highlighting on preview
3. Confirmation dialogs for critical moves
4. Undo last move feature (optional)

### **Phase 4: Card 7 Split Redesign** (High Priority)

1. Redesign split mode to use modal
2. Two-step card selection
3. Visual feedback for first move
4. Clear remaining steps indicator

### **Phase 5: Accessibility** (Low Priority)

1. Keyboard navigation
2. Screen reader support
3. Haptic feedback
4. High contrast mode

### **Phase 6: Polish** (Low Priority)

1. Animations (slide-in, fade, scale)
2. Sound effects (tap, confirm, cancel)
3. Gesture support (swipe to dismiss)
4. Dark mode styling

---

## Code Examples

### **Example 1: Move Selection Modal Class**

```javascript
class MoveSelectionModal {
    constructor() {
        this.modal = null;
        this.moves = [];
        this.onMoveSelected = null;
        this.isMobile = window.innerWidth <= 768;
        this.createModal();
    }
    
    createModal() {
        const modal = document.createElement('div');
        modal.id = 'move-selection-modal';
        modal.className = this.isMobile ? 'bottom-sheet' : 'centered-card';
        modal.innerHTML = `
            <div class="modal-backdrop"></div>
            <div class="modal-content">
                <div class="modal-header">
                    <h2 class="modal-title">Choose Your Move</h2>
                    <button class="modal-close" aria-label="Close">×</button>
                </div>
                <div class="modal-body" id="move-options-container"></div>
            </div>
        `;
        document.body.appendChild(modal);
        this.modal = modal;
        this.attachEventListeners();
    }
    
    show(moves, onSelect) {
        this.moves = moves;
        this.onMoveSelected = onSelect;
        this.renderMoves();
        this.modal.classList.add('visible');
        
        // Haptic feedback on mobile
        if (this.isMobile && navigator.vibrate) {
            navigator.vibrate(10);
        }
    }
    
    renderMoves() {
        const container = document.getElementById('move-options-container');
        container.innerHTML = '';
        
        // Group moves by peg
        const groupedMoves = this.groupByPeg(this.moves);
        
        for (const [pegId, pegMoves] of Object.entries(groupedMoves)) {
            const pegGroup = this.createPegGroup(pegId, pegMoves);
            container.appendChild(pegGroup);
        }
    }
    
    groupByPeg(moves) {
        const grouped = {};
        for (const move of moves) {
            if (!grouped[move.pegId]) {
                grouped[move.pegId] = [];
            }
            grouped[move.pegId].push(move);
        }
        return grouped;
    }
    
    createPegGroup(pegId, moves) {
        const group = document.createElement('div');
        group.className = 'peg-group';
        
        const pegNum = this.getPegNumber(pegId);
        const header = document.createElement('div');
        header.className = 'peg-header';
        header.textContent = `🎯 Peg #${pegNum}`;
        group.appendChild(header);
        
        // Sort moves by strategic value
        const sortedMoves = this.sortMoves(moves);
        
        for (const move of sortedMoves) {
            const card = this.createMoveCard(move);
            group.appendChild(card);
        }
        
        return group;
    }
    
    createMoveCard(move) {
        const card = document.createElement('button');
        card.className = 'move-card';
        card.dataset.moveId = move.pegId + '-' + move.toHoleId;
        
        // Determine move type and styling
        const moveType = this.getMoveType(move);
        card.classList.add(`move-type-${moveType.class}`);
        
        card.innerHTML = `
            <div class="move-icon">${moveType.icon}</div>
            <div class="move-details">
                <div class="move-title">${moveType.title}</div>
                <div class="move-subtitle">${move.steps} step${move.steps !== 1 ? 's' : ''}</div>
            </div>
            <div class="move-badge">
                <span class="badge-steps">${move.steps}</span>
            </div>
        `;
        
        // Click handler
        card.addEventListener('click', () => {
            this.selectMove(move);
        });
        
        // Long-press preview (mobile)
        if (this.isMobile) {
            let pressTimer;
            card.addEventListener('touchstart', (e) => {
                pressTimer = setTimeout(() => {
                    this.showPreview(move);
                    if (navigator.vibrate) navigator.vibrate(20);
                }, 500);
            });
            card.addEventListener('touchend', () => {
                clearTimeout(pressTimer);
                this.hidePreview();
            });
        }
        
        return card;
    }
    
    getMoveType(move) {
        // Determine move type and return icon, title, class
        if (move.toHoleId === 'center') {
            return { icon: '🎯', title: 'Enter Bullseye', class: 'bullseye' };
        }
        if (move.isFastTrackEntry) {
            return { icon: '⚡', title: 'Enter FastTrack', class: 'fasttrack' };
        }
        if (move.toHoleId.includes('safe')) {
            return { icon: '🛡️', title: 'Safe Zone', class: 'safe' };
        }
        if (move.toHoleId.includes('winner')) {
            return { icon: '🏆', title: 'Winner Hole!', class: 'winner' };
        }
        
        // Check for cut
        const cutTarget = this.findCutTarget(move.toHoleId);
        if (cutTarget) {
            return { icon: '⚔️', title: 'Cut Opponent!', class: 'cut' };
        }
        
        // Default
        return { icon: '📍', title: `Move to ${this.simplifyHoleId(move.toHoleId)}`, class: 'normal' };
    }
    
    selectMove(move) {
        // Haptic feedback
        if (this.isMobile && navigator.vibrate) {
            navigator.vibrate(30);
        }
        
        this.hide();
        if (this.onMoveSelected) {
            this.onMoveSelected(move);
        }
    }
    
    hide() {
        this.modal.classList.remove('visible');
    }
    
    // ... helper methods ...
}
```

### **Example 2: Integration with Existing Code**

```javascript
// In board_3d.html, replace hole clicking logic:

// OLD CODE:
function highlightLegalMoves(moves) {
    // Highlight holes, make them clickable
    for (const move of moves) {
        const hole = holeRegistry.get(move.toHoleId);
        if (hole) {
            hole.isHighlighted = true;
            // ... visual highlighting ...
        }
    }
}

// NEW CODE:
function highlightLegalMoves(moves) {
    // Check if multiple moves or complex choice
    const needsModal = moves.length > 1 || hasComplexChoice(moves);
    
    if (needsModal && !isAIPlayer(gameState.currentPlayerIndex)) {
        // Show modal instead of highlighting holes
        moveSelectionModal.show(moves, (selectedMove) => {
            executeMoveDirectly(selectedMove);
        });
    } else {
        // Single move - auto-execute or use existing logic
        if (moves.length === 1) {
            executeMoveDirectly(moves[0]);
        }
    }
}

function hasComplexChoice(moves) {
    // Complex if:
    // - Multiple pegs can move
    // - Same peg has multiple strategic options (FT vs perimeter)
    // - Any cut opportunities
    const pegIds = new Set(moves.map(m => m.pegId));
    const hasCuts = moves.some(m => findCutTarget(m.toHoleId));
    const hasFTChoice = moves.some(m => m.isFastTrackEntry);
    
    return pegIds.size > 1 || hasCuts || hasFTChoice;
}
```

### **Example 3: CSS Styling**

```css
/* Move Selection Modal */
#move-selection-modal {
    position: fixed;
    inset: 0;
    z-index: 10000;
    display: none;
    opacity: 0;
    transition: opacity 0.3s ease;
}

#move-selection-modal.visible {
    display: flex;
    opacity: 1;
}

/* Bottom Sheet (Mobile) */
#move-selection-modal.bottom-sheet {
    align-items: flex-end;
}

#move-selection-modal.bottom-sheet .modal-content {
    width: 100%;
    max-height: 70vh;
    border-radius: 20px 20px 0 0;
    background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
    box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.5);
    animation: slideUp 0.3s ease;
}

@keyframes slideUp {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
}

/* Centered Card (Desktop) */
#move-selection-modal.centered-card {
    align-items: center;
    justify-content: center;
}

#move-selection-modal.centered-card .modal-content {
    width: 90%;
    max-width: 500px;
    max-height: 80vh;
    border-radius: 16px;
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
    animation: scaleIn 0.3s ease;
}

@keyframes scaleIn {
    from { transform: scale(0.9); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
}

/* Modal Backdrop */
.modal-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(4px);
}

/* Modal Content */
.modal-content {
    position: relative;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.modal-header {
    padding: 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.modal-title {
    font-size: 20px;
    font-weight: 600;
    color: #fff;
    margin: 0;
}

.modal-close {
    background: none;
    border: none;
    color: #fff;
    font-size: 32px;
    cursor: pointer;
    padding: 0;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: background 0.2s;
}

.modal-close:hover {
    background: rgba(255, 255, 255, 0.1);
}

.modal-body {
    padding: 16px;
    overflow-y: auto;
    flex: 1;
}

/* Peg Group */
.peg-group {
    margin-bottom: 24px;
}

.peg-header {
    font-size: 16px;
    font-weight: 600;
    color: #ffd700;
    margin-bottom: 12px;
    padding-left: 8px;
}

/* Move Card */
.move-card {
    width: 100%;
    min-height: 68px;
    padding: 14px 16px;
    margin-bottom: 10px;
    border: 2px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02));
    display: flex;
    align-items: center;
    gap: 14px;
    cursor: pointer;
    transition: all 0.2s ease;
    color: #fff;
    text-align: left;
}

.move-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    border-color: rgba(255, 255, 255, 0.3);
}

.move-card:active {
    transform: scale(0.98);
}

/* Move Type Colors */
.move-card.move-type-cut {
    border-color: rgba(255, 68, 68, 0.5);
    background: linear-gradient(135deg, rgba(255, 68, 68, 0.15), rgba(255, 68, 68, 0.05));
}

.move-card.move-type-fasttrack {
    border-color: rgba(255, 215, 0, 0.5);
    background: linear-gradient(135deg, rgba(255, 215, 0, 0.15), rgba(255, 215, 0, 0.05));
}

.move-card.move-type-safe {
    border-color: rgba(68, 255, 68, 0.5);
    background: linear-gradient(135deg, rgba(68, 255, 68, 0.15), rgba(68, 255, 68, 0.05));
}

.move-card.move-type-winner {
    border-color: rgba(255, 215, 0, 0.8);
    background: linear-gradient(135deg, rgba(255, 215, 0, 0.25), rgba(255, 215, 0, 0.1));
    animation: winnerPulse 2s infinite;
}

@keyframes winnerPulse {
    0%, 100% { box-shadow: 0 0 10px rgba(255, 215, 0, 0.5); }
    50% { box-shadow: 0 0 20px rgba(255, 215, 0, 0.8); }
}

/* Move Card Elements */
.move-icon {
    font-size: 32px;
    flex-shrink: 0;
}

.move-details {
    flex: 1;
    min-width: 0;
}

.move-title {
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.move-subtitle {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.6);
}

.move-badge {
    flex-shrink: 0;
}

.badge-steps {
    display: inline-block;
    min-width: 32px;
    height: 32px;
    line-height: 32px;
    text-align: center;
    background: rgba(255, 255, 255, 0.15);
    border-radius: 50%;
    font-weight: 700;
    font-size: 14px;
}

/* Mobile Optimizations */
@media (max-width: 768px) {
    .modal-title {
        font-size: 18px;
    }
    
    .move-card {
        min-height: 72px;
        padding: 16px;
    }
    
    .move-icon {
        font-size: 36px;
    }
    
    .move-title {
        font-size: 17px;
    }
    
    .move-subtitle {
        font-size: 14px;
    }
}

/* Accessibility */
.move-card:focus {
    outline: 3px solid #ffd700;
    outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
    .move-card,
    #move-selection-modal,
    .modal-content {
        animation: none;
        transition: none;
    }
}
```

---

## Migration Strategy

### **Gradual Rollout**

1. **Week 1:** Implement modal for mobile only, keep hole clicking for desktop
2. **Week 2:** Add desktop modal as opt-in (settings toggle)
3. **Week 3:** Make modal default for both, keep hole clicking as fallback
4. **Week 4:** Remove hole clicking entirely, modal only

### **A/B Testing**

- 50% users get modal
- 50% users get hole clicking
- Track metrics:
  - Time to make move
  - Mis-click rate
  - User satisfaction (survey)
  - Completion rate

### **Rollback Plan**

If modal causes issues:
- Feature flag to disable modal
- Revert to hole clicking
- Fix issues, re-deploy

---

## Success Metrics

### **Quantitative**

- **Mis-click rate:** < 5% (currently ~20-30% on mobile)
- **Time to select move:** < 3 seconds (currently 5-10 seconds)
- **Mobile completion rate:** > 90% (currently ~60%)
- **User retention:** +15% (fewer rage-quits)

### **Qualitative**

- User feedback: "Much easier to play on phone!"
- Reduced support tickets about "accidental moves"
- Positive app store reviews mentioning UX

---

## Conclusion

The current hole-clicking system is fundamentally incompatible with mobile gameplay and creates frustration even on desktop when the camera moves. A **unified move selection modal** with large touch targets, clear visual hierarchy, and smart defaults will dramatically improve the user experience across all devices.

**Recommended Next Steps:**
1. Prototype bottom sheet modal for mobile
2. Test with 5-10 users
3. Iterate based on feedback
4. Implement full solution
5. Deploy gradually with A/B testing

This investment will pay dividends in user satisfaction, retention, and positive word-of-mouth.
