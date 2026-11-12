import { useEffect, useRef, useState } from "react";
import { CalendarDays, ExternalLink, Link2, Unlink } from "lucide-react";
import { useOp } from "./Operations";
import { api } from "./workspaceApi";
import type { TripWorkspace } from "../shared/travel/companion";
type Provider = "google" | "microsoft";
type Connection = {
  provider: Provider;
  configured: boolean;
  connected: boolean;
  connectedAt: string | null;
};
type Preview = {
  id: string;
  provider: Provider;
  expiresAt: string;
  items: Array<{
    id: string;
    title: string;
    startAt: string;
    endAt: string;
    action: "create" | "update";
  }>;
  skipped: number;
  limitations: string[];
};
const name = (provider: Provider) =>
  provider === "google" ? "Google Calendar" : "Outlook Calendar";
export default function TripCalendarConnections({
  trip,
}: {
  trip: TripWorkspace;
}) {
  const ctx = useOp(),
    [connections, setConnections] = useState<Connection[]>([]),
    [preview, setPreview] = useState<Preview | null>(null),
    [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [failure, setFailure] = useState("");
  const generation = useRef(0),
    popup = useRef<Window | null>(null);
  async function load() {
    const token = generation.current;
    try {
      const result = await api.get("/api/travel/calendar/connections");
      if (token === generation.current)
        setConnections(result.data.connections || []);
    } catch {
      if (token === generation.current)
        setFailure("Calendar connection status could not be checked.");
    }
  }
  useEffect(() => {
    generation.current++;
    setConnections([]);
    setPreview(null);
    setReviewed(false);
    setMessage("");
    setFailure("");
    setBusy(false);
    void load();
    const done = (event: MessageEvent) => {
      if (
        event.origin !== location.origin ||
        event.source !== popup.current ||
        event.data?.type !== "ATLAS_CALENDAR_CONNECTED"
      )
        return;
      setMessage(
        event.data.ok
          ? "Calendar authorization received. Check the selected connection, then preview your events."
          : "Calendar authorization did not complete.",
      );
      void load();
    };
    window.addEventListener("message", done);
    return () => {
      generation.current++;
      window.removeEventListener("message", done);
    };
  }, [
    ctx.activeTrainerId,
    ctx.board.team?.id,
    trip.workspaceRevision,
    trip.plan.id,
  ]);
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
            : "Calendar request could not complete.",
        );
    } finally {
      if (token === generation.current) setBusy(false);
    }
  }
  function connect(provider: Provider) {
    popup.current = window.open(
      "about:blank",
      "atlas-calendar-connect",
      "popup,width=580,height=760",
    );
    if (!popup.current) {
      setFailure("Allow this sign-in popup, then try connecting again.");
      return;
    }
    const windowRef = popup.current,
      token = generation.current;
    void run(async () => {
      try {
        const result = await api.post(
          "/api/travel/calendar/" + provider + "/connect",
          { workspaceId: ctx.board.team!.id, trainerId: ctx.activeTrainerId },
        );
        if (token !== generation.current) {
          windowRef.close();
          return;
        }
        windowRef.location.href = result.data.authorizationUrl;
      } catch (error) {
        windowRef.close();
        throw error;
      }
    });
  }
  function createPreview(provider: Provider) {
    const token = generation.current;
    setPreview(null);
    setReviewed(false);
    void run(async () => {
      const result = await api.post(
        "/api/travel/journeys/" +
          encodeURIComponent(trip.plan.id) +
          "/calendar/preview",
        {
          provider,
          expectedWorkspaceRevision: trip.workspaceRevision,
          expectedItineraryVersion: trip.itineraryVersion,
        },
      );
      if (token === generation.current) setPreview(result.data);
    });
  }
  return (
    <section className="my-trip-panel" aria-label="Calendar connections">
      <header>
        <CalendarDays size={21} />
        <div>
          <h2>Your calendar, with your review</h2>
          <p>
            Connect {ctx.activeTrainer.name}’s primary calendar. Preview every
            event before creating or updating it. Your partner connects their
            calendar from their own trainer seat.
          </p>
        </div>
      </header>
      <div className="my-trip-metrics">
        {connections.map((connection) => (
          <article key={connection.provider}>
            <h3>{name(connection.provider)}</h3>
            <p>
              {connection.connected
                ? "Authorized · " +
                  new Date(connection.connectedAt!).toLocaleDateString()
                : connection.configured
                  ? "Ready for your authorization"
                  : "App registration needs setup"}
            </p>
            <div className="my-trip-actions">
              {connection.connected ? (
                <>
                  <button
                    className="op-btn"
                    disabled={busy || !!trip.plan.pendingChange}
                    onClick={() => createPreview(connection.provider)}
                  >
                    Preview calendar update
                  </button>
                  <button
                    className="op-btn"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const response = await api.delete(
                          "/api/travel/calendar/" +
                            connection.provider +
                            "/connection",
                          {
                            workspaceId: ctx.board.team!.id,
                            trainerId: ctx.activeTrainerId,
                          },
                        );
                        setMessage(response.data.limitation);
                        setPreview(null);
                        await load();
                      })
                    }
                  >
                    <Unlink size={15} /> Disconnect
                  </button>
                </>
              ) : (
                <button
                  className="op-btn"
                  disabled={busy || !connection.configured}
                  onClick={() => connect(connection.provider)}
                >
                  <Link2 size={15} /> Connect {name(connection.provider)}
                </button>
              )}
            </div>
            {!connection.configured && (
              <p>
                Add this provider’s app credentials and the connection
                encryption key to Replit Secrets.{" "}
                <a
                  href="/resources/connections.html"
                  target="_blank"
                  rel="noreferrer"
                >
                  Setup guide <ExternalLink size={12} />
                </a>
              </p>
            )}
          </article>
        ))}
      </div>
      {preview && (
        <div className="my-trip-sync-preview">
          <h3>Review {name(preview.provider)} changes</h3>
          <p>
            Preview expires {new Date(preview.expiresAt).toLocaleTimeString()}.{" "}
            {preview.skipped} events with incomplete or cutoff-only times were
            excluded.
          </p>
          <ul>
            {preview.items.map((item) => (
              <li key={item.id}>
                <strong>
                  {item.action === "create" ? "Create" : "Update"} ·{" "}
                  {item.title}
                </strong>
                <p>
                  {new Date(item.startAt).toLocaleString()} –{" "}
                  {new Date(item.endAt).toLocaleString()} · Your device time
                  zone
                </p>
              </li>
            ))}
          </ul>
          <ul>
            {preview.limitations.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <label className="journey-check">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(event) => setReviewed(event.target.checked)}
            />{" "}
            I reviewed these events and want this calendar updated.
          </label>
          <button
            className="op-btn primary"
            disabled={
              busy ||
              !reviewed ||
              !preview.items.length ||
              Date.parse(preview.expiresAt) <= Date.now()
            }
            onClick={() =>
              void run(async () => {
                const response = await api.post(
                  "/api/travel/calendar/previews/" +
                    encodeURIComponent(preview.id) +
                    "/apply",
                  { reviewed: true },
                );
                setPreview(null);
                setReviewed(false);
                setMessage(
                  response.data.results
                    .map(
                      (row: {
                        title: string;
                        state: string;
                        reason?: string;
                      }) =>
                        row.title +
                        ": " +
                        (row.state === "saved"
                          ? "saved"
                          : row.reason || "needs review"),
                    )
                    .join(" · ") +
                    " " +
                    response.data.limitation,
                );
              })
            }
          >
            Apply reviewed calendar update
          </button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
      {failure && (
        <p role="alert" className="journey-alert">
          {failure}
        </p>
      )}
      <p className="my-trip-small">
        Calendar tokens are encrypted on the server. Atlas does not invite
        attendees or delete external appointments. The shared workspace link is
        an access capability: use a trainer-specific link and your own trainer
        seat for personal calendar connections. Disconnecting removes Atlas
        access locally; revoke the provider grant in your Google or Microsoft
        account as well.
      </p>
    </section>
  );
}
