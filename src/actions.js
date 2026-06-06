// Generates the "Do this now" immediate actions for the live dashboard.
// Pure + deterministic: derived entirely from the current price + forecast,
// so the list is stable within an hour and consistent with the live status.

const APPLIANCES = [
  { id: "dish", icon: "dish", kwh: 1.5, run: "Run the dishwasher now", hold: "Hold off the dishwasher" },
  { id: "ev", icon: "ev", kwh: 10, run: "Charge the car now", hold: "Delay charging the car" },
  { id: "cool", icon: "snow", kwh: 4, run: "Pre-cool the home now", hold: "Ease off heating/cooling" }
];

function hourLabel(iso) {
  const d = new Date(iso);
  let h = d.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h} ${ampm}`;
}

function findNext(forecast, status) {
  if (!Array.isArray(forecast)) return null;
  return forecast.find((f) => f.status === status) ?? null;
}

// price/peak in c/kWh, kwh used -> dollars saved by acting now vs at peak.
function savingDollars(peakCents, nowCents, kwh) {
  const delta = Math.max(0, peakCents - nowCents);
  return ((delta / 100) * kwh).toFixed(2);
}

export function generateActions(priceInfo, forecast = []) {
  const nowCents = Number(priceInfo?.cents_per_kwh ?? 28);
  const status = priceInfo?.status ?? "medium";
  const peakCents = Math.max(
    nowCents,
    ...(Array.isArray(forecast) ? forecast.map((f) => Number(f.cents_per_kwh) || 0) : []),
    42
  );
  const nextPeak = findNext(forecast, "high");
  const nextCheap = findNext(forecast, "cheap");

  if (status === "cheap") {
    const before = nextPeak ? ` — cheap till ${hourLabel(nextPeak.time)}` : "";
    return APPLIANCES.map((a) => ({
      id: a.id,
      icon: a.icon,
      title: a.run,
      sub: `Beat the evening peak${before}`,
      save: savingDollars(peakCents, nowCents, a.kwh)
    }));
  }

  if (status === "high") {
    const until = nextCheap ? ` till ${hourLabel(nextCheap.time)}` : " a couple of hours";
    return APPLIANCES.map((a) => ({
      id: a.id,
      icon: a.icon,
      title: a.hold,
      sub: `Wait${until} — prices are high right now`,
      save: savingDollars(nowCents, Number(nextCheap?.cents_per_kwh ?? 14), a.kwh)
    }));
  }

  // medium
  const cheapAt = nextCheap ? ` Cheapest around ${hourLabel(nextCheap.time)}.` : "";
  return APPLIANCES.map((a) => ({
    id: a.id,
    icon: a.icon,
    title: a.run,
    sub: `Fine to run now.${cheapAt}`,
    save: savingDollars(peakCents, nowCents, a.kwh)
  }));
}
