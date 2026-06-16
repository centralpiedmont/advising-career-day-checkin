# Badge print station — Node server that serves the kiosk and prints badges.
# Build context is the REPO ROOT (see docker-compose.yml) so we can copy the
# kiosk's index.html / icon.png that server.js serves from one level up.
FROM balenalib/raspberrypi4-64-debian-node:18-bookworm-run

# chromium  -> headless PDF rendering of each badge (CHROME_PATH below)
# cups-client -> provides `lp`, which talks to the cups container (CUPS_SERVER)
RUN install_packages chromium cups-client ca-certificates fonts-liberation

WORKDIR /app

# Preserve the repo layout: server.js serves ../index.html and ../icon.png.
COPY index.html icon.png /app/
COPY badge-print-station /app/badge-print-station

WORKDIR /app/badge-print-station

# Containers run Chromium as root and have no /dev/shm worth speaking of.
ENV CHROME_PATH=/usr/bin/chromium \
    CHROME_FLAGS="--no-sandbox --disable-dev-shm-usage" \
    DATA_DIR=/data \
    PORT=8088

EXPOSE 8088
CMD ["node", "server.js"]
