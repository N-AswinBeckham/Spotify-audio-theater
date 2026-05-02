#!/bin/bash
set -e

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_FILE="$BASE_DIR/snapserver/snapserver.conf"

echo "Starting snapserver with local config..."
snapserver -c "$CONFIG_FILE"
