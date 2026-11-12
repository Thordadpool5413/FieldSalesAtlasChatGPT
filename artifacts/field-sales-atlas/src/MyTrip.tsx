import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  MapPin,
  Plane,
  RefreshCw,
  Route,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useOp } from "./Operations";
import { api } from "./workspaceApi";
import { readBookedFlights, storeBookedFlights } from "./BookedFlightLogic";
import {
  bookingForSavedFlights,
  reviewedBookings,
  selectedBookingFlights,
} from "./BookingHandoff";
import BookingPicker from "./BookingPicker";
import type { PlanSummary } from "../shared/travel/intelligence";
import type { TripAction, TripWorkspace } from "../shared/travel/companion";
import type { TravelTool } from "./workspaceTools";
import TravelEvidence from "./TravelEvidence";
import JourneyReadinessController from "./JourneyReadinessController";
import TravelIntelligenceDesk from "./TravelIntelligenceDesk";
import IntelligenceGallery from "./IntelligenceGallery";
import { openIntelligenceTool, type FlightTool } from "./intelligenceTools";
import { deviceWorkspaceScope } from "./deviceWorkspace";
import PrivateTravelSync from "./PrivateTravelSync";
import TravelExperienceRecorder from "./TravelExperienceRecorder";
import TripFlightStatus from "./TripFlightStatus";
import TripCalendarConnections from "./TripCalendarConnections";
import TripNotifications from "./TripNotifications";
import { tripCalendar } from "./TripCalendar";
import { today } from "./opsModels";
import "./MyTrip.css";
const stages = {
  prepare: "Prepare for your trip",
  travel: "Travel day",
  field: "Your field visits",
  return: "Your journey home",
  review: "Review the saved schedule",
};
function clock(value: string, zone?: string) {
  try {
    return new Date(value).toLocaleString(undefined, {
      timeZone: zone,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
  } catch {
    return "Time zone needs review";
  }
}
function MyTripWorkspace({ onTool }: { onTool: (tool: TravelTool) => void }) {
  const ctx = useOp();
  const [plans, setPlans] = useState<PlanSummary[]>([]),
    [planId, setPlanId] = useState(
      () => new URLSearchParams(location.search).get("journeyId") || "",
    );
  const [issues, setIssues] = useState<Array<{ id: string; reason: string }>>(
      [],
    ),
    [snapshot, setSnapshot] = useState<TripWorkspace | null>(null),
    [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState(""),
    [message, setMessage] = useState("");
  const [mode, setMode] = useState<"assistant" | "recovery" | null>(() => {
      const value = new URLSearchParams(location.search).get("tripView");
      return value === "assistant" || value === "recovery" ? value : null;
    }),
    [bookingSelection, setBookingSelection] = useState<Record<string, string>>(
      {},
    ),
    [selectedTrips, setSelectedTrips] = useState<string[]>([]);
  const [toolFlight, setToolFlight] = useState("");
  const serial = useRef(0),
    busyRef = useRef(false),
    root = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(Date.now);
  const expired =
    !!snapshot && now - Date.parse(snapshot.checkedAt) > 15 * 60000;
  const current =
    snapshot &&
    snapshot.plan.id === planId &&
    snapshot.workspaceRevision === ctx.board.revision &&
    !expired
      ? snapshot
      : null;
  const toolContextStorage =
    "atlas-trip-tool-context-v1:" +
    deviceWorkspaceScope() +
    ":" +
    planId +
    ":" +
    ctx.activeTrainerId;
  useEffect(() => {
    try {
      setToolFlight(sessionStorage.getItem(toolContextStorage) || "");
    } catch {
      setToolFlight("");
    }
  }, [toolContextStorage]);
  function chooseToolFlight(value: string) {
    setToolFlight(value);
    try {
      sessionStorage.setItem(toolContextStorage, value);
    } catch {
      /* The selection still works for this view. */
    }
  }
  const toolKey = (leg: TripWorkspace["flights"][number]) =>
    [
      leg.trainerId,
      leg.origin,
      leg.destination,
      leg.departDate,
      leg.carrier,
      leg.flightNumber,
    ].join("|");
  const toolLeg =
    current?.flights.find((leg) => toolKey(leg) === toolFlight) ||
    current?.flights.find(
      (leg) =>
        leg.trainerId === ctx.activeTrainerId && leg.departDate >= today(),
    ) ||
    current?.flights.find((leg) => leg.trainerId === ctx.activeTrainerId) ||
    current?.flights[0];
  function openTool(tool: FlightTool) {
    try {
      if (toolLeg)
        sessionStorage.setItem(
          "atlas-guardian-research-v1",
          JSON.stringify({
            workspace: deviceWorkspaceScope(),
            source: "saved-plan",
            origin: toolLeg.origin,
            destination: toolLeg.destination,
            travelDate: toolLeg.departDate,
            carrier: toolLeg.carrier,
            flightNumber: toolLeg.flightNumber,
          }),
        );
      openIntelligenceTool(tool);
    } catch {
      setFailure(
        "Browser session storage is unavailable. Open Intelligence and enter the flight fields manually.",
      );
    }
  }
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const timer = setInterval(tick, 30000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
  useEffect(() => {
    const update = () => {
      const value = new URLSearchParams(location.search).get("tripView");
      setMode(value === "assistant" || value === "recovery" ? value : null);
    };
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  function showMode(value: "assistant" | "recovery" | null) {
    setMode(value);
    const url = new URL(location.href);
    if (planId) url.searchParams.set("journeyId", planId);
    if (value) url.searchParams.set("tripView", value);
    else url.searchParams.delete("tripView");
    history.pushState(history.state, "", url.pathname + url.search + url.hash);
  }
  useEffect(() => {
    const expectedWorkspace = new URLSearchParams(location.search).get(
      "notificationWorkspace",
    );
    if (
      expectedWorkspace &&
      ctx.board.team?.id &&
      expectedWorkspace !== ctx.board.team.id
    ) {
      setLoading(false);
      setFailure(
        "This update belongs to another workspace. Open its original shared workspace link to review the trip.",
      );
      return;
    }
    if (!ctx.board.team?.id) return;
    let active = true;
    setLoading(true);
    setFailure("");
    void api
      .get("/api/travel/journeys")
      .then((res) => {
        if (!active) return;
        if (!Array.isArray(res.data?.plans))
          throw Error("Saved trip data is incomplete.");
        const list = (res.data.plans as PlanSummary[]).sort((a, b) =>
          a.startDate.localeCompare(b.startDate),
        );
        setPlans(list);
        setIssues(res.data.issues || []);
        setPlanId((before) =>
          list.some((plan) => plan.id === before)
            ? before
            : new URLSearchParams(location.search).get("journeyId")
              ? before
              : list.find(
                  (plan) =>
                    plan.endDate >= today() &&
                    plan.trainerIds?.includes(ctx.activeTrainerId),
                )?.id ||
                list.find((plan) => plan.endDate >= today())?.id ||
                list[0]?.id ||
                "",
        );
      })
      .catch((error) => {
        if (active)
          setFailure(
            error instanceof Error
              ? error.message
              : "Trips could not be loaded.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [ctx.board.team?.id, ctx.board.revision, reload]);
  useEffect(() => {
    const expectedWorkspace = new URLSearchParams(location.search).get(
      "notificationWorkspace",
    );
    if (
      expectedWorkspace &&
      ctx.board.team?.id &&
      expectedWorkspace !== ctx.board.team.id
    )
      return;
    const id = ++serial.current;
    setSnapshot(null);
    setBookingSelection({});
    setFailure("");
    if (!planId) return;
    void api
      .get("/api/travel/journeys/" + encodeURIComponent(planId) + "/workspace")
      .then((res) => {
        if (id !== serial.current) return;
        const value = res.data as TripWorkspace;
        if (
          value?.plan?.id !== planId ||
          !Array.isArray(value.timeline) ||
          !Array.isArray(value.actions) ||
          !Array.isArray(value.readiness?.trainers) ||
          !Array.isArray(value.evidence)
        )
          throw Error(
            "The trip response is incomplete. Refresh or check that the app is up to date.",
          );
        setSnapshot(value);
      })
      .catch((error) => {
        if (id === serial.current)
          setFailure(
            error instanceof Error
              ? error.message
              : "Trip readiness could not be loaded.",
          );
      });
    return () => {
      serial.current++;
    };
  }, [planId, ctx.board.revision, reload]);
  function choose(id: string) {
    setPlanId(id);
    setMode(null);
    const url = new URL(location.href);
    url.searchParams.set("journeyId", id);
    url.searchParams.delete("tripView");
    history.replaceState(
      history.state,
      "",
      url.pathname + url.search + url.hash,
    );
  }
  async function action(work: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setFailure("");
    setMessage("");
    try {
      await work();
    } catch (error) {
      setFailure(
        error instanceof Error
          ? error.message
          : "The change could not complete.",
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function updated() {
    await ctx.reload();
    setReload((value) => value + 1);
  }
  function reviewSavedFlights() {
    if (!current) return;
    try {
      const bookings = readBookedFlights(),
        record = bookingForSavedFlights(
          ctx.activeTrainerId,
          current.flights,
          bookings,
        );
      storeBookedFlights([
        record,
        ...bookings.filter((row) => row.id !== record.id),
      ]);
      sessionStorage.setItem("atlas-guardian-open-flight-v1", record.id);
      onTool("booked");
    } catch (error) {
      setFailure(
        error instanceof Error
          ? error.message
          : "The saved flight fields could not be opened.",
      );
    }
  }
  function next(item: TripAction) {
    if (
      item.destination === "booking" &&
      item.trainerId === ctx.activeTrainerId &&
      current?.flights.some((leg) => leg.trainerId === ctx.activeTrainerId)
    ) {
      reviewSavedFlights();
      return;
    }
    if (item.destination === "recovery") {
      showMode("recovery");
      return;
    }
    if (item.destination === "profile") {
      ctx.openTrainers();
      return;
    }
    const target = root.current?.querySelector<HTMLDetailsElement>(
      item.destination === "booking"
        ? ".my-trip-booking"
        : item.destination === "evidence"
          ? ".my-trip-evidence"
          : ".readiness-controls",
    );
    if (target) {
      target.open = true;
      if (item.destination === "requirements") {
        const review = target.querySelector<HTMLDetailsElement>(
          ".readiness-arrangements",
        );
        if (review) review.open = true;
      }
      target.scrollIntoView({ block: "start" });
      target.querySelector<HTMLElement>("summary")?.focus();
    } else if (item.destination === "calendar") ctx.go("calendar");
  }
  async function attach() {
    if (!current) return;
    const context = {
      trainerIds: current.plan.trainerIds || [],
      startDate: current.plan.startDate,
      endDate: current.plan.endDate,
    };
    const attached = selectedBookingFlights(
        readBookedFlights(),
        bookingSelection,
        context,
      ),
      ids = new Set(attached.map((leg) => leg.trainerId));
    await api.post(
      "/api/travel/journeys/" + encodeURIComponent(planId) + "/itinerary",
      {
        flights: [
          ...current.flights.filter((leg) => !ids.has(leg.trainerId)),
          ...attached,
        ],
        expectedItineraryVersion: current.itineraryVersion,
      },
    );
    await updated();
    setMessage(
      "Reviewed flight fields connected to this trip. The saved calendar and airline reservations were not changed.",
    );
  }
  async function calendar() {
    if (!current) return;
    const result = await tripCalendar(current, ctx.board.team!.id);
    if (!result.count)
      throw Error(
        "No events have resolved times. Review your dates, times and time zones first.",
      );
    const url = URL.createObjectURL(
      new Blob([result.content], { type: "text/calendar;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "field-atlas-trip.ics";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage(
      result.count +
        " tentative calendar events exported." +
        (result.skipped
          ? " " +
            result.skipped +
            " events with unresolved times were excluded."
          : "") +
        " Review the file in your calendar. This is an export, not automatic calendar synchronization.",
    );
  }
  const eligible = (ctx.board.trips || []).filter(
    (trip) => trip.status === "Planned" && !trip.scenarioReportId,
  );
  const bookingContext = current
    ? {
        trainerIds: current.plan.trainerIds || [],
        startDate: current.plan.startDate,
        endDate: current.plan.endDate,
      }
    : null;
  if (mode)
    return (
      <TravelIntelligenceDesk
        mode={mode}
        initialPlanId={planId}
        onBack={() => {
          showMode(null);
          setReload((value) => value + 1);
        }}
      />
    );
  return (
    <div className="my-trip" ref={root} aria-label="My Trip workspace">
      <header className="my-trip-header">
        <div>
          <span className="fr-overline">
            <Route size={16} /> YOUR TRIP, CONNECTED
          </span>
          <h1>
            My Trip<span>.</span>
          </h1>
          <p>Both trainers. Your next action. The evidence behind it.</p>
        </div>
        <button
          className="op-btn"
          onClick={() => setReload((value) => value + 1)}
          disabled={busy}
        >
          <RefreshCw size={17} /> Refresh trip
        </button>
      </header>
      {loading && <p role="status">Opening your saved trips…</p>}
      <div className="my-trip-context">
        {" "}
        {!!plans.length && (
          <label className="my-trip-select">
            Saved trip
            <select
              value={planId}
              onChange={(event) => choose(event.target.value)}
              disabled={busy}
            >
              <option value="">Choose a saved trip</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.title} · {plan.startDate}–{plan.endDate}
                </option>
              ))}
            </select>
          </label>
        )}
        {current && toolLeg && (
          <label className="my-trip-select">
            Flight used by the intelligence tools
            <select
              aria-label="Flight used by the intelligence tools"
              value={toolKey(toolLeg)}
              onChange={(event) => chooseToolFlight(event.target.value)}
            >
              {current.flights.map((leg) => (
                <option key={toolKey(leg)} value={toolKey(leg)}>
                  {
                    ctx.trainerProfiles.find(
                      (profile) => profile.id === leg.trainerId,
                    )?.name
                  }{" "}
                  · {leg.carrier}
                  {leg.flightNumber} · {leg.origin} → {leg.destination} ·{" "}
                  {leg.departDate}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <IntelligenceGallery compact headingLevel="h2" onOpen={openTool} />
      {failure && (
        <p className="journey-alert" role="alert">
          {failure}
        </p>
      )}
      {message && (
        <p className="my-trip-message" role="status">
          {message}
        </p>
      )}
      {!!issues.length && (
        <details className="my-trip-panel">
          <summary>Saved trips that need attention</summary>
          {issues.map((issue) => (
            <p key={issue.id}>{issue.reason}</p>
          ))}
          <button className="op-btn" onClick={() => ctx.go("trips")}>
            Review saved itineraries
          </button>
        </details>
      )}
      {!loading && !plans.length && (
        <section className="my-trip-panel my-trip-empty">
          <Route size={28} />
          <h2>Connect your first trip</h2>
          <p>
            Your itinerary, visits and readiness will appear here after a real
            trip is saved. You can import flight details now or plan your visits
            first.
          </p>
          <div className="my-trip-actions">
            <button className="op-btn primary" onClick={() => onTool("travel")}>
              Plan a trip <ArrowRight size={16} />
            </button>
            <button className="op-btn" onClick={() => onTool("booked")}>
              Import booked flights
            </button>
          </div>
        </section>
      )}
      {!!eligible.length && (
        <details className="my-trip-panel">
          <summary>Connect another saved trip</summary>
          <p>
            Select up to one trip per trainer for the same field period. This
            connects their records without scheduling new appointments.
          </p>
          {eligible.map((trip) => (
            <label className="journey-check" key={trip.id}>
              <input
                type="checkbox"
                checked={selectedTrips.includes(trip.id)}
                disabled={
                  !selectedTrips.includes(trip.id) && selectedTrips.length >= 2
                }
                onChange={() =>
                  setSelectedTrips((ids) =>
                    ids.includes(trip.id)
                      ? ids.filter((id) => id !== trip.id)
                      : [...ids, trip.id],
                  )
                }
              />
              {trip.title} · {trip.startDate}–{trip.endDate}
            </label>
          ))}
          <button
            className="op-btn"
            disabled={busy || !selectedTrips.length}
            onClick={() =>
              void action(async () => {
                const res = await api.post("/api/travel/journeys/adopt", {
                  tripIds: selectedTrips,
                });
                choose(res.data.reportId);
                await updated();
              })
            }
          >
            Connect selected saved trips
          </button>
        </details>
      )}
      {expired && (
        <p className="my-trip-message" role="status">
          This timing calculation is more than 15 minutes old. Refresh the trip
          before using its margins.
        </p>
      )}
      {planId && !current && !failure && !expired && (
        <p role="status">
          Calculating current readiness and the shared timeline…
        </p>
      )}
      {current && (
        <>
          <section
            className="my-trip-panel my-trip-next"
            aria-label="Next trip action"
          >
            <span className="fr-overline">{stages[current.stage]}</span>
            <h2>
              {current.actions[0]?.title ||
                "Review your itinerary before travel"}
            </h2>
            <p>
              {current.actions[0]?.reason ||
                "Known timing checks are shown below. Airline status, accepted appointments and later changes still need confirmation."}
            </p>
            <div className="my-trip-actions">
              {current.actions[0] && (
                <button
                  className="op-btn primary"
                  onClick={() => next(current.actions[0])}
                >
                  Review next action <ArrowRight size={16} />
                </button>
              )}
              <button className="op-btn" onClick={() => showMode("assistant")}>
                <Sparkles size={16} /> Ask about this trip
              </button>
              <button className="op-btn" onClick={() => showMode("recovery")}>
                <Plane size={16} /> Report a flight change
              </button>
            </div>
            <small>
              Calculated {clock(current.checkedAt)} · Uses saved flight fields
              and appointments.
            </small>
          </section>
          <section
            className="my-trip-metrics"
            aria-label="Both trainers’ timing margins"
          >
            {current.readiness.trainers.map((trainer) => (
              <article key={trainer.trainerId}>
                <span>{trainer.name}</span>
                <strong>
                  {trainer.minimumMarginMinutes === null
                    ? "Timing incomplete"
                    : trainer.minimumMarginMinutes + " min"}
                </strong>
                <p>
                  Smallest known margin
                  {trainer.limitingStep ? " · " + trainer.limitingStep : ""}
                </p>
                <small>
                  {trainer.unknownCount} checks or timing steps still unresolved
                </small>
              </article>
            ))}
          </section>
          <div className="my-trip-columns">
            <section
              className="my-trip-panel"
              aria-label="Shared trip timeline"
            >
              <header>
                <CalendarDays size={21} />
                <div>
                  <h2>Your shared timeline</h2>
                  <p>
                    Each time keeps its airport or appointment time zone. Flight
                    times are traveler-supplied.
                  </p>
                </div>
              </header>
              <ol className="my-trip-timeline">
                {current.timeline.map((event) => (
                  <li key={event.id}>
                    <span className="my-trip-event-icon">
                      {event.kind === "flight" ? (
                        <Plane size={18} />
                      ) : event.kind === "visit" ? (
                        <MapPin size={18} />
                      ) : (
                        <Clock3 size={18} />
                      )}
                    </span>
                    <div>
                      <span>
                        {ctx.trainerProfiles.find(
                          (profile) => profile.id === event.trainerId,
                        )?.name || "Trainer not assigned"}
                      </span>
                      <h3>{event.title}</h3>
                      <strong>
                        {event.startAt
                          ? clock(event.startAt, event.timeZone)
                          : event.localDate + " · Exact time unresolved"}
                      </strong>
                      <p>{event.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <button
                className="op-btn"
                disabled={busy || !!current.plan.pendingChange}
                onClick={() => void action(calendar)}
              >
                <Download size={16} /> Export reviewed calendar file
              </button>
              <p className="my-trip-small">
                Calendar export uses stable event IDs. Calendar clients handle
                repeated imports differently; review existing events before
                importing again. Connect Google or Outlook below for a reviewed
                update to your own calendar.
              </p>
            </section>
            <section
              className="my-trip-panel"
              aria-label="Trip confirmation checklist"
            >
              <header>
                <ShieldCheck size={21} />
                <div>
                  <h2>What still needs attention</h2>
                  <p>Missing facts stay visible until they are reviewed.</p>
                </div>
              </header>
              {current.actions.length ? (
                <ul className="my-trip-checklist">
                  {current.actions.map((item) => (
                    <li key={item.id}>
                      <span className={"my-trip-priority " + item.priority}>
                        {item.priority === "attention"
                          ? "Timing issue"
                          : "Needs review"}
                      </span>
                      <h3>{item.title}</h3>
                      <p>{item.reason}</p>
                      {!!item.details?.length && (
                        <details>
                          <summary>Show individual checks</summary>
                          <ul>
                            {item.details.map((line, index) => (
                              <li key={index}>{line}</li>
                            ))}
                          </ul>
                        </details>
                      )}
                      <button className="op-btn" onClick={() => next(item)}>
                        Review <ArrowRight size={15} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>
                  <CheckCircle2 size={17} /> No outstanding saved-input checks.
                  This does not confirm airline operations.
                </p>
              )}
              <div className="my-trip-monitor">
                <h3>Airport and weather monitoring</h3>
                <p>
                  {current.monitoring.enabled
                    ? "Enabled · " + current.monitoring.state
                    : "Not enabled for this trip"}
                  {current.monitoring.lastCheckedAt
                    ? " · Last check " + clock(current.monitoring.lastCheckedAt)
                    : ""}
                </p>
                <button
                  className="op-btn"
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      await api.put(
                        "/api/travel/journeys/" +
                          encodeURIComponent(planId) +
                          "/monitoring",
                        {
                          enabled: !current.monitoring.enabled,
                          expectedItineraryVersion: current.itineraryVersion,
                          expectedWorkspaceRevision: current.workspaceRevision,
                        },
                      );
                      setReload((value) => value + 1);
                    })
                  }
                >
                  {current.monitoring.enabled
                    ? "Stop trip monitoring"
                    : "Enable trip monitoring"}
                </button>
                <small>
                  Public airport notices and weather, not verified airline
                  status. Delivery depends on the host’s maintenance schedule.
                </small>
              </div>
            </section>
          </div>
          <details className="my-trip-panel my-trip-booking">
            <summary>Connect reviewed flight details from this device</summary>
            {current.flights.some(
              (leg) => leg.trainerId === ctx.activeTrainerId,
            ) && (
              <button className="op-btn" onClick={reviewSavedFlights}>
                Review {ctx.activeTrainer.name}’s saved flight fields
              </button>
            )}
            <p>
              Reuse the fields already in this plan; ticket and airline checks
              still need your review. Each trainer reviews from their own device
              and trainer seat.
            </p>
            <p>
              Select one itinerary per trainer. This updates flight context and
              recalculates readiness; appointments remain unchanged.
            </p>
            {bookingContext && (
              <BookingPicker
                bookings={reviewedBookings(readBookedFlights(), bookingContext)}
                trainers={ctx.trainerProfiles.filter((profile) =>
                  bookingContext.trainerIds.includes(profile.id),
                )}
                selection={bookingSelection}
                onChange={setBookingSelection}
                onManage={() => onTool("booked")}
                disabled={busy}
              />
            )}
            <button
              className="op-btn primary"
              disabled={
                busy ||
                !Object.keys(bookingSelection).some(
                  (id) => bookingSelection[id],
                ) ||
                !!current.plan.pendingChange
              }
              onClick={() => void action(attach)}
            >
              Connect selected flight fields
            </button>
          </details>
          <JourneyReadinessController
            plan={current.plan}
            revision={ctx.board.revision}
            names={Object.fromEntries(
              ctx.trainerProfiles.map((profile) => [profile.id, profile.name]),
            )}
            onSaved={updated}
          />
          <details className="my-trip-panel my-trip-evidence">
            <summary>Evidence, freshness and limitations</summary>
            <TravelEvidence evidence={current.evidence} />
            <ul>
              {current.limitations.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </details>
          <TripFlightStatus
            trip={current}
            onChanged={updated}
            onRecovery={() => showMode("recovery")}
          />
          <TripCalendarConnections trip={current} />
          <TripNotifications reportId={planId} />
          <details className="my-trip-panel">
            <summary>Your measured travel experience</summary>
            <TravelExperienceRecorder
              key={ctx.activeTrainerId + "|" + current.plan.arrivalAirport}
              airport={current.plan.arrivalAirport}
            />
          </details>
        </>
      )}
      <details className="my-trip-panel">
        <summary>Secure transfer between your devices</summary>
        <PrivateTravelSync key={ctx.activeTrainerId} />
      </details>
    </div>
  );
}

export default function MyTrip(props: { onTool: (tool: TravelTool) => void }) {
  const ctx = useOp();
  return <MyTripWorkspace key={ctx.board.team?.id || "unlinked"} {...props} />;
}
