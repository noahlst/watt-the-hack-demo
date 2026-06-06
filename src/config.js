import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number.parseInt(process.env.PORT ?? "4000", 10),
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgres://wattnow:wattnow@localhost:5432/wattnow",
  autoMigrate: (process.env.AUTO_MIGRATE ?? "true").toLowerCase() === "true",
  corsOrigin: process.env.CORS_ORIGIN ?? "*"
};
