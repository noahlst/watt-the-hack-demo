import pg from "pg";
import { config } from "../config.js";

const { Pool } = pg;

pg.types.setTypeParser(1082, (value) => value);

export const pool = new Pool({
  connectionString: config.databaseUrl
});

export async function closePool() {
  await pool.end();
}
