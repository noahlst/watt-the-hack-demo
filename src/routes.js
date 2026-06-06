import express from "express";
import multer from "multer";
import { pool } from "./db/pool.js";
import {
  insertBillIngestion,
  latestBill,
  notificationsForCustomer
} from "./db/bills.js";
import { generateCoachingNotifications } from "./coaching.js";
import { buildBillIngestion, demoBill } from "./ingestion.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024
  }
});

export const router = express.Router();

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

router.post("/api/bills/demo", async (request, response, next) => {
  try {
    const bill = demoBill(request.body);
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

router.post(
  "/api/bills/upload",
  upload.single("bill"),
  async (request, response, next) => {
    try {
      const bill = buildBillIngestion(request.body, request.file);
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
