export function generatePlanMoves(bill) {
  if (!bill) {
    return {
      estimated_annual_saving_cents: 0,
      moves: []
    };
  }

  const usageKwh = Number(bill.usageKwh ?? 0);
  const isSolar = !!(bill.extractedData?.solar || (bill.rawText && bill.rawText.toLowerCase().includes("solar")));

  // Calculate ToU and Hot Water savings dynamically based on usage
  const touSavingsCents = usageKwh > 0 ? Math.round(usageKwh * 0.25 * 100) : 31200; 
  const hwSavingsCents = usageKwh > 0 ? Math.round(usageKwh * 0.15 * 100) : 18000;

  // Solar Sharer check
  const solarDeltaCents = isSolar ? 12000 : -8400;
  const solarTag = isSolar ? "+$120/yr" : "SKIP";
  const solarSub = isSolar
    ? "Solar detected — optimize feed-in credits."
    : "No solar detected — it’d cost you more.";

  // Battery payback calculation: dynamic payback based on usage
  const paybackYears = usageKwh > 0 ? Math.round((5000 / usageKwh) * 10) / 10 : 4.1;
  const batteryPayback = Math.max(3.0, Math.min(12.0, paybackYears));

  const moves = [
    {
      id: "tou",
      type: "swap",
      title: "Switch to a Time-of-Use plan",
      sub: "Your usage leans off-peak — you’d win here.",
      tag: "BEST MOVE",
      annual_delta_cents: touSavingsCents,
      good: true,
      payback_years: null
    },
    {
      id: "hot_water",
      type: "water",
      title: "Shift hot water to midday",
      sub: "Heat the tank on cheap daytime power.",
      tag: `+$${Math.round(hwSavingsCents / 100)}/yr`,
      annual_delta_cents: hwSavingsCents,
      good: true,
      payback_years: null
    },
    {
      id: "solar_sharer",
      type: "sun",
      title: "Join the Solar Sharer plan",
      sub: solarSub,
      tag: solarTag,
      annual_delta_cents: solarDeltaCents,
      good: isSolar,
      payback_years: null
    },
    {
      id: "battery",
      type: "battery",
      title: "Add a home battery",
      sub: `Breaks even in about ${Math.round(batteryPayback)} years.`,
      tag: `${batteryPayback} yr payback`,
      annual_delta_cents: 0,
      good: true,
      payback_years: batteryPayback
    }
  ];

  // Calculate total estimated savings (sum of positive moves, battery is good but delta is 0 in list)
  const totalSavings = moves
    .filter(m => m.good)
    .reduce((sum, m) => sum + m.annual_delta_cents, 0);

  return {
    estimated_annual_saving_cents: totalSavings,
    moves
  };
}
