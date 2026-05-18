#!/bin/bash

# ═══════════════════════════════════════════════════════════════════════════
# Fast Track - Build Script
# 
# ButterflyFX Substrate Model:
#   Level 0 (VOID):   Source files — pure potential
#   Level 1 (POINT):  Package.json identity
#   Level 2 (LINE):   Dependencies linked
#   Level 3 (WIDTH):  Assets bundled
#   Level 4 (PLANE):  Executable built — INVOKE LEVEL
#   Level 5 (VOLUME): Multi-platform packages
#   Level 6 (WHOLE):  Distribution complete — meaning realized
# ═══════════════════════════════════════════════════════════════════════════

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
NATIVE_DIR="$PROJECT_ROOT/native"
OUTPUT_DIR="$PROJECT_ROOT/dist"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}            Fast Track - Build System                           ${NC}"
echo -e "${BLUE}           ButterflyFX Framework Demonstration                  ${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"

# Function to print steps (Fibonacci level indicators)
print_level() {
    local level=$1
    local msg=$2
    local levels=("VOID" "POINT" "LINE" "WIDTH" "PLANE" "VOLUME" "WHOLE")
    echo -e "${YELLOW}[Level $level - ${levels[$level]}]${NC} $msg"
}

# Parse arguments
BUILD_TYPE="${1:-all}"
PLATFORM="${2:-current}"

usage() {
    echo "Usage: $0 [type] [platform]"
    echo ""
    echo "Types:"
    echo "  web      - Build browser version only"
    echo "  native   - Build native Electron app only"
    echo "  steam    - Build Steam version with Greenworks"
    echo "  all      - Build everything (default)"
    echo ""
    echo "Platforms:"
    echo "  current  - Build for current platform (default)"
    echo "  win      - Windows"
    echo "  mac      - macOS"
    echo "  linux    - Linux"
    echo "  all      - All platforms"
    exit 1
}

# Level 0 → Level 1: Establish identity
print_level 0 "Starting build process..."
print_level 1 "Checking project structure..."

if [ ! -f "$NATIVE_DIR/package.json" ]; then
    echo -e "${RED}Error: package.json not found in $NATIVE_DIR${NC}"
    exit 1
fi

# Level 2: Link dependencies
print_level 2 "Installing dependencies..."
cd "$NATIVE_DIR"

if [ ! -d "node_modules" ]; then
    npm install
fi

# Level 3: Bundle assets
print_level 3 "Bundling game assets..."

# Create output directories
mkdir -p "$OUTPUT_DIR"
mkdir -p "$NATIVE_DIR/game"

# Copy web game files to native/game for packaging
echo "Copying game files..."
cp "$PROJECT_ROOT"/*.html "$NATIVE_DIR/game/" 2>/dev/null || true
cp -r "$PROJECT_ROOT/js" "$NATIVE_DIR/game/" 2>/dev/null || true
cp -r "$PROJECT_ROOT/css" "$NATIVE_DIR/game/" 2>/dev/null || true
cp -r "$PROJECT_ROOT/assets" "$NATIVE_DIR/game/" 2>/dev/null || true
cp -r "$PROJECT_ROOT/sounds" "$NATIVE_DIR/game/" 2>/dev/null || true

# Create index.html that loads the main game
cat > "$NATIVE_DIR/game/index.html" << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Fast Track</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { margin: 0; overflow: hidden; background: #1a1a2e; }
        .loading {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: white;
            font-family: system-ui;
            text-align: center;
        }
        .loading-spinner {
            width: 60px;
            height: 60px;
            border: 4px solid rgba(255,255,255,0.1);
            border-top-color: #4a90d9;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 20px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
    </style>
</head>
<body>
    <div class="loading">
        <div class="loading-spinner"></div>
        <div>Loading Fast Track...</div>
    </div>
    <script>
        // Redirect to main game file
        window.location.href = 'fasttrack_final.html';
    </script>
</body>
</html>
EOF

# Level 4: Build executables
print_level 4 "Building executable packages..."

build_web() {
    echo -e "${GREEN}Building web version...${NC}"
    mkdir -p "$OUTPUT_DIR/web"
    
    # Copy all web files
    cp -r "$PROJECT_ROOT"/*.html "$OUTPUT_DIR/web/" 2>/dev/null || true
    cp -r "$PROJECT_ROOT/js" "$OUTPUT_DIR/web/" 2>/dev/null || true
    cp -r "$PROJECT_ROOT/css" "$OUTPUT_DIR/web/" 2>/dev/null || true
    cp -r "$PROJECT_ROOT/assets" "$OUTPUT_DIR/web/" 2>/dev/null || true
    cp -r "$PROJECT_ROOT/sounds" "$OUTPUT_DIR/web/" 2>/dev/null || true
    
    # Create manifest for PWA
    cat > "$OUTPUT_DIR/web/manifest.json" << 'MANIFEST'
{
    "name": "Fast Track",
    "short_name": "Fast Track",
    "description": "Strategic hexagonal board game - ButterflyFX demonstration",
    "start_url": "/fasttrack_final.html",
    "display": "fullscreen",
    "background_color": "#1a1a2e",
    "theme_color": "#4a90d9",
    "icons": [
        {
            "src": "assets/icon-192.png",
            "sizes": "192x192",
            "type": "image/png"
        },
        {
            "src": "assets/icon-512.png",
            "sizes": "512x512",
            "type": "image/png"
        }
    ]
}
MANIFEST
    
    echo -e "${GREEN}Web build complete: $OUTPUT_DIR/web/${NC}"
}

build_native() {
    echo -e "${GREEN}Building native Electron app...${NC}"
    cd "$NATIVE_DIR"
    
    case "$PLATFORM" in
        win)
            npx electron-builder --win
            ;;
        mac)
            npx electron-builder --mac
            ;;
        linux)
            npx electron-builder --linux
            ;;
        all)
            npx electron-builder --win --mac --linux
            ;;
        current|*)
            npx electron-builder
            ;;
    esac
    
    # Copy outputs to main dist folder
    cp -r "$NATIVE_DIR/dist/"* "$OUTPUT_DIR/" 2>/dev/null || true
    
    echo -e "${GREEN}Native build complete!${NC}"
}

build_steam() {
    echo -e "${GREEN}Building Steam version...${NC}"
    cd "$NATIVE_DIR"
    
    # Use Steam-specific config
    if [ -f "electron-builder-steam.yml" ]; then
        npx electron-builder --config electron-builder-steam.yml
    else
        echo -e "${YELLOW}Warning: Steam config not found, using standard build${NC}"
        build_native
    fi
    
    echo -e "${GREEN}Steam build complete!${NC}"
}

# Execute builds based on type
case "$BUILD_TYPE" in
    web)
        build_web
        ;;
    native)
        build_native
        ;;
    steam)
        build_steam
        ;;
    all)
        build_web
        build_native
        ;;
    help|-h|--help)
        usage
        ;;
    *)
        echo -e "${RED}Unknown build type: $BUILD_TYPE${NC}"
        usage
        ;;
esac

# Level 5: Multi-platform verification
print_level 5 "Verifying build outputs..."
echo ""
echo "Build outputs in: $OUTPUT_DIR"
ls -la "$OUTPUT_DIR"

# Level 6: Complete
print_level 6 "Build complete - Ready for distribution!"

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}                    BUILD SUCCESSFUL                            ${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "Next steps:"
echo "  1. Test the build locally"
echo "  2. Upload to Steam (if Steam build)"
echo "  3. Deploy web version to butterflyfx.us/games/fasttrack"
echo ""
