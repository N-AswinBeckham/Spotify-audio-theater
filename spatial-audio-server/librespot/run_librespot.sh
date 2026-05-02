#!/bin/bash
set -e

# Base directory
BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FIFO_DIR="$BASE_DIR/fifo"
FIFO_PATH="$FIFO_DIR/snapfifo"

mkdir -p "$FIFO_DIR"

if [ ! -p "$FIFO_PATH" ]; then
    echo "Creating named pipe at $FIFO_PATH"
    mkfifo "$FIFO_PATH"
fi

# Spotify Credentials (Optional)
# If left empty, Discovery mode (Spotify Connect) will be used.
SPOTIFY_USER=""
SPOTIFY_PASS=""

echo "Starting librespot..."
# Using local binary if present
LIBRESPOT_BIN="./librespot"
if [ ! -x "$LIBRESPOT_BIN" ]; then
    if command -v librespot >/dev/null 2>&1; then
        LIBRESPOT_BIN="librespot"
    else
        echo "Error: librespot binary not found."
        echo "Please run ./install.sh first to download it,"
        echo "or install it manually and ensure it's in your PATH."
        exit 1
    fi
fi

ARGS="-n SpatialSource --backend pipe --device $FIFO_PATH --format S16"

if [ -n "$SPOTIFY_USER" ] && [ -n "$SPOTIFY_PASS" ]; then
    echo "Mode: Credential Login ($SPOTIFY_USER)"
    $LIBRESPOT_BIN $ARGS -u "$SPOTIFY_USER" -p "$SPOTIFY_PASS"
else
    echo "Mode: Discovery (Spotify Connect)"
    $LIBRESPOT_BIN $ARGS
fi
