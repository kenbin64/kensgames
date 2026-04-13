# Starfighter — Ergonomic Weapon Control System (All Platforms)

Mouse-first, intuitive, minimal-effort combat controls.
Every weapon must be fireable with minimal hand movement, minimal cognitive load, and maximum speed.

---

## 1. Mouse-First Ergonomic Weapon Controls (Primary PC Interface)

The mouse is the **main combat interface**.
All weapons are mapped to natural, low-effort finger motions.

### 1.1 Mouse Buttons (Weapons)

| Mouse Input | Action | Ergonomic Reason |
|---|---|---|
| **Left Click** | Fire Lasers (primary) | Most natural, fastest reaction |
| **Right Click** | Fire Lasers (secondary) | Symmetric to left click, easy to alternate |
| **Middle Click** | Fire Torpedo | Deliberate action, prevents accidental fire |
| **Side Button 1 (Thumb Forward)** | Proton Torpedo (future) | Easy thumb reach |
| **Side Button 2 (Thumb Back)** | Redock Procedure (future) | Natural "return" gesture |

### 1.2 Mouse Movement

| Input | Action |
|---|---|
| **Move Mouse** | Steer ship (pointer lock FPS-style) |
| **Scroll Up** | Increase throttle (planned) |
| **Scroll Down** | Decrease throttle (planned) |

### 1.3 Mouse-Based Targeting
- Aim reticle follows mouse center
- T key locks nearest enemy in forward cone
- Torpedo auto-tracks locked target

---

## 2. Keyboard Controls (Currently Implemented)

### 2.1 Flight

| Key | Action |
|---|---|
| **W** | Increase throttle |
| **S** | Decrease throttle |
| **Q** | Roll left |
| **E** | Roll right |
| **Arrow Keys** | Pitch / Yaw (alternative to mouse) |
| **Shift** | Turbo thrust (afterburner) |

### 2.2 Weapons

| Key | Action |
|---|---|
| **Space** | Fire Lasers |
| **F** | Fire Torpedo (one per press) |
| **T** | Lock-on nearest target |

### 2.3 System

| Key | Action |
|---|---|
| **H** | Toggle controls panel |
| **Space** (during launch) | Trigger launch |
| **Space** (during land-approach) | Dock with baseship |

### 2.4 Planned Weapon Hotkeys

| Key | Weapon |
|---|---|
| **1** | Lasers |
| **2** | Machine Gun |
| **3** | Pulse |
| **4** | Torpedo |

---

## 3. Gamepad Controls (Currently Implemented)

### 3.1 Flight

| Input | Action |
|---|---|
| **Left Stick Y** | Pitch (inverted) |
| **Left Stick X** | Yaw |
| **Right Stick X** | Roll |
| **RT (R2)** | Increase throttle |
| **LT (L2)** | Decrease throttle |
| **LB (L1)** | Turbo thrust |

### 3.2 Weapons

| Input | Action |
|---|---|
| **A** | Fire Lasers |
| **X** | Fire Torpedo (one per press) |
| **Y** | Lock-on target |

### 3.3 Planned Gamepad Layout

| Input | Action |
|---|---|
| **RT** | Lasers |
| **LT** | Machine Gun |
| **RB** | Pulse |
| **LB** | Torpedo |
| **Y** | Redock |
| **X** | Target nearest |
| **A** | Afterburner |
| **B** | Brake |

---

## 4. Joystick / HOTAS Layout (Planned)

| Input | Action |
|---|---|
| **Trigger** | Lasers |
| **Secondary Trigger** | Machine Gun |
| **Thumb Button** | Pulse |
| **Top Hat Button** | Torpedo |
| **Toggle Switch** | Redock |
| **Slider** | Radar zoom |

---

## 5. Smartphone Touch Layout (Planned)

### Right Thumb Cluster (Weapons)
- Tap = Lasers
- Swipe up = Machine Gun
- Hold = Pulse
- Double-tap = Torpedo

### Left Thumb Cluster (Systems)
- Dock button
- Target button
- Radar zoom pinch

---

## 6. Tablet Controls (Planned)

Same as smartphone with larger spacing and multi-finger gestures.

---

## 7. Handheld Device Controls — Steam Deck, Switch-like (Planned)

| Input | Action |
|---|---|
| **R2** | Lasers |
| **L2** | Machine Gun |
| **R1** | Pulse |
| **L1** | Torpedo |
| **Y** | Redock |
| **X** | Target nearest |

Touchscreen assists radar and cockpit controls.

---

## 8. VR Controls (Planned)

| Input | Action |
|---|---|
| **Trigger pull** | Lasers |
| **Grip button** | Machine Gun |
| **Thumb press** | Pulse |
| **Top button** | Torpedo |
| **Reach dock switch** | Redock |
| **Touch radar sphere** | Zoom radar |

---

## 9. Design Principles

- Controls must be **context-aware** and **platform-adaptive**
- Mouse is **primary** when detected
- Gamepad overrides keyboard movement when connected
- Touch UI scales with screen size
- VR uses hand-tracked cockpit interactions
- Weapon controls must be **ergonomic first**, not "realistic"
- All weapons must be fireable with **minimal finger travel**
- Redock must always be **one-gesture** or **one-button**
- Torpedo must require **deliberate input** to avoid misfires
- Pulse weapon must require **hold** or **grip** to prevent accidental use
