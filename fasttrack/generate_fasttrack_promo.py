#!/usr/bin/env python3
"""
FastTrack Promotional Video Generator
======================================

Creates an immersive 3D promotional video for FastTrack featuring:
- Hexagonal board with rotating perspective
- Animated pegs racing around the track
- Card draw animations
- Theme showcases (Space Ace, Undersea, Roman Coliseum)
- Stadium atmosphere music
- Voice narration
- ButterflyFX manifold visualization

Built on the ButterflyFX Dimensional Programming paradigm:
q = (x, y, z, m) - spatial coordinates + manifold position
"""

import os
import sys
import math
import struct
import wave
import subprocess
import tempfile
import random
from pathlib import Path
from dataclasses import dataclass
from typing import List, Tuple, Dict, Any

# Setup environment
os.environ["BUTTERFLYFX_DEV"] = "1"
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))

# ============================================================
# VIDEO CONFIGURATION
# ============================================================

WIDTH = 1920
HEIGHT = 1080
FPS = 30
DURATION = 90  # 1.5 minute promo

# ============================================================
# FASTTRACK COLORS & THEMES
# ============================================================

@dataclass
class RGB:
    r: int
    g: int
    b: int
    
    def lerp(self, other: 'RGB', t: float) -> 'RGB':
        t = max(0, min(1, t))
        return RGB(
            int(self.r + (other.r - self.r) * t),
            int(self.g + (other.g - self.g) * t),
            int(self.b + (other.b - self.b) * t)
        )
    
    def scale(self, factor: float) -> 'RGB':
        return RGB(
            int(min(255, self.r * factor)),
            int(min(255, self.g * factor)),
            int(min(255, self.b * factor))
        )


# Player colors
PLAYER_COLORS = [
    RGB(255, 107, 107),  # Red
    RGB(78, 205, 196),   # Cyan
    RGB(255, 230, 109),  # Yellow
    RGB(150, 206, 180),  # Green
    RGB(180, 130, 255),  # Purple
    RGB(255, 180, 100),  # Orange
]

# Theme palettes
THEMES = {
    'DEFAULT': {
        'name': 'Classic Arena',
        'bg1': RGB(20, 22, 40),
        'bg2': RGB(40, 45, 80),
        'board': RGB(60, 65, 100),
        'accent': RGB(255, 215, 0),
        'glow': RGB(100, 150, 255),
    },
    'SPACE_ACE': {
        'name': 'Space Ace',
        'bg1': RGB(5, 5, 25),
        'bg2': RGB(20, 10, 50),
        'board': RGB(30, 40, 80),
        'accent': RGB(0, 255, 255),
        'glow': RGB(255, 0, 255),
    },
    'UNDERSEA': {
        'name': 'Ocean Depths',
        'bg1': RGB(0, 30, 60),
        'bg2': RGB(0, 60, 100),
        'board': RGB(20, 80, 120),
        'accent': RGB(0, 200, 255),
        'glow': RGB(100, 255, 200),
    },
    'ROMAN': {
        'name': 'Roman Coliseum',
        'bg1': RGB(40, 25, 15),
        'bg2': RGB(80, 50, 30),
        'board': RGB(100, 70, 50),
        'accent': RGB(255, 200, 100),
        'glow': RGB(255, 150, 50),
    },
}

# FastTrack card values
CARDS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'JOKER']

# Narration script (timestamp, text)
NARRATION_SCRIPT = [
    (0, "FastTrack"),
    (2, "The Ultimate Race Around the Board"),
    (6, "Four pegs. One hexagonal track. Endless strategy."),
    (12, "Draw cards to move your pieces"),
    (16, "Land on opponents to send them home"),
    (21, "Royal cards grant extra turns"),
    (26, "First to get all four pegs home wins!"),
    (32, "Play in stunning 3D environments"),
    (37, "Space Ace theme"),
    (42, "Undersea adventure"),
    (47, "Roman Coliseum glory"),
    (52, "Smart AI opponents at any difficulty"),
    (58, "Challenge friends in private rooms"),
    (63, "Or compete in the public lobby"),
    (68, "Teams mode coming soon. Two versus two. Three versus three."),
    (75, "Built on ButterflyFX dimensional computing"),
    (80, "FastTrack. Race to victory."),
    (85, "Play free now at butterflyfx.io"),
]


