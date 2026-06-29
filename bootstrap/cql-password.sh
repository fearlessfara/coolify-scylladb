#!/usr/bin/env bash
# Bootstrap cassandra CQL password into admin-secrets volume.
# - Fresh cluster: generate password via maintenance socket, create superuser.
# - Existing cluster: require SCYLLA_CQL_PASSWORD once, then persist to volume.
set -euo pipefail

SECRET_FILE=/secrets/cql-password
CQL_SOCKET=/var/lib/scylla/cql.m

if [ -s "$SECRET_FILE" ]; then
  echo "CQL password already present in ${SECRET_FILE}, skipping bootstrap."
  exit 0
fi

mkdir -p /secrets
chmod 700 /secrets

if [ -n "${SCYLLA_CQL_PASSWORD:-}" ]; then
  echo "Persisting SCYLLA_CQL_PASSWORD from environment."
  printf '%s' "$SCYLLA_CQL_PASSWORD" > "$SECRET_FILE"
  chmod 600 "$SECRET_FILE"
  exit 0
fi

if [ ! -S "$CQL_SOCKET" ] && [ ! -e "$CQL_SOCKET" ]; then
  echo "ERROR: Scylla maintenance socket not found at ${CQL_SOCKET}." >&2
  exit 1
fi

if cqlsh "$CQL_SOCKET" -e "SELECT role FROM system.roles WHERE role='cassandra';" 2>/dev/null | grep -q cassandra; then
  echo "ERROR: cassandra role already exists but no password is configured." >&2
  echo "Set SCYLLA_CQL_PASSWORD once in your environment — it will be saved to the admin-secrets volume." >&2
  exit 1
fi

PASS="$(openssl rand -base64 24 | tr -d '\n')"
ESCAPED_PASS="${PASS//\'/\'\'}"

cqlsh "$CQL_SOCKET" -e \
  "CREATE ROLE cassandra WITH PASSWORD = '${ESCAPED_PASS}' AND SUPERUSER = true AND LOGIN = true;"

printf '%s' "$PASS" > "$SECRET_FILE"
chmod 600 "$SECRET_FILE"
echo "Created cassandra superuser and saved password to ${SECRET_FILE}."
