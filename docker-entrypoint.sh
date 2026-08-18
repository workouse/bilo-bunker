#!/bin/sh
set -e

# If running as root in container (default), ensure /data directory exists and has correct ownership for bunker user
if [ "$(id -u)" = '0' ]; then
    mkdir -p /data
    chown -R bunker:bunker /data 2>/dev/null || true
    chmod 700 /data 2>/dev/null || true
    exec su-exec bunker "$@"
fi

exec "$@"
