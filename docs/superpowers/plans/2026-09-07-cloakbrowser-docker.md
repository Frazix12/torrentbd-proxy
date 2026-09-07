# CloakBrowser Docker Migration Plan

**Spec:** `docs/superpowers/specs/2026-09-07-cloakbrowser-docker-design.md`

## 1. Add observable runtime status

- Add `src/status.ts` with session state, last login/error, uptime, and a bounded
  event buffer.
- Add `src/test/status.test.ts` first, covering state updates and log eviction.
- Route the existing request and session messages through the status recorder.

## 2. Add the read-only LAN dashboard

- Add a small static dashboard renderer with no frontend dependency.
- Add `/` for HTML and `/status` for JSON in `src/index.ts`.
- Test the renderer and status payload without starting external services.

## 3. Persist the CloakBrowser profile

- Add `CLOAK_PROFILE_DIR`, defaulting to `/data/cloak-profile`.
- Replace `launch()` with `launchPersistentContext()`.
- Reuse stored session cookies on startup; after expiry, clear invalid cookies
  and force the existing credential/TOTP flow once.
- Keep the persistent-context lifecycle in one function and always close it.
- Add the smallest testable checks around stored-session selection.

## 4. Build from the official browser image

- Use a pinned Bun stage and `cloakhq/cloakbrowser:0.5.10` runtime stage.
- Install locked dependencies under `/opt/torrentbd`; retain the base entrypoint.
- Add the profile volume, Chromium shared memory, health check, and restart policy
  to `docker-compose.yml`.
- Update `README.md` for Docker-only startup, persistence, dashboard access, and
  logs.

## 5. Verify and cut over

- Run `bun test`, `bunx tsc --noEmit`, and `docker compose config`.
- Build the image and run it temporarily on host port 5001.
- Check `/health`, `/`, `/status`, an authenticated search, a torrent download,
  and container recreation with the same profile volume.
- If any live check fails, leave systemd untouched.
- If all pass, stop/disable `torrentbd-proxy.service`, remove its user unit,
  reload user systemd, and start Compose on port 5000.
- Confirm the final container is healthy and the systemd unit is absent.

