import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { migrate } from "./db/migrate.js";
import { closePool } from "./db/pool.js";
import { router } from "./routes.js";

const app = express();

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(router);

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(error.status ?? 500).json({
    error: error.message ?? "Unexpected server error"
  });
});

async function start() {
  if (config.autoMigrate) {
    await migrate();
  }

  const server = app.listen(config.port, () => {
    console.log(`WattNow backend listening on http://localhost:${config.port}`);
  });

  const shutdown = async () => {
    server.close(async () => {
      await closePool();
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

start().catch(async (error) => {
  console.error("Failed to start WattNow backend.");
  console.error(error);
  await closePool();
  process.exit(1);
});
