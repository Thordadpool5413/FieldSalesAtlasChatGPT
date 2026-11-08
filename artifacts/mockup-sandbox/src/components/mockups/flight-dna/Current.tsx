import { useState } from "react";
import {
  Activity,
  ArrowRight,
  CalendarDays,
  ChevronDown,
  Clock3,
  Compass,
  MapPinned,
  PlaneLanding,
  PlaneTakeoff,
  Radar,
  Route,
  ShieldAlert,
  TicketCheck,
  Users,
} from "lucide-react";
import "./_group.css";

const travelTabs = [
  { label: "Flight DNA", icon: Activity },
  { label: "Booked flights", icon: TicketCheck },
  { label: "Airport & route planner", icon: MapPinned },
  { label: "Itineraries", icon: Route },
  { label: "Our Week", icon: CalendarDays },
  { label: "Coordinate trainers", icon: Users },
];

function localDateValue() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

export function Current() {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [date, setDate] = useState(localDateValue);
  const [connection, setConnection] = useState("");
  const [alternate, setAlternate] = useState("");
  const [connectionMinutes, setConnectionMinutes] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [notice, setNotice] = useState("");
  const valid = /^[A-Z]{3}$/.test(origin.trim()) && /^[A-Z]{3}$/.test(destination.trim());

  const updateCode = (value: string, setter: (next: string) => void) => {
    setter(value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3));
  };

  const previewOnly = () => {
    setNotice("This isolated preview does not request live aviation data or save a booking.");
  };

  return (
    <div className="fda-preview">
      <div className="fda-canvas">
        <div className="fda-topline">
          <div className="fda-brand">
            <Radar size={19} aria-hidden="true" />
            <div>
              <strong>Field Sales Atlas / Travel Intelligence</strong>
              <span>Free FAA, NOAA and historical flight research. No booking required.</span>
            </div>
          </div>
          <div className="fda-source-chip"><i aria-hidden="true" /> PUBLIC SOURCES · NO BOOKING</div>
        </div>

        <nav className="fda-tabs" aria-label="Travel tools">
          {travelTabs.map(({ label, icon: Icon }, index) => (
            <button key={label} type="button" aria-current={index === 0 ? "page" : undefined}>
              <Icon aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <main className="fr-page">
          <h1 className="fr-mobile-title">Flight DNA</h1>

          <header className="fr-hero fs-ref-hero">
            <div className="fr-hero-copy">
              <span className="fr-eyebrow">
                <PlaneTakeoff size={17} aria-hidden="true" />
                FIELD SALES ATLAS / AVIATION INTELLIGENCE
              </span>
              <h1>Flight <span>Intelligence.</span></h1>
              <p>
                Make your next flight decision with more context. Explore historical reliability,
                FAA operations and aviation weather with free public sources.
              </p>
              <button className="fs-guardian-launch" type="button" onClick={previewOnly}>
                <TicketCheck size={16} aria-hidden="true" />
                Already booked? Import your itinerary
                <ArrowRight size={15} aria-hidden="true" />
              </button>
            </div>
            <details className="fs-travel-menu">
              <summary aria-label="Open travel tools">
                <span>Travel tools</span>
                <ChevronDown size={15} aria-hidden="true" />
              </summary>
              <div className="fs-travel-menu-list">
                <button type="button" onClick={previewOnly}>Import booked flight</button>
                <button type="button" onClick={previewOnly}>Plan travel</button>
                <button type="button" onClick={previewOnly}>Saved itineraries</button>
                <button type="button" onClick={previewOnly}>Our week</button>
                <button type="button" onClick={previewOnly}>Two-trainer coordination</button>
              </div>
            </details>
          </header>

          <section
            id="flight-route-composer"
            className="fr-card fr-builder fs-ref-route"
            aria-label="Flight research route and date"
          >
            <div className="fs-route-primary">
              <label>
                <span><PlaneTakeoff aria-hidden="true" /> From</span>
                <input
                  type="text"
                  maxLength={3}
                  placeholder="MCO"
                  aria-label="Departure IATA airport code"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  value={origin}
                  onChange={(event) => updateCode(event.target.value, setOrigin)}
                />
              </label>

              <button
                className="fs-route-swap"
                type="button"
                aria-label="Swap departure and arrival airports"
                title="Swap airports"
                onClick={() => {
                  setOrigin(destination);
                  setDestination(origin);
                }}
              >
                <Route size={19} aria-hidden="true" />
              </button>

              <label>
                <span><PlaneLanding aria-hidden="true" /> To</span>
                <input
                  type="text"
                  maxLength={3}
                  placeholder="ATL"
                  aria-label="Arrival IATA airport code"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  value={destination}
                  onChange={(event) => updateCode(event.target.value, setDestination)}
                />
              </label>

              <label className="fs-route-date">
                <span><Clock3 aria-hidden="true" /> Date</span>
                <input
                  type="date"
                  value={date}
                  aria-label="Travel date for planning and historical context"
                  onChange={(event) => setDate(event.target.value)}
                />
              </label>

              <button className="fr-check-button" type="button" disabled={!valid} onClick={previewOnly}>
                <Radar size={17} aria-hidden="true" />
                Analyze flight
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            </div>

            <div className="fs-route-utilities">
              <button
                type="button"
                className="fs-advanced-toggle"
                aria-expanded={showAdvanced}
                onClick={() => setShowAdvanced((open) => !open)}
              >
                <Compass size={14} aria-hidden="true" />
                {showAdvanced ? "Hide optional airports" : "Add connection, alternative or layover"}
                <ChevronDown size={14} aria-hidden="true" />
              </button>
              <span>Free public aviation research. Not a ticketing or booking service.</span>
            </div>

            {showAdvanced && (
              <div className="fs-advanced-fields">
                <label>
                  Connecting airport
                  <input
                    type="text"
                    maxLength={3}
                    placeholder="ATL"
                    aria-label="Connecting IATA airport code"
                    value={connection}
                    onChange={(event) => updateCode(event.target.value, setConnection)}
                  />
                </label>
                <label>
                  Alternative arrival
                  <input
                    type="text"
                    maxLength={3}
                    placeholder="MDW"
                    aria-label="Alternative IATA airport code"
                    value={alternate}
                    onChange={(event) => updateCode(event.target.value, setAlternate)}
                  />
                </label>
                <label>
                  Connection minutes
                  <input
                    type="number"
                    min={1}
                    max={600}
                    inputMode="numeric"
                    placeholder="65"
                    aria-label="Connection time in minutes"
                    disabled={!connection}
                    value={connection ? connectionMinutes : ""}
                    onChange={(event) => setConnectionMinutes(event.target.value)}
                  />
                </label>
              </div>
            )}

            <details className="fs-offline-tools">
              <summary>
                <ShieldAlert size={15} aria-hidden="true" />
                Offline travel card
                <ChevronDown size={15} aria-hidden="true" />
              </summary>
              <p className="fda-source-note">
                In the app, this section saves a route summary on this device; it does not store a ticket.
              </p>
            </details>

            {notice && <p className="fda-preview-notice" role="status">{notice}</p>}
          </section>

          <details className="fda-evidence">
            <summary>
              <Activity size={15} aria-hidden="true" />
              Explore historical, security and source details
              <ChevronDown size={15} aria-hidden="true" />
            </summary>
            <p className="fda-source-note">
              Airport reference locations, current airport-level reports and historical flight evidence
              are separate data layers. This preview does not show live flight status, schedules or seat availability.
            </p>
          </details>

          <p className="fda-source-note">
            Travel intelligence uses free public sources and saved planning records. It does not sell, reserve or book flights.
            Verify flight-specific details directly with your airline.
          </p>
        </main>
      </div>
    </div>
  );
}
