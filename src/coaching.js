import { randomUUID } from "node:crypto";
import { generatePlanMoves } from "./plan.js";

function dollars(cents) {
  if (cents == null || Number.isNaN(Number(cents))) {
    return null;
  }

  return `$${(Number(cents) / 100).toFixed(2)}`;
}

function notification(type, title, body, priority = "medium", minutesFromNow = 5) {
  return {
    id: randomUUID(),
    type,
    title,
    body,
    priority,
    channel: "push",
    sendAt: new Date(Date.now() + minutesFromNow * 60 * 1000).toISOString()
  };
}

export function generateCoachingNotifications(bill) {
  const usageKwh = Number(bill.usageKwh ?? 0);
  const dailyAverageKwh = Number(bill.dailyAverageKwh ?? 0);
  const total = dollars(bill.totalCents);
  const provider = bill.provider ?? "your retailer";
  const notifications = [];

  // Get plan moves to pull top saving recommendation
  const planInfo = generatePlanMoves(bill);
  const bestMove = planInfo.moves
    .filter((m) => m.good && m.annual_delta_cents > 0)
    .sort((a, b) => b.annual_delta_cents - a.annual_delta_cents)[0];

  const topSavingStr = bestMove
    ? `Top move: ${bestMove.title} (save ${dollars(bestMove.annual_delta_cents)}/yr).`
    : "";

  if (dailyAverageKwh >= 18) {
    notifications.push(
      notification(
        "high_usage",
        "Your daily usage is running hot",
        `This bill averages ${dailyAverageKwh.toFixed(
          1
        )} kWh/day. ${topSavingStr} WattNow recommends shifting laundry, dishwashing, and EV charging away from the evening peak this week.`,
        "high",
        1
      )
    );
  } else {
    notifications.push(
      notification(
        "steady_usage",
        "Nice steady usage profile",
        `This bill averages ${dailyAverageKwh.toFixed(
          1
        )} kWh/day. ${topSavingStr} WattNow will watch for unusual spikes and nudge you before they become bill shock.`,
        "medium",
        2
      )
    );
  }

  if (usageKwh > 0) {
    notifications.push(
      notification(
        "load_shift",
        "Tonight is a good load-shift window",
        `Based on ${usageKwh.toFixed(
          0
        )} kWh from your latest bill, run flexible appliances after 9pm to trim peak demand without changing your routine.`,
        "medium",
        4
      )
    );
  }

  if (total) {
    const mainRecStr = bestMove ? ` We suggest committing to: ${bestMove.title}.` : "";
    notifications.push(
      notification(
        "bill_watch",
        "Bill forecast ready",
        `Your latest ${provider} bill was ${total}.${mainRecStr} WattNow will compare the next seven days against this baseline and warn you early.`,
        "medium",
        7
      )
    );
  }

  notifications.push(
    notification(
      "coach_summary",
      "WattNow coaching is live",
      `Upload another bill any time. Your total annual potential saving is ${dollars(planInfo.estimated_annual_saving_cents)}/yr across all recommendations.`,
      "low",
      10
    )
  );

  return notifications;
}
