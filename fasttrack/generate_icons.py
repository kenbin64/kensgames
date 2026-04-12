#!/usr/bin/env python3
"""
Generate PWA icons for Fast Track game
Creates square PNG icons in various sizes required for PWA manifests
"""

import os
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("Installing Pillow...")
    os.system("pip3 install Pillow")
    from PIL import Image, ImageDraw, ImageFont

# Icon sizes needed for PWA
ICON_SIZES = [72, 96, 128, 144, 152, 192, 384, 512]

# Output directory
OUTPUT_DIR = Path(__file__).parent / "images"
OUTPUT_DIR.mkdir(exist_ok=True)

# Colors
BG_COLOR = (26, 26, 46)  # #1a1a2e
RING_COLOR = (74, 74, 110)  # #4a4a6e
CENTER_COLOR = (0, 170, 102)  # #00aa66
TEXT_COLOR = (255, 255, 255)


def create_icon(size: int) -> Image.Image:
    """Create a Fast Track app icon at the specified size"""
    
    # Create image with background
    img = Image.new('RGBA', (size, size), BG_COLOR + (255,))
    draw = ImageDraw.Draw(img)
    
    center = size // 2
    
    # Draw outer ring (board edge)
    ring_radius = int(size * 0.42)
    ring_width = max(3, size // 30)
    draw.ellipse(
        [center - ring_radius, center - ring_radius,
         center + ring_radius, center + ring_radius],
        outline=RING_COLOR,
        width=ring_width
    )
    
    # Draw inner ring (fast track)
    inner_radius = int(size * 0.25)
    draw.ellipse(
        [center - inner_radius, center - inner_radius,
         center + inner_radius, center + inner_radius],
        outline=RING_COLOR,
        width=ring_width
    )
    
    # Draw center dot (bullseye)
    bullseye_radius = int(size * 0.08)
    draw.ellipse(
        [center - bullseye_radius, center - bullseye_radius,
         center + bullseye_radius, center + bullseye_radius],
        fill=CENTER_COLOR
    )
    
    # Draw 6 peg markers around the ring
    import math
    peg_radius = max(3, size // 25)
    peg_distance = int(size * 0.33)
    
    peg_colors = [
        (255, 0, 0),      # Red
        (0, 255, 74),     # Teal
        (148, 0, 255),    # Violet
        (255, 223, 0),    # Gold
        (0, 212, 255),    # Azure
        (255, 0, 138)     # Pink
    ]
    
    for i, color in enumerate(peg_colors):
        angle = math.pi / 2 - (i * math.pi / 3)  # Start from top, go clockwise
        px = center + int(peg_distance * math.cos(angle))
        py = center - int(peg_distance * math.sin(angle))
        
        draw.ellipse(
            [px - peg_radius, py - peg_radius,
             px + peg_radius, py + peg_radius],
            fill=color
        )
    
    # Add "FT" text for larger icons
    if size >= 128:
        try:
            font_size = size // 6
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size)
            text = "FT"
            bbox = draw.textbbox((0, 0), text, font=font)
            text_width = bbox[2] - bbox[0]
            text_height = bbox[3] - bbox[1]
            
            # Position below center
            text_x = center - text_width // 2
            text_y = center + int(size * 0.12)
            
            # Draw text with shadow
            draw.text((text_x + 1, text_y + 1), text, font=font, fill=(0, 0, 0, 180))
            draw.text((text_x, text_y), text, font=font, fill=TEXT_COLOR)
        except Exception as e:
            print(f"Could not add text to {size}px icon: {e}")
    
    return img


def create_maskable_icon(size: int) -> Image.Image:
    """Create a maskable icon with safe zone padding"""
    
    # Maskable icons need 10% padding for safe zone
    padding = int(size * 0.1)
    inner_size = size - (padding * 2)
    
    # Create background
    img = Image.new('RGBA', (size, size), BG_COLOR + (255,))
    
    # Create inner icon
    inner_icon = create_icon(inner_size)
    
    # Paste centered
    img.paste(inner_icon, (padding, padding), inner_icon)
    
    return img


def main():
    print("Generating Fast Track PWA icons...")
    
    for size in ICON_SIZES:
        # Regular icon
        icon = create_icon(size)
        icon_path = OUTPUT_DIR / f"icon-{size}.png"
        icon.save(icon_path, 'PNG')
        print(f"  Created: icon-{size}.png")
    
    # Also create a 1024px icon for app stores
    large_icon = create_icon(1024)
    large_icon.save(OUTPUT_DIR / "icon-1024.png", 'PNG')
    print("  Created: icon-1024.png")
    
    # Create splash screen placeholder (portrait)
    splash_sizes = [
        (828, 1792),   # iPhone XR
        (1125, 2436),  # iPhone X/XS
        (1242, 2688),  # iPhone XS Max
    ]
    
    for width, height in splash_sizes:
        splash = Image.new('RGBA', (width, height), BG_COLOR + (255,))
        draw = ImageDraw.Draw(splash)
        
        # Center a large icon
        icon_size = min(width, height) // 3
        icon = create_icon(icon_size)
        
        x = (width - icon_size) // 2
        y = (height - icon_size) // 3
        
        splash.paste(icon, (x, y), icon)
        
        # Add title
        try:
            font_size = min(width, height) // 15
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size)
            title = "Fast Track"
            bbox = draw.textbbox((0, 0), title, font=font)
            text_width = bbox[2] - bbox[0]
            
            draw.text(
                ((width - text_width) // 2, y + icon_size + 40),
                title,
                font=font,
                fill=TEXT_COLOR
            )
        except:
            pass
        
        splash_path = OUTPUT_DIR / f"splash-{width}x{height}.png"
        splash.save(splash_path, 'PNG')
        print(f"  Created: splash-{width}x{height}.png")
    
    # Create screenshot placeholder
    screenshot = Image.new('RGBA', (1080, 1920), BG_COLOR + (255,))
    screenshot.save(OUTPUT_DIR / "screenshot-game.png", 'PNG')
    print("  Created: screenshot-game.png")
    
    print("\nDone! Icons saved to:", OUTPUT_DIR)


if __name__ == "__main__":
    main()
