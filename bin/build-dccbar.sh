#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

APP_NAME="DCCBar"
SWIFT_FILE="bin/DCCBar.swift"
OUTPUT_DIR="bin"
APP_BUNDLE="$OUTPUT_DIR/$APP_NAME.app"

echo "Building $APP_NAME..."

swiftc "$SWIFT_FILE" \
  -o "$OUTPUT_DIR/$APP_NAME" \
  -framework Cocoa \
  -framework Foundation \
  -O

echo "  ✅ Binary built: $OUTPUT_DIR/$APP_NAME"
echo ""
echo "To run:"
echo "  bin/$APP_NAME &"
echo ""
echo "To add to Login Items (auto-start on boot):"
echo "  System Settings → General → Login Items → + → select bin/$APP_NAME"
echo ""
echo "To stop:"
echo "  pkill $APP_NAME"
