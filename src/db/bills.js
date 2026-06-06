import { pool } from "./pool.js";

const insertSql = `
  INSERT INTO bill_ingestions (
    id,
    customer_id,
    customer_email,
    provider,
    plan_name,
    service_address,
    postcode,
    bill_period_start,
    bill_period_end,
    usage_kwh,
    daily_average_kwh,
    supply_charge_cents,
    usage_charge_cents,
    total_cents,
    source_file_name,
    raw_text,
    extracted_data,
    coaching_notifications,
    status
  )
  VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9,
    $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
  )
  RETURNING *
`;

function mapBillRow(row) {
  if (!row) {
    return null;
  }

  // Returned to the frontend, which reads snake_case (bill.total_cents, etc.).
  return {
    id: row.id,
    customer_id: row.customer_id,
    customer_email: row.customer_email,
    provider: row.provider,
    plan_name: row.plan_name,
    service_address: row.service_address,
    postcode: row.postcode,
    bill_period_start: row.bill_period_start,
    bill_period_end: row.bill_period_end,
    usage_kwh: Number(row.usage_kwh),
    daily_average_kwh: Number(row.daily_average_kwh),
    supply_charge_cents:
      row.supply_charge_cents == null ? null : Number(row.supply_charge_cents),
    usage_charge_cents:
      row.usage_charge_cents == null ? null : Number(row.usage_charge_cents),
    total_cents: row.total_cents == null ? null : Number(row.total_cents),
    source_file_name: row.source_file_name,
    raw_text: row.raw_text,
    extracted_data: row.extracted_data,
    coaching_notifications: row.coaching_notifications,
    status: row.status,
    created_at: row.created_at
  };
}

export async function insertBillIngestion(bill, notifications) {
  const result = await pool.query(insertSql, [
    bill.id,
    bill.customerId,
    bill.customerEmail,
    bill.provider,
    bill.planName,
    bill.serviceAddress,
    bill.postcode,
    bill.billPeriodStart,
    bill.billPeriodEnd,
    bill.usageKwh,
    bill.dailyAverageKwh,
    bill.supplyChargeCents,
    bill.usageChargeCents,
    bill.totalCents,
    bill.sourceFileName,
    bill.rawText,
    JSON.stringify(bill.extractedData),
    JSON.stringify(notifications),
    bill.status
  ]);

  return mapBillRow(result.rows[0]);
}

export async function latestBill() {
  const result = await pool.query(
    "SELECT * FROM bill_ingestions ORDER BY created_at DESC LIMIT 1"
  );
  return mapBillRow(result.rows[0]);
}

export async function notificationsForCustomer(customerEmail) {
  const result = await pool.query(
    `SELECT id, customer_email, provider, coaching_notifications, created_at
     FROM bill_ingestions
     WHERE lower(customer_email) = lower($1)
     ORDER BY created_at DESC
     LIMIT 10`,
    [customerEmail]
  );

  return result.rows.flatMap((row) =>
    (row.coaching_notifications ?? []).map((notification) => ({
      ...notification,
      billId: row.id,
      customerEmail: row.customer_email,
      provider: row.provider,
      createdAt: row.created_at
    }))
  );
}
