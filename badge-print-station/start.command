#!/bin/bash
# Double-click to launch the Badge Print Station.
cd "$(dirname "$0")" || exit 1

PORT=$(node -e 'try{process.stdout.write(String(JSON.parse(require("fs").readFileSync("config.json")).port||8088))}catch(e){process.stdout.write("8088")}')
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo localhost)
URL="http://$IP:$PORT"

echo "Starting Badge Print Station…"
node server.js &
SRV=$!
sleep 1

echo ""
echo "  Open this on the iPad (same Wi-Fi):"
echo "      $URL"
echo ""
if command -v qrencode >/dev/null 2>&1; then
  qrencode -t ANSIUTF8 "$URL"
else
  echo "  (Optional: 'brew install qrencode' to show a scannable QR code here.)"
fi
echo ""

if command -v cloudflared >/dev/null 2>&1; then
  echo "Starting Cloudflare tunnel (public HTTPS URL — use this if the iPad can't reach the LAN URL):"
  cloudflared tunnel --url "http://localhost:$PORT"
else
  echo "  (Optional: 'brew install cloudflared' to expose a public HTTPS URL when device-to-device Wi-Fi is blocked.)"
  echo ""
  echo "Press Ctrl-C to stop the station."
  wait $SRV
fi
