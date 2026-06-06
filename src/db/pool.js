import pg from "pg";
import { config } from "../config.js";

const { Pool } = pg;

pg.types.setTypeParser(1082, (value) => value);

const isLocal = config.databaseUrl.includes("localhost") || config.databaseUrl.includes("127.0.0.1");

export const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: isLocal ? false : { rejectUnauthorized: false }
});

export async function closePool() {
  await pool.end();
}

