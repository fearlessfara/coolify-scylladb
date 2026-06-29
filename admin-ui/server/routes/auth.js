import { Router } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import {
  clearSessionCookie,
  getSessionConfig,
  issueCsrfToken,
  requireAuth,
  setSessionCookie,
  signSession,
} from "../middleware/auth.js";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts" },
});

router.post("/login", loginLimiter, async (req, res) => {
  const { username, password } = req.body ?? {};
  const config = getSessionConfig();

  if (username !== config.ADMIN_USERNAME) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const ok = await bcrypt.compare(password ?? "", config.ADMIN_PASSWORD_HASH);
  if (!ok) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = signSession(username);
  setSessionCookie(res, token);
  return res.json({ ok: true, username });
});

router.post("/logout", requireAuth, (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ username: req.user.username });
});

router.get("/csrf", requireAuth, issueCsrfToken);

export default router;
