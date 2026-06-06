import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import { buildBillIngestion, demoBill } from "../src/ingestion.js";
import { generateCoachingNotifications } from "../src/coaching.js";
import { getPriceForDate, getPriceForecast } from "../src/price.js";
import { generatePlanMoves } from "../src/plan.js";

describe("bill ingestion", () => {
  it("extracts key bill facts from pasted text", async () => {
    const bill = await buildBillIngestion({
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

  it("extracts Alinta-style fields from raw text", async () => {
    const rawText = `
      Alinta Energy Retail Sales Pty Ltd
      Supply Address
      U 5703 7 Riverside Quay Southbank VIC 3006
      National Metering Identifier (NMI)
      61020311313
      New charges
      $170.48
      Peak
      07 May 2026
      Actual
      471.424 kWh
      $0.28600
      $134.83
      Daily Charge
      118.844 c/Day
      Peak 28.600 c/kWh
    `;

    const bill = await buildBillIngestion({
      customerEmail: "varun@example.com",
      rawText
    });

    assert.equal(bill.customerEmail, "varun@example.com");
    assert.equal(bill.provider, "Alinta Energy");
    assert.equal(bill.serviceAddress, "U 5703 7 Riverside Quay Southbank VIC 3006");
    assert.equal(bill.postcode, "3006");
    assert.equal(bill.extractedData.nmi, "61020311313");
    assert.equal(bill.usageKwh, 471.424);
    assert.equal(bill.totalCents, 17048);
    assert.equal(bill.supplyChargeCents, 119); // 118.844 rounded
    assert.equal(bill.usageChargeCents, 29); // 28.600 rounded
  });

  it("creates demo coaching notifications", async () => {
    const bill = await demoBill();
    const notifications = generateCoachingNotifications(bill);

    assert.ok(notifications.length >= 3);
    assert.ok(notifications.some((item) => item.type === "bill_watch"));
  });
});

describe("price engine", () => {
  it("generates deterministic cheap prices during off-peak", () => {
    const midDay = new Date("2026-06-06T12:00:00+10:00");
    const priceInfo = getPriceForDate(midDay);
    assert.equal(priceInfo.status, "cheap");
    assert.ok(priceInfo.cents_per_kwh < 20);
  });

  it("generates peak prices during evening peak", () => {
    const peakTime = new Date("2026-06-06T18:00:00+10:00");
    const priceInfo = getPriceForDate(peakTime);
    assert.equal(priceInfo.status, "high");
    assert.ok(priceInfo.cents_per_kwh > 35);
  });

  it("generates structured forecast", () => {
    const now = new Date();
    const forecast = getPriceForecast(now, 6);
    assert.equal(forecast.length, 6);
    assert.ok(forecast[0].cents_per_kwh > 0);
  });
});

describe("plan recommendations", () => {
  it("generates Time-of-Use and hot water moves", () => {
    const bill = {
      usageKwh: 1000,
      totalCents: 30000,
      provider: "Origin Energy"
    };

    const planInfo = generatePlanMoves(bill);
    assert.ok(planInfo.estimated_annual_saving_cents > 0);
    assert.ok(planInfo.moves.some(m => m.id === "tou"));
    assert.ok(planInfo.moves.some(m => m.id === "hot_water"));
  });

  it("recommends solar sharer switch when solar is detected", () => {
    const bill = {
      usageKwh: 800,
      totalCents: 24000,
      provider: "Alinta Energy",
      extractedData: { solar: true }
    };

    const planInfo = generatePlanMoves(bill);
    const solarMove = planInfo.moves.find(m => m.id === "solar_sharer");
    assert.ok(solarMove);
    assert.equal(solarMove.good, true);
  });

  it("skips solar sharer when no solar is detected", () => {
    const bill = {
      usageKwh: 800,
      totalCents: 24000,
      provider: "Alinta Energy"
    };

    const planInfo = generatePlanMoves(bill);
    const solarMove = planInfo.moves.find(m => m.id === "solar_sharer");
    assert.ok(solarMove);
    assert.equal(solarMove.good, false);
  });
});
