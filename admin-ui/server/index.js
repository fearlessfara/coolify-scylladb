import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initScylla, shutdownScylla } from "./scylla.js";
import { initAuthConfig, requireCsrf } from "./middleware/auth.js";
import authRoutes from "./routes/auth.js";
import rolesRoutes from "./routes/roles.js";
import tablesRoutes from "./routes/tables.js";
import dataRoutes from "./routes/data.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.join(__dirname, "..", "web", "dist");
const port = Number(process.env.PORT || 3000);

const app = express();
app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "script-src": ["'self'"],
        "style-src": ["'self'", "'unsafe-inline'"],
      },
    },
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

app.get("/healthz", (req, res) => {
  res.json({ ok: true });
});

app.use("/api", requireCsrf);
app.use("/api", authRoutes);
app.use("/api/roles", rolesRoutes);
app.use("/api/tables", tablesRoutes);
app.use("/api/data", dataRoutes);

app.use(express.static(webDist));
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(webDist, "index.html"));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({
    error: err.message || "Internal server error",
  });
});

initAuthConfig();

await initScylla();

const server = app.listen(port, () => {
  console.log(`Scylla admin UI listening on :${port}`);
});

async function shutdown() {
  server.close();
  await shutdownScylla();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
