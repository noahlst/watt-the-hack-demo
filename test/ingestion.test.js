import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildBillIngestion, demoBill } from "../src/ingestion.js";
import { generateCoachingNotifications } from "../src/coaching.js";

describe("bill ingestion", () => {
  it("extracts key bill facts from pasted text", () => {
    const bill = buildBillIngestion({
      customerEmail: "sam@example.com",
      rawText:
        "Billing period 01/03/2026 to 31/05/2026. Electricity used 1248 kWh. Total amount due $328.70."
    });

    assert.equal(bill.customerEmail, "sam@example.com");
    assert.equal(bill.usageKwh, 1248);
    assert.equal(bill.totalCents, 32870);
    assert.equal(bill.billPeriodStart, "2026-03-01");
    assert.equal(bill.billPeriodEnd, "2026-05-31");
    assert.equal(Math.round(bill.dailyAverageKwh * 10) / 10, 13.7);
  });

  it("creates demo coaching notifications", () => {
    const bill = demoBill();
    const notifications = generateCoachingNotifications(bill);

    assert.ok(notifications.length >= 3);
    assert.ok(notifications.some((item) => item.type === "bill_watch"));
  });
});
