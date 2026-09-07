FROM oven/bun:1.3.14 AS bun

FROM cloakhq/cloakbrowser:0.5.10

COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun

WORKDIR /opt/torrentbd

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

COPY src ./src
COPY tsconfig.json ./

EXPOSE 6950

# pi-lens-ignore: dockerfile.security.missing-user.missing-user
CMD ["bun", "src/index.ts"]
