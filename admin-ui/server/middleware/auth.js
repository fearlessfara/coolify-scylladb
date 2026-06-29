import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const COOKIE_NAME = "scylla_admin_session";

let sessionSecret;
let adminUsername;
let adminPasswordHash;

export function initAuthConfig() {
  adminUsername = process.env.ADMIN_USERNAME?.trim();
  if (!adminUsername) {
    throw new Error("ADMIN_USERNAME is required");
  }

  const plainPassword = process.env.ADMIN_PASSWORD;
  const passwordHash = process.env.ADMIN_PASSWORD_HASH;

  if (passwordHash) {
    adminPasswordHash = passwordHash;
  } else if (plainPassword) {
    adminPasswordHash = bcrypt.hashSync(plainPassword, 12);
  } else {
    throw new Error(
      "ADMIN_PASSWORD is required (or set ADMIN_PASSWORD_HASH for advanced setups)"
    );
  }

  const configuredSecret = process.env.SESSION_SECRET?.trim();
  if (configuredSecret && configuredSecret.length >= 32) {
    sessionSecret = configuredSecret;
  } else {
    sessionSecret = crypto.randomBytes(32).toString("base64url");
    console.warn(
      "SESSION_SECRET not set — using an auto-generated secret (sessions reset on container restart)"
    );
  }

  return getSessionConfig();
}

export function getSessionConfig() {
  if (!sessionSecret || !adminUsername || !adminPasswordHash) {
    throw new Error("Auth is not initialized");
  }
  return {
    SESSION_SECRET: sessionSecret,
    ADMIN_USERNAME: adminUsername,
    ADMIN_PASSWORD_HASH: adminPasswordHash,
  };
}

export function signSession(username) {
  return jwt.sign({ sub: username }, sessionSecret, { expiresIn: "12h" });
}

export function verifySession(token) {
  try {
    return jwt.verify(token, sessionSecret);
  } catch {
    return null;
  }
}

export function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 12 * 60 * 60 * 1000,
    path: "/",
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
  });
}

export function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const payload = verifySession(token);
  if (!payload) {
    clearSessionCookie(res);
    return res.status(401).json({ error: "Session expired" });
  }
  req.user = { username: payload.sub };
  return next();
}

export function requireCsrf(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }
  if (req.path === "/login" || req.originalUrl?.startsWith("/api/login")) {
    return next();
  }
  if (req.get("x-requested-with") !== "ScyllaAdmin") {
    return res.status(403).json({ error: "CSRF check failed" });
  }
  return next();
}

export function issueCsrfToken(req, res) {
  res.json({ csrf: true });
}
