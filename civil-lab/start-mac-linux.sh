#!/bin/sh
# Opens Civil Site Lab at http://localhost:8765. Then click "Install" in the app
# (or the install icon in Chrome/Edge's address bar). Press Ctrl+C to stop.
cd "$(dirname "$0")" || exit 1
URL="http://localhost:8765/"
( sleep 1; (command -v open >/dev/null && open "$URL") || (command -v xdg-open >/dev/null && xdg-open "$URL") ) &
exec python3 -m http.server 8765 --bind 127.0.0.1
