import { randomUUID } from "node:crypto";

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

function textFromFile(file) {
  if (!file?.buffer) {
    return "";
  }

  const type = file.mimetype ?? "";
  if (
    type.startsWith("text/") ||
    type === "application/json" ||
    file.originalname?.toLowerCase().endsWith(".txt")
  ) {
    return file.buffer.toString("utf8");
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

function firstMatchMoney(rawText, patterns) {
  const amount = firstMatchNumber(rawText, patterns);
  return amount == null ? null : Math.round(amount * 100);
}

export function buildBillIngestion(input = {}, file = null) {
  const fileText = textFromFile(file);
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
      /total(?: amount due| due| cost)?[^$0-9]{0,20}\$?([\d,.]+)/i,
      /amount due[^$0-9]{0,20}\$?([\d,.]+)/i
    ]);

  const billDays = daysBetween(dates.start, dates.end);
  const dailyAverageKwh = usageKwh / billDays;
  const customerId = input.customerId ?? randomUUID();

  return {
    id: randomUUID(),
    customerId,
    customerEmail: input.customerEmail ?? input.email ?? "demo@wattnow.app",
    provider: input.provider ?? null,
    planName: input.planName ?? input.plan ?? null,
    serviceAddress: input.serviceAddress ?? input.address ?? null,
    postcode: input.postcode ?? null,
    billPeriodStart: dates.start,
    billPeriodEnd: dates.end,
    usageKwh,
    dailyAverageKwh,
    supplyChargeCents: centsFrom(
      input.supplyCharge ?? input.supplyChargeCents
    ),
    usageChargeCents: centsFrom(input.usageCharge ?? input.usageChargeCents),
    totalCents,
    sourceFileName: file?.originalname ?? null,
    rawText,
    extractedData: {
      billDays,
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

export function demoBill(overrides = {}) {
  return buildBillIngestion({
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
