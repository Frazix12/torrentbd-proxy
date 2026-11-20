FROM oven/bun:1.4.5 AS bun

FROM cloakhq/cloakbrowser:0.5.12

COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun

WORKDIR /opt/torrentbd

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

COPY src ./src
COPY tsconfig.json ./

EXPOSE 6950

# The CloakBrowser base image runs Xvfb and Chromium as root; switching users
# here breaks the display/profile permissions. Hardening is applied in
# docker-compose.yml instead (no-new-privileges, capped PIDs, log rotation).
CMD ["bun", "src/index.ts"]
