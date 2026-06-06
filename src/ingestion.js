import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pdf = require("pdf-parse");

const DATE_PATTERN = /(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/g;

function numberFrom(value) {
  if (value == null || value === "") {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const normalized = String(value).replace(/[$,\s]/g, "");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function centsFrom(value) {
  const amount = numberFrom(value);
  if (amount == null) {
    return null;
  }

  return Math.round(amount * 100);
}

function isoDateFrom(day, month, year) {
  const fullYear = String(year).length === 2 ? `20${year}` : String(year);
  const date = new Date(
    Date.UTC(Number(fullYear), Number(month) - 1, Number(day))
  );

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

function dateRangeFromText(rawText) {
  if (!rawText) {
    return { start: null, end: null };
  }

  const dates = [...rawText.matchAll(DATE_PATTERN)]
    .map((match) => isoDateFrom(match[1], match[2], match[3]))
    .filter(Boolean);

  return {
    start: dates[0] ?? null,
    end: dates[1] ?? null
  };
}

function daysBetween(start, end) {
  if (!start || !end) {
    return 90;
  }

  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();
  const diffDays = Math.ceil((endTime - startTime) / 86_400_000);
  return diffDays > 0 ? diffDays : 90;
}

async function textFromFile(file) {
  if (!file?.buffer) {
    return "";
  }

  const type = file.mimetype ?? "";
  const name = file.originalname?.toLowerCase() ?? "";

  if (
    type.startsWith("text/") ||
    type === "application/json" ||
    name.endsWith(".txt")
  ) {
    return file.buffer.toString("utf8");
  }

  if (
    type === "application/pdf" ||
    name.endsWith(".pdf")
  ) {
    try {
      const parsed = await pdf(file.buffer);
      return parsed.text ?? "";
    } catch (error) {
      console.error("Failed to parse PDF file:", error);
      return "";
    }
  }

  return "";
}

function firstMatchNumber(rawText, patterns) {
  if (!rawText) {
    return null;
  }

  for (const pattern of patterns) {
    const match = rawText.match(pattern);
    if (match?.[1]) {
      return numberFrom(match[1]);
    }
  }

  return null;
}

function firstMatchString(rawText, patterns) {
  if (!rawText) {
    return null;
  }

  for (const pattern of patterns) {
    const match = rawText.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

function firstMatchMoney(rawText, patterns) {
  const amount = firstMatchNumber(rawText, patterns);
  return amount == null ? null : Math.round(amount * 100);
}

function detectProvider(rawText) {
  if (!rawText) return null;
  const text = rawText.toLowerCase();
  if (text.includes("origin energy") || text.includes("origin")) return "Origin Energy";
  if (text.includes("alinta energy") || text.includes("alinta")) return "Alinta Energy";
  if (text.includes("agl")) return "AGL";
  return null;
}

export async function buildBillIngestion(input = {}, file = null) {
  const fileText = await textFromFile(file);
  const rawText = input.rawText ?? input.billText ?? fileText;
  const textDates = dateRangeFromText(rawText);
  const dates = {
    start: textDates.start ?? input.billPeriodStart ?? input.periodStart ?? null,
    end: textDates.end ?? input.billPeriodEnd ?? input.periodEnd ?? null
  };

  const usageKwh =
    numberFrom(input.usageKwh ?? input.usage_kwh) ??
    firstMatchNumber(rawText, [
      /([\d,.]+)\s*kWh/i,
      /usage[^0-9]{0,24}([\d,.]+)/i,
      /electricity used[^0-9]{0,24}([\d,.]+)/i
    ]) ??
    0;

  const totalCents =
    centsFrom(input.totalCost ?? input.total) ??
    numberFrom(input.totalCents) ??
    firstMatchMoney(rawText, [
      /total(?: amount due| due| cost)?[^$0-9]{0,30}\$?([\d,.]+)/i,
      /amount due[^$0-9]{0,30}\$?([\d,.]+)/i,
      /new charges[^$0-9]{0,30}\$?([\d,.]+)/i
    ]);

  const billDays = daysBetween(dates.start, dates.end);
  const dailyAverageKwh = usageKwh / billDays;
  const customerId = input.customerId ?? randomUUID();

  // Enriched parsing for provider, plan name, NMI, address, postcode, and charges
  const provider = input.provider ?? detectProvider(rawText) ?? "your retailer";
  const planName = input.planName ?? input.plan ?? firstMatchString(rawText, [
    /plan\s*features[^]*?current\s*plan\s*is\s*([^\n]+)/i,
    /current\s*plan[^]*?([^\n]+?Plan)/i,
    /HomeDeal/i
  ]) ?? "HomeDeal Electricity Plan";

  const serviceAddress = input.serviceAddress ?? input.address ?? firstMatchString(rawText, [
    /Supply Address\s*\n*([^\n\r]+)/i,
    /service address\s*\n*([^\n\r]+)/i
  ]);

  const postcode = input.postcode ?? firstMatchString(rawText, [
    /vic\s+(\d{4})/i,
    /nsw\s+(\d{4})/i,
    /qld\s+(\d{4})/i,
    /\b(\d{4})\b/
  ]);

  const nmi = input.nmi ?? firstMatchString(rawText, [
    /National Metering Identifier\s*\(NMI\)[^0-9]{0,20}(\d+)/i,
    /NMI[^0-9]{0,20}(\d+)/i
  ]);

  let supplyChargeNum = input.supplyCharge;
  let isSupplyInCents = false;
  if (supplyChargeNum == null) {
    const patternCent = /([\d,.]+)\s*c\/day/i;
    const patternDollar = /supply charge[^$0-9\n]{0,30}\$?([\d,.]+)/i;
    const patternDaily = /daily charge[^$0-9\n]{0,30}\$?([\d,.]+)/i;

    const matchCent = rawText.match(patternCent);
    if (matchCent?.[1]) {
      supplyChargeNum = numberFrom(matchCent[1]);
      isSupplyInCents = true;
    } else {
      const matchDollar = rawText.match(patternDollar) || rawText.match(patternDaily);
      if (matchDollar?.[1]) {
        supplyChargeNum = numberFrom(matchDollar[1]);
      }
    }
  }

  const supplyChargeCents = isSupplyInCents
    ? Math.round(supplyChargeNum)
    : (centsFrom(supplyChargeNum) ?? centsFrom(input.supplyChargeCents));

  let usageChargeNum = input.usageCharge;
  let isUsageInCents = false;
  if (usageChargeNum == null) {
    const patternCent = /([\d,.]+)\s*c\/kwh/i;
    const patternDollar = /usage charge[^$0-9\n]{0,30}\$?([\d,.]+)/i;
    const patternPeak = /peak[^$0-9\n]{0,30}\$?([\d,.]+)/i;

    const matchCent = rawText.match(patternCent);
    if (matchCent?.[1]) {
      usageChargeNum = numberFrom(matchCent[1]);
      isUsageInCents = true;
    } else {
      const matchDollar = rawText.match(patternDollar) || rawText.match(patternPeak);
      if (matchDollar?.[1]) {
        usageChargeNum = numberFrom(matchDollar[1]);
      }
    }
  }

  const usageChargeCents = isUsageInCents
    ? Math.round(usageChargeNum)
    : (centsFrom(usageChargeNum) ?? centsFrom(input.usageChargeCents));

  const isSolar = !!(rawText && rawText.toLowerCase().includes("solar"));

  return {
    id: randomUUID(),
    customerId,
    customerEmail: input.customerEmail ?? input.email ?? "demo@wattnow.app",
    provider,
    planName,
    serviceAddress,
    postcode,
    billPeriodStart: dates.start,
    billPeriodEnd: dates.end,
    usageKwh,
    dailyAverageKwh,
    supplyChargeCents,
    usageChargeCents,
    totalCents,
    sourceFileName: file?.originalname ?? null,
    rawText,
    extractedData: {
      billDays,
      nmi,
      solar: isSolar,
      inputFields: Object.keys(input),
      file: file
        ? {
            originalName: file.originalname,
            mimeType: file.mimetype,
            size: file.size
          }
        : null
    },
    status: "processed"
  };
}

export async function demoBill(overrides = {}) {
  return await buildBillIngestion({
    customerEmail: "demo@wattnow.app",
    provider: "Origin Energy",
    planName: "Flex Saver",
    serviceAddress: "42 Johnston Street, Collingwood VIC",
    postcode: "3066",
    billPeriodStart: "2026-03-01",
    billPeriodEnd: "2026-05-31",
    usageKwh: 1248,
    supplyCharge: 98.1,
    usageCharge: 230.6,
    totalCost: 328.7,
    rawText:
      "Origin Energy Flex Saver. Billing period 01/03/2026 to 31/05/2026. Electricity used 1248 kWh. Total amount due $328.70.",
    ...overrides
  });
}
