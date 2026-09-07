# CloakBrowser Docker Migration

## Goal

Run the TorrentBD proxy and CloakBrowser in one Docker container, persist the
browser profile across container replacement, and retire the existing user
systemd service only after the container passes live checks.

## Container

Build the application image from `cloakhq/cloakbrowser:0.5.10`. Install Bun in
that image, install the repository dependencies with the lockfile, and run the
existing Bun entry point. Pinning the base image to the installed wrapper
version keeps the browser binary and JavaScript API aligned.

Docker Compose owns startup with `restart: unless-stopped`, loads secrets from
the existing `.env`, publishes the proxy on port 5000, and mounts a named volume
at `/data/cloak-profile`. The browser's CDP port is not published.

## Persistent Session

Use CloakBrowser's `launchPersistentContext()` with `/data/cloak-profile`.
When the profile already contains a valid TorrentBD session, read its cookies
and user agent without submitting credentials again. If the stored session is
missing or expired, complete the existing credential and TOTP login flow in the
same persistent context. Closing the context flushes profile state to the
mounted volume.

The application's in-memory session remains the fast path while the process is
running. Existing expiry detection invalidates it and triggers a fresh browser
check or login on the next request.

## Validation And Cutover

Build the image and start it on a temporary host port so the current systemd
service can remain available. Verify:

1. The health endpoint succeeds.
2. An authenticated Torznab search returns results.
3. A torrent download returns a valid response.
4. Recreating the container retains the named volume and reuses the stored
   browser session.

Only after all checks pass, stop and disable the user unit
`torrentbd-proxy.service`, remove its unit file, reload user systemd, and start
the Compose service on host port 5000. If validation fails, leave systemd
unchanged and report the failure.

## Files And Tests

Change `Dockerfile`, `docker-compose.yml`, `src/session.ts`, and `README.md`.
Add one focused session persistence test or runnable check using the smallest
existing test pattern. Run the unit suite, type checking, Docker build, health
check, live authenticated request checks, and restart-persistence check.

