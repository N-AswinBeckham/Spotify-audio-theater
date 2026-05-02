#!/bin/bash
set -e

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_FILE="$BASE_DIR/snapserver/snapserver.conf"
FIFO_PATH="$BASE_DIR/fifo/snapfifo"

echo "Starting snapserver with local config and absolute FIFO path..."
snapserver -c "$CONFIG_FILE" --stream.source "pipe://$FIFO_PATH?name=spatial&sampleformat=44100:16:2&codec=flac"
