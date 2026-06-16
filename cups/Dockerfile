# CUPS print server container. Runs privileged so it can see the USB label
# printer on the host. The kiosk-server container prints to it over the
# internal balena network via CUPS_SERVER=cups:631.
FROM balenalib/raspberrypi4-64-debian:bookworm-run

# ghostscript + foomatic-db ship a large catalogue of PPDs (including Zebra
# ZPL models), which is the driverless path for this printer family.
RUN install_packages \
      cups cups-client cups-filters \
      ghostscript printer-driver-foomatic-db \
      ca-certificates usbutils

COPY cupsd.conf /etc/cups/cupsd.conf
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 631
CMD ["/usr/local/bin/entrypoint.sh"]
