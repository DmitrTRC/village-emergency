ARG PG_MAJOR=17
FROM postgres:${PG_MAJOR}-alpine

ARG SUPERCRONIC_VERSION=v0.2.33
RUN set -eux; \
    arch="$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/')"; \
    apk add --no-cache curl bash; \
    curl -fsSL "https://dl.min.io/client/mc/release/linux-${arch}/mc" -o /usr/local/bin/mc; \
    curl -fsSL "https://github.com/aptible/supercronic/releases/download/${SUPERCRONIC_VERSION}/supercronic-linux-${arch}" -o /usr/local/bin/supercronic; \
    chmod +x /usr/local/bin/mc /usr/local/bin/supercronic

COPY backup.sh /usr/local/bin/backup.sh
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/entrypoint.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
