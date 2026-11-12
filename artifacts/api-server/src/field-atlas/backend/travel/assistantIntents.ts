import type { AssistantAnswer } from "../../shared/travel/intelligence";
import type { PlanContext } from "./context";
import type { ScenarioBoard } from "./scenarios";
import { journeyReadiness } from "./readiness";
import { changedContext } from "./recovery";
import { planningRoads } from "./roadPlanning";

import { tripQuestionIntent } from "../../shared/travel/questions";
export async function answerTripIntent(
  question: string,
  context: PlanContext,
  board: ScenarioBoard,
  answer: AssistantAnswer,
): Promise<AssistantAnswer | null> {
  const intent = tripQuestionIntent(question);
  if (intent === "deadline") return null;
  const effective = context.pendingChange
    ? await changedContext(context, context.pendingChange)
    : { input: context.input, board: context.analysisBoard };
  if (context.pendingChange) {
    answer.evidence.push(context.pendingChange.evidence);
    answer.pendingChangeId = context.pendingChange.id;
  }
  answer.assumptions.push(
    "Uses this saved plan and reviewed inputs. No seats, fares or airline status are inferred.",
  );
  if (intent === "airports") {
    if (!effective.input.managerIds.length) {
      answer.verdict = "unknown";
      answer.title = "There are no saved visit locations to compare.";
      answer.missing.push("Select mapped visit locations in the saved plan.");
      return answer;
    }
    const roads = await planningRoads(
      {
        managerIds: effective.input.managerIds,
        airportCodes: [effective.input.arrivalAirport],
      },
      board,
    );
    answer.evidence.push(...roads.evidence);
    const best = roads.available ? roads.gateways[0] : undefined;
    answer.title = best
      ? "Least modeled driving among the compared airports: " +
        best.airport.iata
      : "Airport driving comparisons need more information.";
    answer.verdict = best ? "provisional" : "unknown";
    for (const gateway of roads.gateways)
      answer.claims.push({
        text: `${gateway.airport.iata}: ${Math.round(gateway.planningDriveMinutes)} modeled driving minutes for the airport-to-visits-and-back circuit.`,
        evidenceIds: roads.evidence.map((item) => item.id),
        limitation:
          "A greedy route comparison for the saved visit locations; not an exhaustive schedule or an airline-service check.",
      });
    if (!best)
      answer.missing.push(
        roads.limitation ||
          "Mapped visit locations and a working road-routing connection.",
      );
    answer.assumptions.push(roads.limitation);
    answer.followups.push(
      "Verify actual flights, fares and appointment windows before changing the arrival airport.",
    );
    return answer;
  }
  const result = await journeyReadiness(
    effective.input,
    effective.board,
    context.pending,
  );
  answer.readiness = result.readiness;
  answer.evidence.push(...result.evidence);
  const names = new Map<string, string>(
    board.trainerProfiles.map((profile) => [profile.id, profile.name]),
  );
  if (intent === "readiness") {
    answer.missing = [
      ...new Set([
        ...result.readiness.checks
          .filter((check) => check.state !== "reported")
          .map(
            (check) =>
              (names.get(check.trainerId) || check.trainerId) +
              ": " +
              check.detail,
          ),
        ...result.readiness.constraints.flatMap((item) =>
          item.missing.map(
            (detail) =>
              (names.get(item.trainerId) || item.trainerId) + ": " + detail,
          ),
        ),
      ]),
    ];
    const late = result.readiness.constraints.filter(
      (item) => item.marginMinutes !== null && item.marginMinutes < 0,
    );
    answer.title = late.length
      ? "Some supplied timings do not fit"
      : answer.missing.length
        ? "Here is what still needs confirming"
        : "The supplied checks are complete; verify current airline details";
    answer.verdict = late.length
      ? "not-with-current-itinerary"
      : answer.missing.length
        ? "unknown"
        : "provisional";
    for (const item of late)
      answer.claims.push({
        text:
          (names.get(item.trainerId) || item.trainerId) +
          ": " +
          item.label +
          " is " +
          Math.abs(item.marginMinutes!) +
          " minutes short.",
        evidenceIds: item.evidenceIds,
        limitation: item.basis,
      });
    if (!late.length)
      answer.claims.push({
        text: "No negative known timing margin was found in this calculation.",
        evidenceIds: result.evidence.map((item) => item.id),
        limitation:
          "Unknown margins and unconfirmed airline or appointment details remain separate.",
      });
    answer.followups.push(
      "Review the missing items in My Trip, then refresh readiness.",
    );
    return answer;
  }
  const matches = [
    ...question.matchAll(/\b(\d{1,3})\s*(?:minutes?|mins?)\b/gi),
  ].map((match) => Number(match[1]));
  if (/\b(?:an?|one) hour\b/i.test(question)) matches.push(60);
  const minutes = [...new Set(matches)];
  if (
    minutes.length !== 1 ||
    minutes[0] < 1 ||
    minutes[0] > 720 ||
    /\b(home|return)\b.*\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{4}-\d{2}-\d{2})\b/i.test(
      question,
    )
  ) {
    answer.verdict = "clarification";
    answer.title =
      "Choose one delay duration for the saved timing-margin comparison.";
    answer.followups = [
      "Ask what happens with one delay in minutes. To assess a return-home deadline after an actual flight change, report that change first.",
    ];
    return answer;
  }
  const delay = minutes[0];
  let exceeds = false,
    unknown = false;
  answer.title =
    delay + "-minute delay: consequences for each trainer’s known margins";
  for (const trainer of result.readiness.trainers) {
    const own = result.readiness.constraints.filter(
      (item) => item.trainerId === trainer.trainerId,
    );
    const affected = own.filter(
      (item) => item.marginMinutes !== null && item.marginMinutes < delay,
    );
    const missing = own.filter((item) => item.marginMinutes === null);
    exceeds ||= affected.length > 0;
    unknown ||= missing.length > 0 || !own.length;
    answer.claims.push({
      text:
        trainer.name +
        ": " +
        (affected.length
          ? affected
              .map(
                (item) =>
                  item.label +
                  " (" +
                  Math.round(item.marginMinutes! - delay) +
                  " min remaining)",
              )
              .join("; ")
          : own.length
            ? "No known margin is exhausted by this arithmetic comparison."
            : "No usable timing margins are available."),
      evidenceIds: [...new Set(own.flatMap((item) => item.evidenceIds))],
      limitation:
        "Each trainer is tested independently with other supplied times held fixed. This is not a flight-delay prediction, a missed-connection probability or a rebooking simulation.",
    });
    answer.missing.push(
      ...missing.map(
        (item) =>
          trainer.name + ": " + item.label + " needs " + item.missing.join(" "),
      ),
    );
  }
  answer.verdict = exceeds
    ? "not-with-current-itinerary"
    : unknown
      ? "unknown"
      : "provisional";
  answer.assumptions.push(
    "Subtracts the selected delay from existing known margins; the airline schedule and saved calendar are unchanged.",
  );
  answer.followups.push(
    "Use Flight change to compare reviewed alternatives if the delay is actually reported.",
  );
  return answer;
}
