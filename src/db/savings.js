import { randomUUID } from "node:crypto";
import { pool } from "./pool.js";

export async function getSavingsActions(email) {
  const result = await pool.query(
    "SELECT * FROM savings_actions WHERE lower(customer_email) = lower($1) ORDER BY created_at ASC",
    [email]
  );
  return result.rows.map(mapSavingsRow);
}

export async function upsertSavingsAction(email, action) {
  const id = action.id || randomUUID();
  const status = action.status || "pending";
  const delta = Number(action.annual_delta_cents ?? 0);

  const result = await pool.query(
    `INSERT INTO savings_actions (
      id, customer_email, move_id, title, body, priority, type, status, annual_delta_cents, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
    ON CONFLICT (customer_email, move_id)
    DO UPDATE SET
      title = EXCLUDED.title,
      body = EXCLUDED.body,
      priority = EXCLUDED.priority,
      type = EXCLUDED.type,
      status = EXCLUDED.status,
      annual_delta_cents = EXCLUDED.annual_delta_cents,
      updated_at = now()
    RETURNING *`,
    [
      id,
      email,
      action.move_id,
      action.title,
      action.body,
      action.priority,
      action.type,
      status,
      delta
    ]
  );
  return mapSavingsRow(result.rows[0]);
}

export async function updateSavingsActionStatus(email, moveId, status) {
  const result = await pool.query(
    `UPDATE savings_actions
     SET status = $1, updated_at = now()
     WHERE lower(customer_email) = lower($2) AND move_id = $3
     RETURNING *`,
    [status, email, moveId]
  );
  return mapSavingsRow(result.rows[0]);
}

function mapSavingsRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    customerEmail: row.customer_email,
    moveId: row.move_id,
    title: row.title,
    body: row.body,
    priority: row.priority,
    type: row.type,
    status: row.status,
    annualDeltaCents: Number(row.annual_delta_cents),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