# ============================================================
# FRAME BUFFER - Simple RGB pixel buffer
# ============================================================

class FrameBuffer:
    """Simple frame buffer for video rendering"""
    
    def __init__(self, width: int, height: int):
        self.width = width
        self.height = height
        self.pixels = [RGB(0, 0, 0) for _ in range(width * height)]
    
    def clear(self, color: RGB = RGB(0, 0, 0)):
        for i in range(len(self.pixels)):
            self.pixels[i] = color
    
    def set_pixel(self, x: int, y: int, color: RGB):
        if 0 <= x < self.width and 0 <= y < self.height:
            self.pixels[y * self.width + x] = color
    
    def get_pixel(self, x: int, y: int) -> RGB:
        if 0 <= x < self.width and 0 <= y < self.height:
            return self.pixels[y * self.width + x]
        return RGB(0, 0, 0)
    
    def blend_pixel(self, x: int, y: int, color: RGB, alpha: float):
        """Blend color with existing pixel"""
        if 0 <= x < self.width and 0 <= y < self.height:
            existing = self.get_pixel(x, y)
            blended = existing.lerp(color, alpha)
            self.set_pixel(x, y, blended)
    
    def to_bytes(self) -> bytes:
        """Convert to RGB bytes for video encoding"""
        data = bytearray(self.width * self.height * 3)
        for i, pixel in enumerate(self.pixels):
            data[i*3] = pixel.r
            data[i*3 + 1] = pixel.g
            data[i*3 + 2] = pixel.b
        return bytes(data)


# ============================================================
# DRAWING PRIMITIVES
# ============================================================

def ease_in_out(t: float) -> float:
    """Smooth ease in/out curve"""
    return t * t * (3 - 2 * t)


def ease_out(t: float) -> float:
    """Ease out curve"""
    return 1 - (1 - t) ** 3


def draw_gradient(fb: FrameBuffer, c1: RGB, c2: RGB, angle: float = 0):
    """Draw gradient background"""
    cos_a = math.cos(angle)
    sin_a = math.sin(angle)
    
    for y in range(fb.height):
        for x in range(fb.width):
            # Normalized position along gradient axis
            nx = (x / fb.width - 0.5)
            ny = (y / fb.height - 0.5)
            t = (nx * cos_a + ny * sin_a + 0.5)
            t = max(0, min(1, t))
            
            color = c1.lerp(c2, t)
            fb.set_pixel(x, y, color)


def draw_circle(fb: FrameBuffer, cx: int, cy: int, radius: float, 
                color: RGB, filled: bool = True):
    """Draw a circle"""
    r2 = radius * radius
    for dy in range(-int(radius)-1, int(radius)+2):
        for dx in range(-int(radius)-1, int(radius)+2):
            d2 = dx*dx + dy*dy
            if filled:
                if d2 <= r2:
                    alpha = 1.0 if d2 < (radius-1)**2 else max(0, 1 - (math.sqrt(d2) - radius + 1))
                    fb.blend_pixel(cx + dx, cy + dy, color, alpha)
            else:
                ring = abs(math.sqrt(d2) - radius)
                if ring < 2:
                    alpha = 1 - ring / 2
                    fb.blend_pixel(cx + dx, cy + dy, color, alpha)


def draw_hexagon(fb: FrameBuffer, cx: int, cy: int, radius: float,
                 color: RGB, thickness: float = 3, rotation: float = 0):
    """Draw a hexagon outline"""
    points = []
    for i in range(6):
        angle = math.radians(60 * i) + rotation
        x = cx + radius * math.cos(angle)
        y = cy + radius * math.sin(angle)
        points.append((x, y))
    
    # Draw lines between points
    for i in range(6):
        x1, y1 = points[i]
        x2, y2 = points[(i + 1) % 6]
        draw_line(fb, int(x1), int(y1), int(x2), int(y2), color, thickness)


