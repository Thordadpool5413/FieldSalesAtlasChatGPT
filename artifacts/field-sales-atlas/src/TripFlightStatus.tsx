import { useEffect, useRef, useState } from "react";
import { ExternalLink, Plane, RefreshCw } from "lucide-react";
import { useOp } from "./Operations";
import { api } from "./workspaceApi";
import TravelEvidence from "./TravelEvidence";
import type { TripWorkspace } from "../shared/travel/companion";
import type { FlightSnapshot } from "../shared/travel/flightStatus";
type Configuration = {
  configured: boolean;
  keyConfigured?: boolean;
  workspaceApproved?: boolean;
  provider: string;
  backgroundEnabled: boolean;
  limitation: string;
};
type Check = {
  id: string;
  checkedAt: string;
  expiresAt: string;
  flights: FlightSnapshot[];
};
function hasReportedChange(flight: FlightSnapshot) {
  return (
    flight.canceled ||
    (!!flight.replacement &&
      (["departDate", "departTime", "arriveDate", "arriveTime"] as const).some(
        (key) => flight.replacement![key] !== flight.leg[key],
      ))
  );
}
export default function TripFlightStatus({
  trip,
  onChanged,
  onRecovery,
}: {
  trip: TripWorkspace;
  onChanged: () => Promise<void>;
  onRecovery: () => void;
}) {
  const ctx = useOp(),
    [config, setConfig] = useState<Configuration | null>(null),
    [result, setResult] = useState<Check | null>(null),
    [selected, setSelected] = useState<number | null>(null),
    [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [failure, setFailure] = useState(""),
    [now, setNow] = useState(Date.now),
    generation = useRef(0);
  useEffect(() => {
    const token = ++generation.current;
    setResult(null);
    setReviewed(false);
    setSelected(null);
    setFailure("");
    setMessage("");
    setBusy(false);
    void api
      .get("/api/travel/flight-status/connection")
      .then((response) => {
        if (token === generation.current) setConfig(response.data);
      })
      .catch(() => {
        if (token === generation.current)
          setFailure("Flight provider connection status could not be checked.");
      });
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => {
      generation.current++;
      clearInterval(timer);
    };
  }, [trip.plan.id, trip.workspaceRevision, ctx.board.team?.id]);
  async function run(work: () => Promise<void>) {
    if (busy) return;
    const token = generation.current;
    setBusy(true);
    setMessage("");
    setFailure("");
    try {
      await work();
    } catch (error) {
      if (token === generation.current)
        setFailure(
          error instanceof Error
            ? error.message
            : "Flight status could not be checked.",
        );
    } finally {
      if (token === generation.current) setBusy(false);
    }
  }
  const current = result && Date.parse(result.expiresAt) > now ? result : null;
  const selectedFlight =
    current && selected !== null ? current.flights[selected] : null;
  return (
    <section
      className="my-trip-panel"
      aria-label="Flight-specific provider status"
    >
      <header>
        <Plane size={21} />
        <div>
          <h2>Your actual flight, checked separately</h2>
          <p>
            {config?.configured
              ? "Authorized provider key configured. Run a check to validate the exact operating flight."
              : "Flight-specific status is not connected. Free airport and weather feeds cannot confirm your flight."}
          </p>
        </div>
      </header>
      {config?.configured ? (
        <>
          <div className="my-trip-actions">
            <button
              className="op-btn"
              disabled={busy || !trip.flights.length}
              onClick={() => {
                const token = generation.current;
                void run(async () => {
                  const response = await api.post(
                    "/api/travel/journeys/" +
                      encodeURIComponent(trip.plan.id) +
                      "/flight-status/check",
                    {
                      expectedItineraryVersion: trip.itineraryVersion,
                      expectedWorkspaceRevision: trip.workspaceRevision,
                    },
                  );
                  if (token === generation.current) {
                    setResult(response.data);
                    setNow(Date.now());
                    setSelected(null);
                    setReviewed(false);
                  }
                });
              }}
            >
              <RefreshCw size={16} />{" "}
              {busy ? "Checking provider…" : "Check flight-specific status"}
            </button>
            <button
              className="op-btn"
              disabled={busy || !config.backgroundEnabled}
              onClick={() =>
                void run(async () => {
                  await api.put(
                    "/api/travel/journeys/" +
                      encodeURIComponent(trip.plan.id) +
                      "/monitoring",
                    {
                      enabled: true,
                      flightStatus: !trip.monitoring.flightStatusEnabled,
                      expectedWorkspaceRevision: trip.workspaceRevision,
                      expectedItineraryVersion: trip.itineraryVersion,
                    },
                  );
                  await onChanged();
                })
              }
            >
              {trip.monitoring.flightStatusEnabled
                ? "Stop flight-provider monitoring"
                : "Enable flight-provider monitoring"}
            </button>
          </div>
          <p className="my-trip-small">
            Provider usage may be billed by your account. Checks reuse validated
            snapshots for up to five minutes. Background flight checks require
            the host polling policy, trip opt-in and a delivered maintenance
            schedule.{" "}
            {config.backgroundEnabled
              ? "Host polling policy enabled."
              : "Host polling policy is not enabled."}
          </p>
        </>
      ) : (
        <p>
          <a
            href="/resources/connections.html"
            target="_blank"
            rel="noreferrer"
          >
            Set up authorized flight-status access <ExternalLink size={13} />
          </a>{" "}
          · You can still import and review your itinerary and report
          airline-confirmed changes manually.
        </p>
      )}
      {config && !config.configured && (
        <details>
          <summary>Workspace approval for provider setup</summary>
          <p>
            Only deployment-approved workspaces can use the paid provider. Add
            this non-secret workspace ID to ATLAS_AEROAPI_WORKSPACE_IDS in
            Replit Secrets: <code>{ctx.board.team?.id}</code>. Keep the account
            key in Secrets as well.
          </p>
        </details>
      )}
      {result && !current && (
        <p role="status">
          This provider snapshot expired. Run another check before using its
          status or reporting a change.
        </p>
      )}
      {current && (
        <>
          <p>
            Retrieved {new Date(current.checkedAt).toLocaleString()}. Operating
            identifiers, airport pair and local departure date must match;
            confirmation codes are not queried.
          </p>
          <div className="my-trip-metrics">
            {current.flights.map((flight, index) => (
              <article key={flight.id}>
                <h3>
                  {flight.leg.carrier}
                  {flight.leg.flightNumber} · {flight.leg.origin} →{" "}
                  {flight.leg.destination}
                </h3>
                <strong>{flight.status}</strong>
                <p>
                  {flight.state === "matched"
                    ? "Exact instance matched"
                    : "No usable exact match"}
                </p>
                {flight.estimatedDeparture && (
                  <p>
                    Estimated departure:{" "}
                    {new Date(flight.estimatedDeparture).toLocaleString()}
                  </p>
                )}
                {flight.estimatedArrival && (
                  <p>
                    Estimated arrival:{" "}
                    {new Date(flight.estimatedArrival).toLocaleString()}
                  </p>
                )}
                {flight.actualDeparture && (
                  <p>
                    Actual departure reported:{" "}
                    {new Date(flight.actualDeparture).toLocaleString()}
                  </p>
                )}
                {flight.actualArrival && (
                  <p>
                    Actual arrival reported:{" "}
                    {new Date(flight.actualArrival).toLocaleString()}
                  </p>
                )}
                {(flight.gate || flight.terminal) && (
                  <p>
                    Departure terminal {flight.terminal || "not supplied"} ·
                    Gate {flight.gate || "not supplied"}
                  </p>
                )}
                {(flight.arrivalGate || flight.arrivalTerminal) && (
                  <p>
                    Arrival terminal {flight.arrivalTerminal || "not supplied"}{" "}
                    · Gate {flight.arrivalGate || "not supplied"}
                  </p>
                )}
                <details>
                  <summary>Source, age and limitations</summary>
                  <TravelEvidence evidence={[flight.evidence]} />
                </details>
                {flight.state === "matched" && hasReportedChange(flight) && (
                  <button
                    className="op-btn"
                    disabled={busy || !!trip.plan.pendingChange}
                    onClick={() => {
                      setSelected(index);
                      setReviewed(false);
                    }}
                  >
                    Review this reported change
                  </button>
                )}
              </article>
            ))}
          </div>
          {selectedFlight && (
            <div className="my-trip-sync-preview">
              <h3>Review the exact flight change</h3>
              <p>
                {selectedFlight.leg.carrier}
                {selectedFlight.leg.flightNumber} · {selectedFlight.leg.origin}{" "}
                → {selectedFlight.leg.destination} ·{" "}
                {selectedFlight.leg.departDate}
              </p>
              {selectedFlight.canceled ? (
                <p>
                  The provider reports a cancellation. No replacement flight is
                  assumed.
                </p>
              ) : (
                <p>
                  Replacement local times:{" "}
                  {selectedFlight.replacement?.departDate}{" "}
                  {selectedFlight.replacement?.departTime} →{" "}
                  {selectedFlight.replacement?.arriveDate}{" "}
                  {selectedFlight.replacement?.arriveTime}. Review both airport
                  time zones.
                </p>
              )}
              <label className="journey-check">
                <input
                  type="checkbox"
                  checked={reviewed}
                  onChange={(event) => setReviewed(event.target.checked)}
                />{" "}
                I reviewed this flight instance and want to compare its
                consequences for the saved plan.
              </label>
              <button
                className="op-btn primary"
                disabled={!reviewed || busy}
                onClick={() =>
                  void run(async () => {
                    await api.post(
                      "/api/travel/flight-status/checks/" +
                        encodeURIComponent(current.id) +
                        "/report-change",
                      { legIndex: selected, reviewed: true },
                    );
                    await onChanged();
                    onRecovery();
                  })
                }
              >
                Report for recovery review
              </button>
              <p>
                Reporting does not rebook flights or update calendar
                appointments.
              </p>
            </div>
          )}
        </>
      )}
      {message && <p role="status">{message}</p>}
      {failure && (
        <p className="journey-alert" role="alert">
          {failure}
        </p>
      )}
    </section>
  );
}
