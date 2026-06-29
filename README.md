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

1. Copy the example environment file (for local reference; on Coolify use the **Environment Variables** panel):

   ```bash
   cp .env.example .env
   ```

2. Deploy in Coolify as a **Docker Compose** resource.

3. In Coolify, open each service and assign domains in the **configuration / domains** panel (see [Coolify domain setup](#coolify-domain-setup) below). Do **not** set `SCYLLA_HOST` or `ADMIN_UI_HOST` in the env vars page.

4. Optionally configure Alternator auth in the env panel (see [Authentication](#authentication) below).

## Coolify domain setup

Domains are configured **per service in the Coolify UI**, not via `SCYLLA_HOST` / `ADMIN_UI_HOST` env vars. Coolify injects `SERVICE_FQDN_*` variables and Traefik labels automatically.

1. **Create a Docker Compose resource** in Coolify and point it at this repository.

2. **Assign domains** in the Coolify service configuration panel:

   | Service | Port | Purpose |
   |---------|------|---------|
   | `scylla` | `8000` | Alternator (DynamoDB API) — e.g. `dynamodb.example.com` |
   | `scylla-admin` | `3000` | Admin console — e.g. `admin.dynamodb.example.com` or a Coolify auto `sslip.io` URL |

   For custom domains, create a DNS **A** / **AAAA** record pointing at your Coolify server. Coolify provisions HTTPS (Let's Encrypt) when you use a real domain.

   Auto-generated `sslip.io` URLs work over **HTTP**; use the `http://` link Coolify shows unless you assign a custom domain with TLS.

3. **Environment variables** (Coolify **Variables** panel — not domains):

   | Variable | Purpose |
   |----------|---------|
   | `ALTERNATOR_AUTH_ENABLED` | `false` by default; set `true` to enforce auth |
   | `ALTERNATOR_AUTH_WARN` | `false` by default; set `true` to log would-be auth failures |
   | `ADMIN_USERNAME` | Admin UI login username |
   | `ADMIN_PASSWORD` | Admin UI login password |

4. After DNS propagates and the stack is healthy, Alternator is at the URL Coolify shows for the `scylla` service (`SERVICE_URL_SCYLLA`).

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

Replace `https://dynamodb.example.com` with your Alternator URL from Coolify (`SERVICE_URL_SCYLLA` / the domain assigned to the `scylla` service).

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
aws dynamodb list-tables --endpoint-url "https://dynamodb.example.com" --region eu-west-1
```

Use the hostname from Coolify's `scylla` service domain.

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

## Admin UI

A self-hosted admin console (`scylla-admin` service) provides a web UI for managing Alternator roles, tables, and item data. It is exposed on a separate HTTPS subdomain via Traefik.

| Component | Details |
|-----------|---------|
| Service | `scylla-admin` (built from `admin-ui/`) |
| Port | `3000` (internal; routed by Traefik) |
| Auth | Separate UI login (`ADMIN_USERNAME` + `ADMIN_PASSWORD`) |
| Scylla access | CQL superuser + Alternator via AWS SDK |

### Setup

1. **Domain in Coolify** — assign a domain to the `scylla-admin` service in the Coolify configuration panel (same as Alternator — not an env var). Use a custom domain for HTTPS, or the auto `sslip.io` URL over HTTP.

2. **Environment variables** in Coolify (Variables panel only):

   | Variable | Purpose |
   |----------|---------|
   | `ADMIN_USERNAME` | UI login username |
   | `ADMIN_PASSWORD` | UI login password (plain text; hashed inside the container at startup) |

   You do **not** need to set a CQL password on a fresh install. A one-shot `scylla-bootstrap` service creates the `cassandra` superuser, generates a password, and stores it in the `admin-secrets` Docker volume. The admin UI reads it automatically.

   **Existing cluster** (you already created `cassandra` manually): set `SCYLLA_CQL_PASSWORD` **once** on deploy. Bootstrap saves it to `admin-secrets`; you can remove it from Coolify env on later redeploys.

   Optional advanced settings:

   | Variable | Purpose |
   |----------|---------|
   | `ADMIN_PASSWORD_HASH` | Use a pre-generated bcrypt hash instead of `ADMIN_PASSWORD` |
   | `SCYLLA_CQL_PASSWORD` | One-time import for clusters that already had a `cassandra` password |
   | `SESSION_SECRET` | Fixed JWT signing secret; auto-generated if omitted (sessions reset on restart) |

3. Redeploy the stack. Bootstrap runs before the admin UI; Alternator API access is wired up automatically from the `cassandra` role.

   To generate a bcrypt hash manually (only if you prefer `ADMIN_PASSWORD_HASH`):

   ```bash
   cd admin-ui && npm install && npm run hash-password -- 'your-password'
   ```

### Features

- **Roles & keys** — list, create, rotate password, drop roles; grant presets on `alternator_<table>.<table>`; show `accessKeyId` + `salted_hash` once on create/rotate.
- **Tables** — list, create (PK/SK/GSI, `PAY_PER_REQUEST`), describe, delete.
- **Data browser** — paginated scan, query by key, JSON editor for put/edit, delete item.

### Security

> **Important:** The admin UI container holds **CQL superuser access** (auto-provisioned or from `admin-secrets`). Anyone who can log into the UI has full cluster access. Restrict the admin URL (custom domain + firewall, or Coolify access controls).

- UI sessions use httpOnly, Secure, SameSite=Strict JWT cookies.
- Login is rate-limited; Helmet security headers are enabled.
- CSRF protection via custom `X-Requested-With: ScyllaAdmin` header on state-changing API calls.
- CQL port `9042` is never exposed publicly — only the admin UI port is routed.
- **Optional hardening:** add Traefik IP allowlist or basic-auth middleware in front of the `scylla-admin` router if you want defense in depth (e.g. Tailscale-only access).

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
| `docker-compose.yml` | ScyllaDB + admin UI services, Traefik labels, data volume |
| `.env.example` | Template for hostnames, auth, and admin UI settings |
| `admin-ui/` | Express API + React admin console (built into `scylla-admin` image) |
| `README.md` | This document |

## License

Use and adapt freely for your own deployments.
