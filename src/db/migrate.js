import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { pool, closePool } from "./pool.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(__dirname, "../../sql/schema.sql");

export async function migrate() {
  const schema = await readFile(schemaPath, "utf8");
  await pool.query(schema);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrate()
    .then(async () => {
      console.log("Database schema is ready.");
      await closePool();
    })
    .catch(async (error) => {
      console.error("Migration failed.");
      console.error(error);
      await closePool();
      process.exit(1);
    });
}