def draw_line(fb: FrameBuffer, x1: int, y1: int, x2: int, y2: int,
              color: RGB, thickness: float = 1):
    """Draw a line with anti-aliasing"""
    dx = x2 - x1
    dy = y2 - y1
    length = max(1, math.sqrt(dx*dx + dy*dy))
    steps = int(length * 2)
    
    for i in range(steps + 1):
        t = i / max(1, steps)
        x = x1 + dx * t
        y = y1 + dy * t
        
        for ox in range(-int(thickness), int(thickness)+1):
            for oy in range(-int(thickness), int(thickness)+1):
                d = math.sqrt(ox*ox + oy*oy)
                if d <= thickness:
                    alpha = 1 - d / thickness if d > thickness - 1 else 1
                    fb.blend_pixel(int(x)+ox, int(y)+oy, color, alpha)


def draw_glow(fb: FrameBuffer, cx: int, cy: int, radius: float, 
              color: RGB, intensity: float = 1.0):
    """Draw a soft glow effect"""
    for dy in range(-int(radius*2), int(radius*2)+1):
        for dx in range(-int(radius*2), int(radius*2)+1):
            d = math.sqrt(dx*dx + dy*dy)
            if d < radius * 2:
                alpha = (1 - d / (radius*2)) ** 2 * intensity * 0.5
                fb.blend_pixel(cx + dx, cy + dy, color, alpha)


