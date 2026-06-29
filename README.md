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

The compose file includes a Docker health check (`GET http://127.0.0.1:8000/`) so Coolify and Traefik wait until Alternator is ready. Alternator is started with `--alternator-address 0.0.0.0` so it listens on localhost inside the container (required for the health check).

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
3. **Enforced** — create CQL roles and `GRANT` permissions (see [Managing Alternator users](#managing-alternator-users)), then set `ALTERNATOR_AUTH_ENABLED=true`. Clients must use a CQL role name as `accessKeyId` and its `salted_hash` from `system.roles` as `secretAccessKey`.

Redeploy after changing either variable (Scylla reads these at container start).

The compose file also enables CQL `PasswordAuthenticator` / `CassandraAuthorizer` so roles persist in the `scylla-data` volume across redeploys.

## Managing Alternator users

Alternator credentials are **CQL roles**. The AWS access key ID is the role name; the secret access key is the role's `salted_hash` (not the plain-text CQL password).

CQL port `9042` is not public. Manage users by SSH on the Coolify worker and running `cqlsh` inside the Scylla container.

### 1. SSH to the worker

```bash
ssh -i /path/to/your-worker.key ubuntu@<worker-ip>
```

Example: `worker-2` at `130.110.9.205` with key `oracle-worker-2.key`.

### 2. Find the Scylla container

```bash
sudo docker ps --format '{{.Names}}\t{{.Image}}' | grep scylla
```

### 3. Create a role

**First user (empty cluster)** — use the maintenance socket (no CQL password required):

```bash
CONTAINER=<scylla-container-name>
PASS='choose-a-strong-password'

sudo docker exec "$CONTAINER" cqlsh /var/lib/scylla/cql.m -e \
  "CREATE ROLE cassandra WITH PASSWORD = '$PASS' AND SUPERUSER = true AND LOGIN = true;"

sudo docker exec "$CONTAINER" cqlsh /var/lib/scylla/cql.m -e \
  "CREATE ROLE myapp WITH PASSWORD = '$PASS' AND LOGIN = true;"

sudo docker exec "$CONTAINER" cqlsh /var/lib/scylla/cql.m -e \
  "GRANT ALL ON ALL KEYSPACES TO myapp;"
```

**Additional users** — log in as an admin role:

```bash
ADMIN_PASS='your-cassandra-password'

sudo docker exec "$CONTAINER" cqlsh -u cassandra -p "$ADMIN_PASS" -e \
  "CREATE ROLE test WITH PASSWORD = 'choose-a-strong-password' AND LOGIN = true;"

sudo docker exec "$CONTAINER" cqlsh -u cassandra -p "$ADMIN_PASS" -e \
  "GRANT CREATE ON ALL KEYSPACES TO test;"
```

Grant only what each app needs. Alternator tables appear in CQL as `alternator_<keyspace>.<table>`.

| Permission | DynamoDB operations |
|------------|---------------------|
| `SELECT` | GetItem, Query, Scan, BatchGetItem |
| `MODIFY` | PutItem, UpdateItem, DeleteItem, BatchWriteItem |
| `CREATE` | CreateTable |
| `DROP` | DeleteTable |

### 4. Get the Alternator secret key

```bash
sudo docker exec "$CONTAINER" cqlsh -u cassandra -p "$ADMIN_PASS" -e \
  "SELECT role, salted_hash FROM system.roles WHERE role = 'test';"
```

Copy the `salted_hash` value — that is the AWS `secretAccessKey` for Alternator.

### 5. Verify with AWS CLI

```bash
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY='<salted_hash from step 4>'
aws dynamodb list-tables --endpoint-url "https://<SCYLLA_HOST>" --region eu-west-1
```

### 6. Use in Node.js (auth enabled)

```javascript
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

export const dynamodb = new DynamoDBClient({
  region: "eu-west-1",
  endpoint: "https://dynamodb.example.com",
  credentials: {
    accessKeyId: "test",
    secretAccessKey: "<salted_hash>",
  },
});
```

### Rotate or revoke

```bash
# Change password (re-fetch salted_hash afterwards)
sudo docker exec "$CONTAINER" cqlsh -u cassandra -p "$ADMIN_PASS" -e \
  "ALTER ROLE test WITH PASSWORD = 'new-password';"

# Revoke access
sudo docker exec "$CONTAINER" cqlsh -u cassandra -p "$ADMIN_PASS" -e \
  "DROP ROLE test;"
```

Store passwords and `salted_hash` values in Coolify secrets or a password manager — never commit them to git.

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
