import { bookingForSavedFlights } from "../src/BookingHandoff";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  privateSnapshot,
  encryptTravel,
  decryptTravel,
} from "../src/PrivateTravelSyncData";
import { validExperience } from "../src/TravelExperienceData";
import {
  summarizeExperiences,
  type TripWorkspace,
  type TravelExperience,
} from "../shared/travel/companion";
import { tripCalendar } from "../src/TripCalendar";
import { tripQuestionIntent } from "../shared/travel/questions";
import type { BookedFlight } from "../src/BookedFlightLogic";

const booking: BookedFlight = {
  id: "reviewed-itinerary",
  trainerId: "trainer_a",
  verified: true,
  source: "manual",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  legs: [
    {
      id: "leg1",
      carrier: "AA",
      flightNumber: "10",
      origin: "MIA",
      destination: "MCO",
      departDate: "2026-12-07",
      departTime: "06:00",
      arriveDate: "2026-12-07",
      arriveTime: "07:00",
      departureZone: "America/New_York",
      arrivalZone: "America/New_York",
    },
  ],
};
const measurement: TravelExperience = {
  id: "measured-1",
  trainerId: "trainer_a",
  airport: "MCO",
  date: "2026-10-01",
  kind: "security",
  minutes: 23,
  lane: "standard",
  recordedAt: "2026-10-02T12:00:00Z",
};
test("encrypted transfer excludes raw booking data and rejects the wrong passphrase, workspace, trainer and tampering", async () => {
  const snapshot = privateSnapshot(
    "trainer_a",
    [
      {
        ...booking,
        confirmationNumber: "PRIVATE",
        rawText: "PRIVATE",
        passenger: "PRIVATE",
      } as BookedFlight,
      { ...booking, id: "partner", trainerId: "trainer_b" },
      { ...booking, id: "unreviewed", verified: false },
    ],
    [measurement],
  );
  assert.equal(snapshot.bookings.length, 1);
  assert.equal(JSON.stringify(snapshot).includes("PRIVATE"), false);
  const envelope = await encryptTravel(
    snapshot,
    "a long private passphrase",
    "workspace-one",
  );
  assert.equal(JSON.stringify(envelope).includes("MCO"), false);
  assert.equal(
    (
      await decryptTravel(
        envelope,
        "a long private passphrase",
        "workspace-one",
        "trainer_a",
      )
    ).bookings[0].legs[0].origin,
    "MIA",
  );
  await assert.rejects(
    decryptTravel(
      envelope,
      "another long passphrase",
      "workspace-one",
      "trainer_a",
    ),
    /Could not unlock/,
  );
  await assert.rejects(
    decryptTravel(
      envelope,
      "a long private passphrase",
      "workspace-two",
      "trainer_a",
    ),
    /Could not unlock/,
  );
  await assert.rejects(
    decryptTravel(
      envelope,
      "a long private passphrase",
      "workspace-one",
      "trainer_b",
    ),
    /Could not unlock/,
  );
  await assert.rejects(
    decryptTravel(
      { ...envelope, ciphertext: "AAAA" + envelope.ciphertext.slice(4) },
      "a long private passphrase",
      "workspace-one",
      "trainer_a",
    ),
    /Could not unlock/,
  );
});
test("personal benchmarks require five real comparable observations, retaining airport, trainer, lane and date boundaries", () => {
  const rows = Array.from({ length: 5 }, (_, index) => ({
    ...measurement,
    id: "m" + index,
    minutes: 10 + index * 10,
  }));
  assert.equal(
    summarizeExperiences(rows.slice(0, 4), measurement, "2026-11-12")
      .medianMinutes,
    null,
  );
  const summary = summarizeExperiences(
    [
      ...rows,
      {
        ...measurement,
        id: "wrong-seat",
        trainerId: "trainer_b",
        minutes: 500,
      },
      { ...measurement, id: "old", date: "2025-01-01", minutes: 500 },
      { ...measurement, id: "lane", lane: "precheck", minutes: 500 },
    ],
    measurement,
    "2026-11-12",
  );
  assert.equal(summary.count, 5);
  assert.equal(summary.medianMinutes, 30);
  assert.equal(summary.upperMinutes, 40);
  assert.equal(validExperience({ ...measurement, date: "2026-02-30" }), false);
  assert.equal(validExperience({ ...measurement, date: "2099-01-01" }), false);
  assert.equal(validExperience({ ...measurement, minutes: 0 }), false);
});
test("calendar export uses resolved UTC times, stable opaque IDs, UTF-8 folding and escaped text; it omits unresolved events", async () => {
  const snapshot = {
    checkedAt: "2026-11-12T12:00:00Z",
    workspaceRevision: 7,
    plan: { id: "plan-one" },
    timeline: [
      {
        id: "flight-one",
        trainerId: "trainer_a",
        kind: "flight",
        title:
          "A long international journey ✈ ".repeat(6) +
          ", review; now\nnew line",
        startAt: "2026-11-01T06:30:00Z",
        endAt: "2026-11-01T08:00:00Z",
        localDate: "2026-11-01",
        detail: "Traveler reviewed fields",
        basis: "traveler",
      },
      {
        id: "unknown",
        title: "Unresolved appointment",
        localDate: "2026-11-01",
        detail: "No time",
        basis: "workspace",
      },
    ],
  } as TripWorkspace;
  const first = await tripCalendar(snapshot, "workspace-private-id"),
    second = await tripCalendar(
      { ...snapshot, workspaceRevision: 8 },
      "workspace-private-id",
    );
  assert.equal(first.count, 1);
  assert.equal(first.skipped, 1);
  assert.ok(first.content.includes("DTSTART:20261101T063000Z"));
  assert.ok(first.content.includes("STATUS:TENTATIVE"));
  assert.equal(
    first.content.match(/UID:[^\r]+/)![0],
    second.content.match(/UID:[^\r]+/)![0],
  );
  assert.equal(first.content.includes("workspace-private-id"), false);
  assert.ok(
    first.content
      .split("\r\n")
      .every((line) => new TextEncoder().encode(line).length <= 75),
  );
  assert.match(first.content, /\\, review\\;/);
});
test("assistant intent routing keeps readiness and arithmetic delay questions distinct from deadline calculation", () => {
  assert.equal(tripQuestionIntent("What still needs confirming?"), "readiness");
  assert.equal(
    tripQuestionIntent("Which airport has less driving?"),
    "airports",
  );
  assert.equal(
    tripQuestionIntent("What if our flight is delayed 30 minutes?"),
    "delay",
  );
  assert.equal(tripQuestionIntent("Can we get home Thursday?"), "deadline");
});

test("saved itinerary fields open a reusable private review draft without auto-confirming the reservation", () => {
  const legs = booking.legs.map((leg) => ({
    ...leg,
    trainerId: "trainer_a" as const,
  }));
  const draft = bookingForSavedFlights("trainer_a", legs, []);
  assert.equal(draft.verified, false);
  assert.equal(draft.review, undefined);
  assert.equal(draft.legs[0].departTime, booking.legs[0].departTime);
  const reused = bookingForSavedFlights("trainer_a", legs, [draft]);
  assert.equal(reused.id, draft.id);
});
