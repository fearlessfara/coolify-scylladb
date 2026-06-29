import fs from "node:fs";
import cassandra from "cassandra-driver";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const {
  SCYLLA_CQL_HOST = "scylla",
  SCYLLA_CQL_PORT = "9042",
  SCYLLA_CQL_USER = "cassandra",
  SCYLLA_CQL_PASSWORD,
  SCYLLA_CQL_PASSWORD_FILE = "/secrets/cql-password",
  ALTERNATOR_ENDPOINT = "http://scylla:8000",
  AWS_REGION = "eu-west-1",
} = process.env;

let cqlClient;
let alternatorSaltedHash;
let rawClient;
let docClient;

function resolveCqlPassword() {
  if (SCYLLA_CQL_PASSWORD) {
    return SCYLLA_CQL_PASSWORD;
  }
  if (fs.existsSync(SCYLLA_CQL_PASSWORD_FILE)) {
    const fromFile = fs.readFileSync(SCYLLA_CQL_PASSWORD_FILE, "utf8").trim();
    if (fromFile) return fromFile;
  }
  throw new Error(
    "No CQL password available. On a fresh install, wait for scylla-bootstrap. " +
      "On an existing cluster, set SCYLLA_CQL_PASSWORD once (it is saved to the admin-secrets volume)."
  );
}

export async function initScylla() {
  const cqlPassword = resolveCqlPassword();

  cqlClient = new cassandra.Client({
    contactPoints: [SCYLLA_CQL_HOST],
    localDataCenter: "datacenter1",
    protocolOptions: { port: Number(SCYLLA_CQL_PORT) },
    credentials: {
      username: SCYLLA_CQL_USER,
      password: cqlPassword,
    },
  });

  await cqlClient.connect();
  await cqlClient.execute("SELECT now() FROM system.local");

  const result = await cqlClient.execute(
    "SELECT salted_hash FROM system.roles WHERE role = ?",
    [SCYLLA_CQL_USER],
    { prepare: true }
  );
  alternatorSaltedHash = result.rows[0]?.salted_hash;
  if (!alternatorSaltedHash) {
    throw new Error(`No salted_hash found for CQL user ${SCYLLA_CQL_USER}`);
  }

  rawClient = new DynamoDBClient({
    region: AWS_REGION,
    endpoint: ALTERNATOR_ENDPOINT,
    credentials: {
      accessKeyId: SCYLLA_CQL_USER,
      secretAccessKey: alternatorSaltedHash,
    },
  });

  docClient = DynamoDBDocumentClient.from(rawClient, {
    marshallOptions: { removeUndefinedValues: true },
  });
}

export function getCql() {
  if (!cqlClient) throw new Error("Scylla CQL client not initialized");
  return cqlClient;
}

export function getRaw() {
  if (!rawClient) throw new Error("Alternator client not initialized");
  return rawClient;
}

export function getDoc() {
  if (!docClient) throw new Error("Alternator document client not initialized");
  return docClient;
}

export async function getRoleSaltedHash(roleName) {
  const result = await getCql().execute(
    "SELECT salted_hash FROM system.roles WHERE role = ?",
    [roleName],
    { prepare: true }
  );
  return result.rows[0]?.salted_hash ?? null;
}

export async function shutdownScylla() {
  if (cqlClient) await cqlClient.shutdown();
}
