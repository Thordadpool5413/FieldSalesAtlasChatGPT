import { planContext, workspaceEvidence } from "./context";
import { journeyReadiness, itineraryVersion } from "./readiness";
import { changedContext, flightKey } from "./recovery";
import { createHash } from "node:crypto";
import { watchesFor } from "./watch";
import { normalizeFlights, type ScenarioBoard } from "./scenarios";
import { lookupAirports } from "../providers/airports";
import { zoneAt } from "./zones";
import { zonedInstant } from "../../shared/travel/time";
import type {
  TripAction,
  TripEvent,
  TripWorkspace,
} from "../../shared/travel/companion";

export async function tripWorkspace(
  workspaceId: string,
  reportId: string,
  board: ScenarioBoard,
): Promise<TripWorkspace> {
  const context = await planContext(workspaceId, reportId, board);
  const effective = context.pendingChange
    ? await changedContext(context, context.pendingChange)
    : { input: context.input, board: context.analysisBoard };
  const [{ readiness, evidence }, airports, watches] = await Promise.all([
    journeyReadiness(effective.input, effective.board, context.pending),
    lookupAirports(
      context.input.flights.flatMap((leg) => [leg.origin, leg.destination]),
    ),
    watchesFor(workspaceId),
  ]);
  const flights = normalizeFlights(context.input.flights, airports);
  const timeline: TripEvent[] = flights.map((leg) => ({
    id:
      "flight-" +
      createHash("sha256").update(flightKey(leg)).digest("hex").slice(0, 24),
    trainerId: leg.trainerId,
    kind: "flight",
    title: [
      leg.carrier + leg.flightNumber,
      leg.origin + " → " + leg.destination,
    ]
      .filter(Boolean)
      .join(" · "),
    startAt: leg.departure,
    endAt: leg.arrival,
    localDate: leg.departDate,
    localTime: leg.departTime,
    timeZone: leg.departureZone,
    detail:
      "Arrival " +
      leg.arriveDate +
      " " +
      leg.arriveTime +
      " " +
      (leg.arrivalZone || ""),
    basis: "traveler",
  }));
  for (const visit of (board.visits || []).filter(
    (row) =>
      context.tripIds.includes(row.tripId || "") && row.status !== "Canceled",
  )) {
    const manager = (board.managers || []).find(
      (person) => person.id === visit.managerId,
    );
    const trainer = board.trainerProfiles.find(
      (profile) =>
        profile.id === visit.trainerId ||
        profile.name === (visit.trainer || manager?.trainer),
    );
    const timeZone = visit.timeZone || zoneAt(manager?.lat, manager?.lon);
    let startAt = visit.startInstant,
      endAt = visit.endInstant;
    try {
      if (!startAt && timeZone && visit.startTime)
        startAt = zonedInstant(visit.date, visit.startTime, timeZone);
      if (!endAt && timeZone && visit.endTime)
        endAt = zonedInstant(visit.date, visit.endTime, timeZone);
    } catch {
      /* Missing or ambiguous clocks remain unresolved. */
    }
    timeline.push({
      id: visit.id,
      trainerId: trainer?.id || "",
      kind: "visit",
      title: manager?.name || "Saved visit",
      startAt,
      endAt,
      localDate: visit.date,
      localTime: visit.startTime,
      timeZone: timeZone || undefined,
      detail:
        visit.status +
        " · " +
        (visit.objective || "Review the saved appointment"),
      basis: "workspace",
    });
  }
  for (const row of context.input.requirements?.trainers || [])
    if (row.pickup) {
      timeline.push({
        id: "pickup-" + row.trainerId,
        trainerId: row.trainerId,
        kind: "pickup",
        title: "Reviewed rental pickup cutoff",
        startAt: zonedInstant(
          row.pickup.date,
          row.pickup.time,
          row.pickup.timeZone,
        ),
        localDate: row.pickup.date,
        localTime: row.pickup.time,
        timeZone: row.pickup.timeZone,
        detail: "Traveler-reported rental counter deadline",
        basis: "traveler",
      });
    }
  timeline.sort((a, b) =>
    (a.startAt || a.localDate).localeCompare(b.startAt || b.localDate),
  );
  const actions: TripAction[] = [];
  if (context.pendingChange)
    actions.push({
      id: "pending-flight-change",
      priority: "attention",
      title: "Review the reported flight change",
      reason:
        "Readiness includes a pending change. Your saved itinerary and calendar still need a reviewed decision.",
      destination: "recovery",
    });
  for (const trainer of board.trainerProfiles.filter((profile) =>
    context.input.trainerIds.includes(profile.id),
  )) {
    if (!context.input.flights.some((leg) => leg.trainerId === trainer.id))
      actions.push({
        id: "itinerary-" + trainer.id,
        priority: "review",
        title: "Connect " + trainer.name + "’s reviewed itinerary",
        reason:
          "Flight dates and times are needed to check arrival, return and connection margins.",
        destination: "booking",
        trainerId: trainer.id,
      });
    const checks = readiness.checks.filter(
      (row) => row.trainerId === trainer.id && row.state !== "reported",
    );
    for (const destination of ["booking", "requirements"] as const) {
      const group = checks.filter(
        (check) =>
          (check.id.endsWith("-transport") || check.id.endsWith("-equipment")
            ? "requirements"
            : "booking") === destination,
      );
      if (!group.length) continue;
      const resource = destination === "requirements";
      actions.push({
        id: destination + "-" + trainer.id,
        trainerId: trainer.id,
        priority: group.some((check) => check.state === "attention")
          ? "attention"
          : "review",
        destination,
        title:
          "Review " +
          trainer.name +
          "’s " +
          (resource ? "transport and equipment" : "flight details"),
        reason: resource
          ? "Confirm access to ground transport and training equipment for this plan, including any partner handoff."
          : group.length +
            " dated flight and ticket checks still need your review. Confirm the itinerary and ticket with the airline.",
        details: group.map((check) => check.label + ": " + check.detail),
      });
    }
    for (const constraint of readiness.constraints.filter(
      (row) =>
        row.trainerId === trainer.id &&
        (row.marginMinutes === null || row.marginMinutes < 0),
    ))
      actions.push({
        id: constraint.id,
        priority: constraint.marginMinutes !== null ? "attention" : "review",
        title: trainer.name + ": " + constraint.label,
        reason:
          constraint.marginMinutes === null
            ? constraint.missing.join(" ")
            : Math.abs(constraint.marginMinutes) +
              " minutes short under the supplied timings and allowances.",
        destination: constraint.kind === "home" ? "profile" : "requirements",
        trainerId: trainer.id,
      });
  }
  const activeWatch = watches.find(
    (watch) =>
      !["stopped", "complete"].includes(watch.state) &&
      watch.tripIds.some((id) => context.tripIds.includes(id)),
  );
  const now = Date.now(),
    next = timeline.find((event) =>
      event.endAt
        ? Date.parse(event.endAt) >= now
        : event.startAt
          ? Date.parse(event.startAt) >= now
          : event.localDate >= new Date(now).toISOString().slice(0, 10),
    );
  const inFlight = flights.some(
    (leg) => Date.parse(leg.departure) <= now && Date.parse(leg.arrival) > now,
  );
  const stage: TripWorkspace["stage"] = inFlight
    ? "travel"
    : !next
      ? "review"
      : next.kind === "visit"
        ? "field"
        : next.kind === "flight" &&
            flights.find((leg) => leg.departure === next.startAt)?.origin ===
              context.input.arrivalAirport
          ? "return"
          : "prepare";
  return {
    plan: {
      id: reportId,
      title: context.scenario.title,
      startDate: context.input.startDate,
      endDate: context.input.endDate,
      arrivalAirport: context.input.arrivalAirport,
      trainerIds: context.input.trainerIds,
      trainerNames: board.trainerProfiles
        .filter((profile) => context.input.trainerIds.includes(profile.id))
        .map((profile) => profile.name),
      flightLegs: context.input.flights,
      tripIds: context.tripIds,
      pendingChange: context.pendingChange,
      itineraryVersion: itineraryVersion(context.input.flights),
      requirements: context.input.requirements,
    },
    checkedAt: new Date().toISOString(),
    workspaceRevision: board.revision || 0,
    itineraryVersion: itineraryVersion(context.input.flights),
    stage,
    timeline,
    actions: [
      ...new Map(actions.map((action) => [action.id, action])).values(),
    ].sort(
      (a, b) =>
        Number(b.priority === "attention") - Number(a.priority === "attention"),
    ),
    readiness,
    evidence: [workspaceEvidence(board, board.revision || 0), ...evidence],
    requirements: context.input.requirements || { trainers: [] },
    flights: context.input.flights,
    monitoring: {
      enabled: !!activeWatch,
      flightStatusEnabled: activeWatch?.monitorFlights === true,
      state: activeWatch?.state || "off",
      lastCheckedAt: activeWatch?.reviewedAt,
      nextCheckAt: activeWatch?.nextRun,
    },
    limitations: [
      "Flight events are supplied itinerary times, not confirmed airline status.",
      "Readiness includes disclosed allowances and road estimates; shared equipment and transport require reviewed arrangements.",
      "Unknown or ambiguous local times remain unresolved. External calendar acceptance and live traffic are not verified.",
    ],
  };
}
