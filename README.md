# ScyllaDB + Alternator on Coolify

Single-node [ScyllaDB](https://www.scylladb.com/) with [Alternator](https://opensource.docs.scylladb.com/stable/features/alternator.html) — a DynamoDB-compatible HTTP API — deployed via Docker Compose on [Coolify](https://coolify.io/).

Alternator is exposed over **HTTPS** through Coolify's built-in Traefik reverse proxy. The Cassandra/CQL port (`9042`) is available only inside the Docker network and is **not** published publicly.

## What this deploys

| Component | Details |
|-----------|---------|
| Image | `scylladb/scylla:latest` |
| Alternator | DynamoDB-compatible API on port `8000` |
| CQL | Port `9042` (internal only) |
| TLS | Let's Encrypt via Coolify Traefik |
| Data | Named volume `scylla-data` |
| Resources | 1 CPU, 2 GB RAM, overprovisioned mode |

## Quick start

1. Copy the example environment file:

   ```bash
   cp .env.example .env
   ```

2. Set `SCYLLA_HOST` to your public hostname (e.g. `dynamodb.example.com`).

3. Optionally configure Alternator auth in `.env` (see [Authentication](#authentication) below).

4. Deploy in Coolify as a **Docker Compose** resource, or run locally:

   ```bash
   docker compose up -d
   ```

## Coolify domain setup

1. **Create a Docker Compose resource** in Coolify and point it at this repository (or paste `docker-compose.yml`).

2. **Set environment variables** in the Coolify UI (or via `.env`):
   - `SCYLLA_HOST` — must match the hostname clients use (e.g. `dynamodb.example.com`).
   - `ALTERNATOR_AUTH_ENABLED` — `false` by default; set `true` to enforce auth.
   - `ALTERNATOR_AUTH_WARN` — `false` by default; set `true` to log would-be auth failures.

3. **DNS** — create an **A** (or **AAAA**) record for `SCYLLA_HOST` pointing to your Coolify server's public IP.

4. **Traefik** — Coolify's proxy reads the labels in `docker-compose.yml`:
   - Router: `scylla-alternator`
   - Entrypoint: `https`
   - Certificate resolver: `letsencrypt`
   - Backend port: `8000`

5. After DNS propagates and the stack is healthy, Alternator is reachable at:

   ```
   https://<SCYLLA_HOST>/
   ```

## Connect with AWS SDK v3 (Node.js)

Alternator accepts any credentials when authorization is disabled (the default in this compose file). Install the client:

```bash
npm i @aws-sdk/client-dynamodb
```

Example:

```javascript
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

export const dynamodb = new DynamoDBClient({
  region: "eu-west-1",
  endpoint: "https://dynamodb.example.com",
  credentials: {
    accessKeyId: "dummy",
    secretAccessKey: "dummy",
  },
});
```

Replace `https://dynamodb.example.com` with `https://<SCYLLA_HOST>`.

Other AWS SDKs (Python `boto3`, Go, Java, etc.) work the same way: set a custom `endpoint` and use dummy credentials unless you enable Alternator authorization.

## Authentication

Controlled via environment variables (both default to `false`):

| Variable | Default | Effect |
|----------|---------|--------|
| `ALTERNATOR_AUTH_ENABLED` | `false` | When `true`, unsigned or invalid requests are rejected |
| `ALTERNATOR_AUTH_WARN` | `false` | When `true`, logs and metrics count auth failures without blocking |

**Rollout:**

1. **Disabled (default)** — any credentials work; suitable for initial setup.
2. **Warn** — set `ALTERNATOR_AUTH_WARN=true`, keep `ALTERNATOR_AUTH_ENABLED=false`. Watch logs for `alternator_enforce_authorization=true` and metrics `scylla_alternator_authentication_failures` / `scylla_alternator_authorization_failures`.
3. **Enforced** — create CQL roles and `GRANT` permissions, then set `ALTERNATOR_AUTH_ENABLED=true`. Clients must use a CQL role name as `accessKeyId` and its `salted_hash` from `system_auth.roles` as `secretAccessKey`.

Redeploy after changing either variable (Scylla reads these at container start).

## Security notes

- **Authorization is off by default** (`ALTERNATOR_AUTH_ENABLED=false`). Anyone who can reach the HTTPS endpoint can read and write data until you enable auth and configure CQL roles.

- **CQL port 9042 is not exposed via Traefik** and has no host `ports:` mapping. It is only reachable from other containers on the same Docker network.

- **Dummy credentials** are required by AWS SDK clients even when auth is disabled; any non-empty values work.

- **TLS terminates at Traefik** on Coolify. Traffic between Traefik and the Scylla container is on the internal Docker network (HTTP to port 8000).

- **Do not commit `.env`** with production hostnames or secrets. Use `.env.example` as a template.

## Production caveats

- **Single node** — no high availability or replication. A node failure or volume loss can cause downtime or data loss. For production, run a multi-node Scylla cluster and adjust Alternator configuration accordingly.

- **Resource limits** — `--smp 1` and `--memory 2G` suit a small VPS. Increase both for heavier workloads and monitor CPU, memory, and disk.

- **Image tag** — `latest` can change between deploys. Pin a specific version (e.g. `scylladb/scylla:6.2`) for reproducible production deployments.

- **Backups** — back up the `scylla-data` Docker volume regularly. Alternator does not replace a backup strategy.

- **Write isolation** — `--alternator-write-isolation always` trades some performance for stronger consistency semantics. Review [ScyllaDB Alternator docs](https://opensource.docs.scylladb.com/stable/features/alternator.html) if you need different isolation levels.

- **Monitoring** — consider ScyllaDB monitoring (e.g. Prometheus/Grafana) and disk alerts; not included in this minimal compose file.

## Files

| File | Purpose |
|------|---------|
| `docker-compose.yml` | ScyllaDB service, Traefik labels, data volume |
| `.env.example` | Template for `SCYLLA_HOST` and auth settings |
| `README.md` | This document |

## License

Use and adapt freely for your own deployments.
