#!/bin/bash
# Start CUPS and, on first boot, create the label-printer queue from env vars.
#
# Required to auto-create the queue:
#   PRINTER_NAME   queue name the kiosk prints to (must match config.json "printer")
#   PRINTER_URI    device URI, e.g. usb://4BARCODE/4B-2054N?serial=XXXX
#                  (find it with: lpinfo -v   in the cups container)
# Driver — provide ONE of:
#   PRINTER_PPD    path to a .ppd file (mount it into the container), OR
#   PRINTER_MODEL  a CUPS model string, e.g. a Zebra ZPL foomatic model
#                  (list candidates with: lpinfo -m | grep -i zebra)
#
# Leave PRINTER_URI empty to skip auto-setup and add the printer by hand once
# via the web UI at http://<device-ip>:631 (Administration -> Add Printer).
set -e

mkdir -p /run/cups

# Background cupsd to configure, then re-exec it in the foreground.
/usr/sbin/cupsd
for i in $(seq 1 10); do lpstat -r >/dev/null 2>&1 && break; sleep 0.5; done

PRINTER_NAME="${PRINTER_NAME:-4BARCODE_4B_2054N}"

if [ -n "${PRINTER_URI}" ] && ! lpstat -p "${PRINTER_NAME}" >/dev/null 2>&1; then
  echo "Creating CUPS queue '${PRINTER_NAME}' -> ${PRINTER_URI}"
  if [ -n "${PRINTER_PPD}" ]; then
    lpadmin -p "${PRINTER_NAME}" -E -v "${PRINTER_URI}" -P "${PRINTER_PPD}"
  elif [ -n "${PRINTER_MODEL}" ]; then
    lpadmin -p "${PRINTER_NAME}" -E -v "${PRINTER_URI}" -m "${PRINTER_MODEL}"
  else
    echo "WARNING: no PRINTER_PPD or PRINTER_MODEL set; creating raw queue."
    lpadmin -p "${PRINTER_NAME}" -E -v "${PRINTER_URI}"
  fi
  cupsenable "${PRINTER_NAME}" || true
  cupsaccept "${PRINTER_NAME}" || true
fi

# Stop the background daemon and hand off to a foreground one (PID 1 behaviour).
kill %1 2>/dev/null || true
wait 2>/dev/null || true
exec /usr/sbin/cupsd -f