def draw_text_area(fb: FrameBuffer, text: str, cx: int, cy: int, 
                   color: RGB, size: int = 40):
    """Draw a glowing text area (simplified - just a glowing rectangle)"""
    if not text:
        return
    
    width = min(len(text) * size // 2, fb.width - 100)
    height = size + 10
    
    # Draw glow
    for dy in range(-height//2, height//2):
        for dx in range(-width//2, width//2):
            x, y = cx + dx, cy + dy
            # Fade at edges
            edge_dist = min(
                dx + width//2, width//2 - dx,
                dy + height//2, height//2 - dy
            )
            alpha = min(1, edge_dist / 20) * 0.3
            fb.blend_pixel(x, y, color, alpha)


# ============================================================
# FASTTRACK BOARD RENDERING
# ============================================================

def get_board_hole_positions(cx: int, cy: int, radius: float, 
                             rotation: float = 0) -> List[Tuple[float, float]]:
    """
    Get positions of all holes on the FastTrack hexagonal board.
    Returns list of (x, y) positions for the 96 track holes.
    """
    holes = []
    
    # 6 sides, 16 holes per side (approx)
    holes_per_side = 16
    
    for side in range(6):
        base_angle = math.radians(60 * side) + rotation
        next_angle = math.radians(60 * (side + 1)) + rotation
        
        # Start and end points of this side
        x1 = cx + radius * math.cos(base_angle)
        y1 = cy + radius * math.sin(base_angle)
        x2 = cx + radius * math.cos(next_angle)
        y2 = cy + radius * math.sin(next_angle)
        
        # Interpolate holes along the side
        for i in range(holes_per_side):
            t = i / holes_per_side
            x = x1 + (x2 - x1) * t
            y = y1 + (y2 - y1) * t
            holes.append((x, y))
    
    return holes


def draw_fasttrack_board(fb: FrameBuffer, theme: Dict, t: float,
                         rotation: float = 0, tilt: float = 0.3):
    """Draw the FastTrack hexagonal board with 3D perspective"""
    cx, cy = fb.width // 2, fb.height // 2 + 50
    
    # Board radius (screen-space)
    base_radius = min(fb.width, fb.height) * 0.35
    
    # Apply rotation and tilt for 3D effect
    board_rotation = rotation + t * 0.1  # Slow rotation
    
    # Draw outer hexagon glow
    draw_glow(fb, cx, cy, base_radius * 1.2, theme['glow'], 0.3)
    
    # Draw board layers (creates depth effect)
    for layer in range(3, 0, -1):
        layer_radius = base_radius * (1 + layer * 0.02)
        layer_color = theme['board'].scale(0.5 + layer * 0.1)
        draw_hexagon(fb, cx, int(cy + layer * 5), layer_radius, 
                     layer_color, 4, board_rotation)
    
    # Draw main board outline
    draw_hexagon(fb, cx, cy, base_radius, theme['accent'], 4, board_rotation)
    
    # Draw track holes
    holes = get_board_hole_positions(cx, cy, base_radius * 0.9, board_rotation)
    hole_radius = 8
    
    for i, (hx, hy) in enumerate(holes):
        # Apply perspective tilt
        hy_tilted = cy + (hy - cy) * (1 - tilt * 0.3)
        
        # Hole color varies slightly around the track
        brightness = 0.6 + 0.2 * math.sin(i * 0.2 + t)
        hole_color = theme['board'].scale(brightness)
        
        draw_circle(fb, int(hx), int(hy_tilted), hole_radius, hole_color, False)
    
    # Draw center area
    draw_glow(fb, cx, cy, base_radius * 0.3, theme['accent'], 0.4)
    draw_circle(fb, cx, cy, base_radius * 0.15, theme['board'].scale(1.2), True)
    
    return holes


def draw_peg(fb: FrameBuffer, x: int, y: int, color: RGB, 
             scale: float = 1.0, glow: bool = True):
    """Draw a game peg at position"""
    radius = int(12 * scale)
    
    if glow:
        draw_glow(fb, x, y, radius * 2, color, 0.5)
    
    # Draw peg body (3D effect with highlight)
    draw_circle(fb, x, y, radius, color, True)
    
    # Highlight
    highlight = RGB(
        min(255, color.r + 80),
        min(255, color.g + 80),
        min(255, color.b + 80)
    )
    draw_circle(fb, x - radius//3, y - radius//3, radius//3, highlight, True)


def draw_card(fb: FrameBuffer, cx: int, cy: int, value: str,
              scale: float = 1.0, rotation: float = 0):
    """Draw a playing card"""
    w = int(80 * scale)
    h = int(120 * scale)
    
    # Card background
    card_color = RGB(255, 250, 240)
    border_color = RGB(100, 100, 100)
    
    # Simple rectangle (rotated)
    cos_r = math.cos(rotation)
    sin_r = math.sin(rotation)
    
    for dy in range(-h//2, h//2):
        for dx in range(-w//2, w//2):
            rx = int(dx * cos_r - dy * sin_r)
            ry = int(dx * sin_r + dy * cos_r)
            
            # Border check
            if abs(dx) > w//2 - 3 or abs(dy) > h//2 - 3:
                fb.blend_pixel(cx + rx, cy + ry, border_color, 0.8)
            else:
                fb.blend_pixel(cx + rx, cy + ry, card_color, 0.9)
    
    # Card value indicator (red glow for hearts/diamonds, black for others)
    is_red = value in ['A', '2', '3', '4', '5', '6', '7', 'JOKER']
    value_color = RGB(200, 50, 50) if is_red else RGB(30, 30, 30)
    draw_glow(fb, cx, cy, w//3, value_color, 0.5)


# ============================================================
# SCENE RENDERING
# ============================================================

def scene_intro(fb: FrameBuffer, t: float, scene_t: float):
    """Opening scene - Logo reveal"""
    theme = THEMES['DEFAULT']
    
    # Animated gradient
    angle = t * 0.1
    draw_gradient(fb, theme['bg1'], theme['bg2'], angle)
    
    # Central glow builds up
    intensity = ease_in_out(min(1, scene_t / 2))
    cx, cy = fb.width // 2, fb.height // 2
    
    draw_glow(fb, cx, cy, 300 * intensity, theme['accent'], intensity * 0.8)
    draw_glow(fb, cx, cy, 200 * intensity, theme['glow'], intensity * 0.6)
    
    # Draw expanding hexagons
    for i in range(5):
        delay = i * 0.3
        if scene_t > delay:
            hex_t = min(1, (scene_t - delay) / 1.5)
            radius = 50 + i * 60 + hex_t * 100
            alpha = (1 - hex_t) * 0.5
            color = theme['accent'].scale(alpha)
            draw_hexagon(fb, cx, cy, radius, color, 2, t * 0.2)
    
    # Text area
    if scene_t > 1:
        draw_text_area(fb, "FASTTRACK", cx, cy + 200, theme['accent'], 60)


def scene_board_reveal(fb: FrameBuffer, t: float, scene_t: float):
    """Board flies in and starts rotating"""
    theme = THEMES['DEFAULT']
    draw_gradient(fb, theme['bg1'], theme['bg2'], 0.5)
    
    # Board scales up
    scale = ease_out(min(1, scene_t / 2))
    rotation = scene_t * 0.3
    
    # Temporarily offset - board flies in from top
    offset_y = int((1 - scale) * -300)
    
    fb_temp = FrameBuffer(fb.width, fb.height)
    draw_fasttrack_board(fb_temp, theme, t, rotation)
    
    # Copy with offset
    for y in range(fb.height):
        for x in range(fb.width):
            src_y = y - offset_y
            if 0 <= src_y < fb.height:
                color = fb_temp.get_pixel(x, src_y)
                if color.r + color.g + color.b > 10:
                    fb.blend_pixel(x, y, color, scale)


def scene_gameplay(fb: FrameBuffer, t: float, scene_t: float, 
                   theme_name: str = 'DEFAULT'):
    """Show gameplay with pegs moving"""
    theme = THEMES[theme_name]
    draw_gradient(fb, theme['bg1'], theme['bg2'], 0.3)
    
    # Draw board
    rotation = t * 0.15
    holes = draw_fasttrack_board(fb, theme, t, rotation)
    
    # Animate pegs around the track
    num_pegs = 4
    for i in range(num_pegs):
        # Each peg moves at different speeds
        speed = 2 + i * 0.5
        pos = (scene_t * speed + i * 20) % len(holes)
        pos_int = int(pos)
        pos_frac = pos - pos_int
        
        # Interpolate between holes
        h1 = holes[pos_int % len(holes)]
        h2 = holes[(pos_int + 1) % len(holes)]
        
        x = h1[0] + (h2[0] - h1[0]) * pos_frac
        y = h1[1] + (h2[1] - h1[1]) * pos_frac
        
        # Apply same tilt as board
        cy = fb.height // 2 + 50
        y = cy + (y - cy) * 0.79
        
        draw_peg(fb, int(x), int(y), PLAYER_COLORS[i])
    
    # Draw a card being played
    card_x = fb.width - 200
    card_y = fb.height // 2
    card_rotation = math.sin(t) * 0.1
    card_value = CARDS[int(scene_t * 2) % len(CARDS)]
    draw_card(fb, card_x, card_y, card_value, 1.2, card_rotation)


def scene_themes(fb: FrameBuffer, t: float, scene_t: float, 
                 theme_name: str):
    """Showcase different themes"""
    theme = THEMES[theme_name]
    
    # Transition effect
    transition_t = ease_in_out(min(1, scene_t / 1.5))
    
    draw_gradient(fb, theme['bg1'], theme['bg2'], 0.3)
    
    # Draw board with theme
    rotation = t * 0.2
    holes = draw_fasttrack_board(fb, theme, t, rotation)
    
    # Theme name at bottom
    cx = fb.width // 2
    draw_text_area(fb, theme['name'].upper(), cx, fb.height - 100, 
                   theme['accent'], 50)
    
    # Animated pegs
    for i in range(4):
        pos = (scene_t * 3 + i * 24) % len(holes)
        hx, hy = holes[int(pos)]
        cy = fb.height // 2 + 50
        hy = cy + (hy - cy) * 0.79
        draw_peg(fb, int(hx), int(hy), PLAYER_COLORS[i])


def scene_features(fb: FrameBuffer, t: float, scene_t: float):
    """Show feature highlights"""
    theme = THEMES['DEFAULT']
    draw_gradient(fb, theme['bg1'], theme['bg2'], t * 0.05)
    
    cx, cy = fb.width // 2, fb.height // 2
    
    # Feature icons as glowing hexagons
    features = [
        (cx - 300, cy - 100, "AI", RGB(100, 200, 255)),
        (cx, cy - 100, "FRIENDS", RGB(255, 150, 100)),
        (cx + 300, cy - 100, "LOBBY", RGB(150, 255, 150)),
        (cx - 150, cy + 150, "TEAMS", RGB(255, 200, 100)),
        (cx + 150, cy + 150, "3D", RGB(200, 150, 255)),
    ]
    
    for i, (fx, fy, label, color) in enumerate(features):
        delay = i * 0.5
        if scene_t > delay:
            feature_t = min(1, (scene_t - delay) / 1)
            scale = ease_out(feature_t)
            
            draw_glow(fb, fx, fy, 60 * scale, color, 0.6)
            draw_hexagon(fb, fx, fy, 50 * scale, color, 3, t * 0.3)
            draw_text_area(fb, label, fx, fy + 80, color, 24)


def scene_butterflyfx(fb: FrameBuffer, t: float, scene_t: float):
    """ButterflyFX branding with helix"""
    theme = THEMES['SPACE_ACE']
    draw_gradient(fb, theme['bg1'], theme['bg2'], 0.3)
    
    cx, cy = fb.width // 2, fb.height // 2
    
    # Draw dimensional helix
    helix_points = 100
    radius = 150
    turns = 3
    
    for strand in range(2):
        for i in range(helix_points):
            pt = i / helix_points
            angle = pt * math.pi * 2 * turns + t * 2 + strand * math.pi
            
            # Helix coordinates
            hx = cx + radius * math.cos(angle)
            hy = cy + (pt - 0.5) * 300
            depth = (math.sin(angle) + 1) * 0.5
            
            # Color based on strand and depth
            if strand == 0:
                color = RGB(int(255 * depth), int(100 * depth), int(200 * depth))
            else:
                color = RGB(int(100 * depth), int(200 * depth), int(255 * depth))
            
            point_radius = 4 + depth * 4
            draw_circle(fb, int(hx), int(hy), point_radius, color, True)
    
    # ButterflyFX text area
    draw_text_area(fb, "BUTTERFLYFX", cx, cy + 250, RGB(255, 107, 157), 50)
    draw_text_area(fb, "Dimensional Computing", cx, cy + 310, RGB(150, 150, 200), 30)


def scene_outro(fb: FrameBuffer, t: float, scene_t: float):
    """Final call to action"""
    theme = THEMES['DEFAULT']
    draw_gradient(fb, theme['bg1'], theme['bg2'], 0)
    
    cx, cy = fb.width // 2, fb.height // 2
    
    # Pulsing glow
    pulse = 0.7 + 0.3 * math.sin(t * 3)
    draw_glow(fb, cx, cy, 400, theme['accent'], pulse * 0.5)
    
    # Central hexagon
    draw_hexagon(fb, cx, cy, 200, theme['accent'], 5, t * 0.2)
    
    # Text
    draw_text_area(fb, "PLAY FREE NOW", cx, cy, theme['accent'], 60)
    draw_text_area(fb, "butterflyfx.io/fasttrack", cx, cy + 100, 
                   RGB(200, 200, 200), 35)


# ============================================================
# AUDIO GENERATION
# ============================================================

def generate_ambient_track(duration: float, sample_rate: int = 44100) -> List[float]:
    """Generate ambient electronic music track"""
    print("  Generating ambient music track...")
    
    samples = []
    num_samples = int(duration * sample_rate)
    
    # Multiple oscillators for rich sound
    for i in range(num_samples):
        t = i / sample_rate
        sample = 0.0
        
        # Bass drone (low frequency)
        bass_freq = 55  # A1
        sample += 0.15 * math.sin(2 * math.pi * bass_freq * t)
        
        # Pad (chord tones)
        chord_freqs = [220, 277, 330, 440]  # A minor
        for freq in chord_freqs:
            # Slow tremolo
            tremolo = 0.7 + 0.3 * math.sin(t * 0.5 + freq * 0.01)
            sample += 0.05 * tremolo * math.sin(2 * math.pi * freq * t)
        
        # Arpeggio (higher melody)
        arp_freqs = [440, 554, 659, 880]
        arp_idx = int(t * 4) % len(arp_freqs)
        arp_freq = arp_freqs[arp_idx]
        arp_env = (t * 4) % 1  # Decay envelope
        arp_env = (1 - arp_env) ** 2
        sample += 0.08 * arp_env * math.sin(2 * math.pi * arp_freq * t)
        
        # Hi-hat rhythm (noise bursts)
        beat = t * 4  # 4 beats per second
        beat_frac = beat % 1
        if beat_frac < 0.1:
            noise = (random.random() * 2 - 1) * 0.03
            sample += noise * (1 - beat_frac / 0.1)
        
        # Fade in/out
        fade_in = min(1, t / 3)
        fade_out = min(1, (duration - t) / 3)
        sample *= fade_in * fade_out
        
        # Soft limit
        sample = max(-0.8, min(0.8, sample))
        samples.append(sample)
    
    return samples


def generate_voice_narration(duration: float, sample_rate: int = 44100) -> List[float]:
    """Generate voice narration using gTTS if available"""
    print("  Generating voice narration...")
    
    try:
        from gtts import gTTS
        from pydub import AudioSegment
        import io
        
        segments = []
        
        for start_time, text in NARRATION_SCRIPT:
            if not text or start_time >= duration:
                continue
            
            print(f"    [{start_time}s] {text}")
            
            try:
                tts = gTTS(text=text, lang='en', slow=False)
                audio_bytes = io.BytesIO()
                tts.write_to_fp(audio_bytes)
                audio_bytes.seek(0)
                segment = AudioSegment.from_mp3(audio_bytes)
                segments.append((start_time, segment))
            except Exception as e:
                print(f"      Warning: {e}")
        
        # Create base silence
        silence = AudioSegment.silent(duration=int(duration * 1000))
        
        # Overlay narration segments
        for start_time, segment in segments:
            position = int(start_time * 1000)
            if position < len(silence):
                silence = silence.overlay(segment, position=position)
        
        # Convert to samples
        silence = silence.set_channels(1).set_sample_width(2).set_frame_rate(sample_rate)
        samples = []
        raw = silence.raw_data
        
        for i in range(0, len(raw), 2):
            if i + 1 < len(raw):
                value = struct.unpack('<h', raw[i:i+2])[0]
                samples.append(value / 32768.0)
        
        # Pad to full duration
        target_len = int(duration * sample_rate)
        samples = samples[:target_len] + [0.0] * max(0, target_len - len(samples))
        
        return samples
        
    except ImportError as e:
        print(f"    Voice generation unavailable: {e}")
        print("    Install with: pip install gtts pydub")
        return [0.0] * int(duration * sample_rate)
    except Exception as e:
        print(f"    Voice generation error: {e}")
        return [0.0] * int(duration * sample_rate)


def mix_audio(music: List[float], voice: List[float], 
              music_vol: float = 0.4, voice_vol: float = 0.8) -> List[float]:
    """Mix music and voice tracks with ducking"""
    print("  Mixing audio tracks...")
    
    max_len = max(len(music), len(voice))
    music = music + [0.0] * (max_len - len(music))
    voice = voice + [0.0] * (max_len - len(voice))
    
    mixed = []
    
    # Simple ducking: reduce music when voice is present
    for i in range(max_len):
        v = voice[i]
        m = music[i]
        
        # Detect voice activity (past 1000 samples)
        voice_active = False
        for j in range(max(0, i - 1000), i):
            if abs(voice[j]) > 0.05:
                voice_active = True
                break
        
        # Duck music during voice
        effective_music_vol = music_vol * 0.3 if voice_active else music_vol
        
        sample = m * effective_music_vol + v * voice_vol
        sample = max(-1.0, min(1.0, sample))
        mixed.append(sample)
    
    return mixed


def samples_to_wav(samples: List[float], filepath: str, 
                   sample_rate: int = 44100):
    """Save samples to WAV file"""
    with wave.open(filepath, 'w') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        
        for sample in samples:
            value = int(max(-32768, min(32767, sample * 32767)))
            wav.writeframes(struct.pack('<h', value))


# ============================================================
# MAIN RENDERER
# ============================================================

def get_scene_for_time(t: float) -> Tuple[str, float]:
    """Get current scene name and scene-local time"""
    scenes = [
        (0, 6, 'intro'),
        (6, 12, 'board_reveal'),
        (12, 32, 'gameplay_default'),
        (32, 37, 'theme_transition'),
        (37, 42, 'theme_space'),
        (42, 47, 'theme_undersea'),
        (47, 52, 'theme_roman'),
        (52, 68, 'features'),
        (68, 80, 'butterflyfx'),
        (80, 90, 'outro'),
    ]
    
    for start, end, name in scenes:
        if start <= t < end:
            return name, t - start
    
    return 'outro', t - 80


def render_frame(fb: FrameBuffer, t: float):
    """Render a single frame at time t"""
    scene_name, scene_t = get_scene_for_time(t)
    
    if scene_name == 'intro':
        scene_intro(fb, t, scene_t)
    elif scene_name == 'board_reveal':
        scene_board_reveal(fb, t, scene_t)
    elif scene_name == 'gameplay_default':
        scene_gameplay(fb, t, scene_t, 'DEFAULT')
    elif scene_name == 'theme_transition':
        scene_gameplay(fb, t, scene_t, 'DEFAULT')
    elif scene_name == 'theme_space':
        scene_themes(fb, t, scene_t, 'SPACE_ACE')
    elif scene_name == 'theme_undersea':
        scene_themes(fb, t, scene_t, 'UNDERSEA')
    elif scene_name == 'theme_roman':
        scene_themes(fb, t, scene_t, 'ROMAN')
    elif scene_name == 'features':
        scene_features(fb, t, scene_t)
    elif scene_name == 'butterflyfx':
        scene_butterflyfx(fb, t, scene_t)
    else:
        scene_outro(fb, t, scene_t)


def render_video():
    """Main video rendering function"""
    print("=" * 70)
    print("FASTTRACK PROMOTIONAL VIDEO GENERATOR")
    print("=" * 70)
    print(f"Resolution: {WIDTH}x{HEIGHT} @ {FPS}fps")
    print(f"Duration: {DURATION} seconds")
    print()
    
    # Create temp directory
    temp_dir = tempfile.mkdtemp(prefix="fasttrack_promo_")
    frames_dir = os.path.join(temp_dir, "frames")
    os.makedirs(frames_dir)
    print(f"Working directory: {temp_dir}")
    
    # Step 1: Render frames
    print("\n[STEP 1/3] Rendering video frames...")
    fb = FrameBuffer(WIDTH, HEIGHT)
    total_frames = FPS * DURATION
    
    for frame_num in range(total_frames):
        t = frame_num / FPS
        
        # Clear and render
        fb.clear()
        render_frame(fb, t)
        
        # Save frame
        frame_path = os.path.join(frames_dir, f"frame_{frame_num:05d}.raw")
        with open(frame_path, 'wb') as f:
            f.write(fb.to_bytes())
        
        # Progress
        if frame_num % (FPS * 10) == 0 or frame_num == total_frames - 1:
            pct = (frame_num + 1) / total_frames * 100
            scene_name, _ = get_scene_for_time(t)
            print(f"  [{pct:5.1f}%] Frame {frame_num+1}/{total_frames} - {scene_name}")
    
    print(f"  Rendered {total_frames} frames")
    
    # Step 2: Generate audio
    print("\n[STEP 2/3] Generating audio...")
    music = generate_ambient_track(DURATION)
    voice = generate_voice_narration(DURATION)
    mixed = mix_audio(music, voice)
    
    audio_path = os.path.join(temp_dir, "audio.wav")
    samples_to_wav(mixed, audio_path)
    print(f"  Audio saved: {audio_path}")
    
    # Step 3: Encode video
    print("\n[STEP 3/3] Encoding video with FFmpeg...")
    output_dir = Path(__file__).parent
    output_path = output_dir / "fasttrack_promo.mp4"
    
    ffmpeg_cmd = [
        "ffmpeg", "-y",
        "-f", "rawvideo",
        "-pixel_format", "rgb24",
        "-video_size", f"{WIDTH}x{HEIGHT}",
        "-framerate", str(FPS),
        "-i", os.path.join(frames_dir, "frame_%05d.raw"),
        "-i", audio_path,
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "20",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",
        str(output_path)
    ]
    
    print(f"  Running FFmpeg...")
    result = subprocess.run(ffmpeg_cmd, capture_output=True, text=True)
    
    if result.returncode == 0:
        size_mb = output_path.stat().st_size / (1024 * 1024)
        print(f"\n{'=' * 70}")
        print("VIDEO GENERATION COMPLETE!")
        print(f"{'=' * 70}")
        print(f"Output: {output_path}")
        print(f"Size: {size_mb:.1f} MB")
        print(f"Duration: {DURATION}s")
        print(f"Resolution: {WIDTH}x{HEIGHT} @ {FPS}fps")
    else:
        print(f"  FFmpeg error!")
        print(result.stderr[-1000:] if result.stderr else "No error output")
    
    # Cleanup
    print("\nCleaning up temporary files...")
    import shutil
    shutil.rmtree(temp_dir)
    
    print("Done!")
    return str(output_path)


if __name__ == "__main__":
    render_video()
