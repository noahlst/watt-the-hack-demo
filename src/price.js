export function getPriceForDate(date) {
  const hour = date.getHours();
  const minutes = date.getMinutes();
  // Deterministic jitter using sin/cos of minutes so it varies slightly but remains pure
  const jitter = Math.sin(hour + minutes / 60) * 1.2;

  let cents = 28.0;
  let status = "medium";
  let renewables = 48;

  if ((hour >= 10 && hour < 16) || (hour >= 22 || hour < 5)) {
    cents = 14.5;
    status = "cheap";
    renewables = hour >= 10 && hour < 16 ? 78 : 62;
  } else if (hour >= 16 && hour < 21) {
    cents = 42.0;
    status = "high";
    renewables = 24;
  }

  cents = Math.round((cents + jitter) * 10) / 10;
  renewables = Math.round(renewables + jitter * 2);

  let message = "Moderate vibes. Nothing urgent.";
  if (status === "cheap") {
    message = "Watt's the move? Run everything NOW.";
  } else if (status === "high") {
    message = "Watt?! Peak alert — hold off big loads.";
  }

  return {
    cents_per_kwh: cents,
    status,
    renewables_pct: Math.max(0, Math.min(100, renewables)),
    message
  };
}

export function getPriceForecast(startDate, hoursCount = 12) {
  const forecast = [];
  for (let i = 1; i <= hoursCount; i++) {
    const nextDate = new Date(startDate.getTime() + i * 60 * 60 * 1000);
    const priceInfo = getPriceForDate(nextDate);
    forecast.push({
      time: nextDate.toISOString(),
      cents_per_kwh: priceInfo.cents_per_kwh,
      status: priceInfo.status
    });
  }
  return forecast;
}
