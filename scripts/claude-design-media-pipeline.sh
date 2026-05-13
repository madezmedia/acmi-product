#!/bin/bash
# Claude Design Media Pipeline (MKT-W1)
# Automates the landing of Claude Design handoff bundles into the monetization surface.
# Rule 9: All automated actions attributed.
# Co-Authored-By: Gemini CLI <gemini-cli@madezmedia.local>

set -e

# Usage: ./claude-design-media-pipeline.sh <bundle_name> <target_slug>
BUNDLE_NAME=$1
TARGET_SLUG=$2

if [ -z "$BUNDLE_NAME" ] || [ -z "$TARGET_SLUG" ]; then
    echo "Usage: $0 <bundle_name> <target_slug>"
    echo "Example: $0 acmi-design-sizzle-v1 sizzle"
    exit 1
fi

PROJECT_ROOT="/Users/michaelshaw/clawd"
BUNDLE_DIR="/private/tmp/acmi-design/$BUNDLE_NAME/project"
TARGET_DIR="$PROJECT_ROOT/acmi-product/public/monetization/$TARGET_SLUG"

echo "🏗️ Starting Claude Design Media Pipeline for '$TARGET_SLUG'..."

# 1. Verify Source
if [ ! -d "$BUNDLE_DIR" ]; then
    echo "❌ Error: Bundle directory '$BUNDLE_DIR' not found."
    exit 1
fi

# 2. Prepare Target
mkdir -p "$TARGET_DIR"

# 3. Copy Assets and Map Relative Imports
echo "📂 Landing assets to $TARGET_DIR..."
cp -r "$BUNDLE_DIR/"* "$TARGET_DIR/"

# 4. Rename entry HTML to index.html if needed
# (Find the only .html file in the bundle root)
HTML_FILE=$(ls "$TARGET_DIR"/*.html | head -n 1)
if [ -f "$HTML_FILE" ] && [ "$(basename "$HTML_FILE")" != "index.html" ]; then
    mv "$HTML_FILE" "$TARGET_DIR/index.html"
    echo "📝 Renamed $(basename "$HTML_FILE") to index.html"
fi

# 5. Integration: Update /monetization/index.html (Manual Hint)
echo "🔗 Next Steps (Manual):"
echo "  - Add #$TARGET_SLUG nav anchor to acmi-product/public/monetization/index.html"
echo "  - Add hero embed iframe if this is a reel"
echo "  - Add footer media-kit link"

# 6. Git Protocol (Rule 9)
echo "💾 Preparing Git Commit..."
# git -C "$PROJECT_ROOT/acmi-product" add "$TARGET_DIR"
# git -C "$PROJECT_ROOT/acmi-product" commit -m "feat(monetization): land $TARGET_SLUG media bundle

# Co-Authored-By: Gemini CLI <gemini-cli@madezmedia.local>"

echo "✅ Pipeline complete for $TARGET_SLUG."
