import express from "express";
import multer from "multer";
import { pool } from "./db/pool.js";
import {
  insertBillIngestion,
  latestBill,
  notificationsForCustomer
} from "./db/bills.js";
import {
  getSavingsActions,
  upsertSavingsAction,
  updateSavingsActionStatus
} from "./db/savings.js";
import { generateCoachingNotifications } from "./coaching.js";
import { buildBillIngestion, demoBill } from "./ingestion.js";
import { getPriceForDate, getPriceForecast } from "./price.js";
import { generatePlanMoves } from "./plan.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024
  }
});

export const router = express.Router();

// Helper to map postcode to suburb name
function getSuburbForPostcode(postcode) {
  if (!postcode) return "Newtown";
  const mapping = {
    "3006": "Southbank",
    "3066": "Collingwood",
    "2042": "Newtown",
    "2043": "Erskineville",
    "2204": "Marrickville"
  };
  return mapping[postcode] || `Postcode ${postcode}`;
}

// 1. GET /health
router.get("/health", async (_request, response, next) => {
  try {
    const db = await pool.query("SELECT now() AS now");
    response.json({
      ok: true,
      service: "wattnow-backend",
      database: "connected",
      databaseTime: db.rows[0].now
    });
  } catch (error) {
    next(error);
  }
});

// 2. POST /api/bills/demo
router.post("/api/bills/demo", async (request, response, next) => {
  try {
    const bill = await demoBill(request.body);
    const notifications = generateCoachingNotifications(bill);
    const saved = await insertBillIngestion(bill, notifications);

    response.status(201).json({
      bill: saved,
      notifications,
      demoScript:
        "Bill uploaded, baseline created, and WattNow coaching notifications are ready to send."
    });
  } catch (error) {
    next(error);
  }
});

// 3. POST /api/bills/upload
router.post(
  "/api/bills/upload",
  upload.single("bill"),
  async (request, response, next) => {
    try {
      const bill = await buildBillIngestion(request.body, request.file);
      const notifications = generateCoachingNotifications(bill);
      const saved = await insertBillIngestion(bill, notifications);

      response.status(201).json({
        bill: saved,
        notifications
      });
    } catch (error) {
      next(error);
    }
  }
);

// 4. GET /api/bills/latest
router.get("/api/bills/latest", async (_request, response, next) => {
  try {
    const bill = await latestBill();

    if (!bill) {
      response.status(404).json({ error: "No bills have been ingested yet." });
      return;
    }

    response.json({ bill });
  } catch (error) {
    next(error);
  }
});

// 5. GET /api/notifications/:customerEmail
router.get("/api/notifications/:customerEmail", async (request, response, next) => {
  try {
    const notifications = await notificationsForCustomer(
      request.params.customerEmail
    );

    response.json({
      customerEmail: request.params.customerEmail,
      notifications
    });
  } catch (error) {
    next(error);
  }
});

// 6. GET /api/price/now
router.get("/api/price/now", (request, response) => {
  const postcode = request.query.postcode ? String(request.query.postcode) : "3006";
  const now = new Date();
  const priceInfo = getPriceForDate(now);
  const forecast = getPriceForecast(now, 12);

  response.json({
    cents_per_kwh: priceInfo.cents_per_kwh,
    status: priceInfo.status,
    renewables_pct: priceInfo.renewables_pct,
    updated_at: now.toISOString(),
    forecast,
    message: priceInfo.message
  });
});

// 7. GET /api/plan/:customerEmail
router.get("/api/plan/:customerEmail", async (request, response, next) => {
  try {
    const email = request.params.customerEmail;
    // Query latest bill for this email specifically
    const result = await pool.query(
      "SELECT * FROM bill_ingestions WHERE lower(customer_email) = lower($1) ORDER BY created_at DESC LIMIT 1",
      [email]
    );

    if (result.rows.length === 0) {
      response.status(404).json({ error: "No bill found on file for this customer." });
      return;
    }

    const bill = {
      usageKwh: Number(result.rows[0].usage_kwh),
      totalCents: result.rows[0].total_cents == null ? null : Number(result.rows[0].total_cents),
      provider: result.rows[0].provider,
      rawText: result.rows[0].raw_text,
      extractedData: result.rows[0].extracted_data
    };

    const planInfo = generatePlanMoves(bill);
    response.json(planInfo);
  } catch (error) {
    next(error);
  }
});

// 8. GET /api/savings/:customerEmail
router.get("/api/savings/:customerEmail", async (request, response, next) => {
  try {
    const email = request.params.customerEmail;
    const actions = await getSavingsActions(email);
    response.json({ customerEmail: email, actions });
  } catch (error) {
    next(error);
  }
});

// 9. POST /api/savings/:customerEmail
router.post("/api/savings/:customerEmail", async (request, response, next) => {
  try {
    const email = request.params.customerEmail;
    const { move_id, status } = request.body;

    if (!move_id || !status) {
      response.status(400).json({ error: "move_id and status are required." });
      return;
    }

    const validStatuses = ["pending", "banked", "dismissed"];
    if (!validStatuses.includes(status)) {
      response.status(400).json({ error: "status must be 'pending', 'banked', or 'dismissed'." });
      return;
    }

    const saved = await upsertSavingsAction(email, request.body);
    response.status(201).json(saved);
  } catch (error) {
    next(error);
  }
});

// 10. PATCH /api/savings/:customerEmail/:moveId
router.patch("/api/savings/:customerEmail/:moveId", async (request, response, next) => {
  try {
    const email = request.params.customerEmail;
    const moveId = request.params.moveId;
    const { status } = request.body;

    if (!status) {
      response.status(400).json({ error: "status is required." });
      return;
    }

    const validStatuses = ["pending", "banked", "dismissed"];
    if (!validStatuses.includes(status)) {
      response.status(400).json({ error: "status must be 'pending', 'banked', or 'dismissed'." });
      return;
    }

    const updated = await updateSavingsActionStatus(email, moveId, status);
    if (!updated) {
      response.status(404).json({ error: "Savings action not found." });
      return;
    }

    response.json(updated);
  } catch (error) {
    next(error);
  }
});

// 11. GET /api/leaderboard
router.get("/api/leaderboard", (request, response) => {
  const postcode = request.query.postcode ? String(request.query.postcode) : "3006";
  const userSuburb = getSuburbForPostcode(postcode);

  response.json({
    suburb: userSuburb,
    suburb_saved_cents: 1243000,
    rank: 3,
    leaderboard: [
      { suburb: "Erskineville", saved_cents: 1490200, is_user_suburb: userSuburb === "Erskineville" },
      { suburb: "Newtown", saved_cents: 1243000, is_user_suburb: userSuburb === "Newtown" },
      { suburb: "Marrickville", saved_cents: 988000, is_user_suburb: userSuburb === "Marrickville" },
      // Include the actual user suburb dynamically if it's not in the default list
      ...(userSuburb !== "Erskineville" && userSuburb !== "Newtown" && userSuburb !== "Marrickville"
        ? [{ suburb: userSuburb, saved_cents: 742000, is_user_suburb: true }]
        : [])
    ].sort((a, b) => b.saved_cents - a.saved_cents)
  });
});
