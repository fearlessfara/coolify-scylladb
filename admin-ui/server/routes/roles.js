import { Router } from "express";
import { getCql, getRoleSaltedHash } from "../scylla.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

const GRANT_PRESETS = {
  full: ["ALL"],
  readwrite: ["SELECT", "MODIFY"],
  readonly: ["SELECT"],
  create: ["CREATE"],
};

function quoteRole(name) {
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error("Invalid role name");
  }
  return name;
}

function quoteIdent(name) {
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error("Invalid identifier");
  }
  return name;
}

function quoteCqlString(value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("Invalid password");
  }
  return `'${value.replace(/'/g, "''")}'`;
}

router.get("/", async (req, res, next) => {
  try {
    const result = await getCql().execute(
      "SELECT role, can_login, is_superuser FROM system.roles"
    );
    res.json({
      roles: result.rows.map((row) => ({
        role: row.role,
        canLogin: row.can_login,
        isSuperuser: row.is_superuser,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const { role, password } = req.body ?? {};
    if (!role || !password) {
      return res.status(400).json({ error: "role and password are required" });
    }
    const safeRole = quoteRole(role);
    await getCql().execute(
      `CREATE ROLE ${safeRole} WITH PASSWORD = ${quoteCqlString(password)} AND LOGIN = true`
    );
    const saltedHash = await getRoleSaltedHash(safeRole);
    res.status(201).json({
      role: safeRole,
      accessKeyId: safeRole,
      secretAccessKey: saltedHash,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/:role/rotate", async (req, res, next) => {
  try {
    const safeRole = quoteRole(req.params.role);
    const { password } = req.body ?? {};
    if (!password) {
      return res.status(400).json({ error: "password is required" });
    }
    await getCql().execute(
      `ALTER ROLE ${safeRole} WITH PASSWORD = ${quoteCqlString(password)}`
    );
    const saltedHash = await getRoleSaltedHash(safeRole);
    res.json({
      role: safeRole,
      accessKeyId: safeRole,
      secretAccessKey: saltedHash,
    });
  } catch (err) {
    next(err);
  }
});

router.delete("/:role", async (req, res, next) => {
  try {
    const safeRole = quoteRole(req.params.role);
    if (safeRole === "cassandra") {
      return res.status(400).json({ error: "Cannot delete cassandra superuser" });
    }
    await getCql().execute(`DROP ROLE IF EXISTS ${safeRole}`);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post("/:role/grants", async (req, res, next) => {
  try {
    const safeRole = quoteRole(req.params.role);
    const { preset, tableName, keyspace } = req.body ?? {};
    const perms = GRANT_PRESETS[preset];
    if (!perms) {
      return res.status(400).json({ error: "Invalid grant preset" });
    }

    if (preset === "create") {
      await getCql().execute(`GRANT CREATE ON ALL KEYSPACES TO ${safeRole}`);
      return res.json({ ok: true, preset });
    }

    if (!tableName) {
      return res.status(400).json({ error: "tableName is required for table grants" });
    }

    const ks = quoteIdent(keyspace || tableName);
    const table = quoteIdent(tableName);
    const target = `alternator_${ks}.${table}`;
    const permList = perms.join(", ");
    await getCql().execute(`GRANT ${permList} ON ${target} TO ${safeRole}`);
    res.json({ ok: true, preset, target });
  } catch (err) {
    next(err);
  }
});

export default router;
