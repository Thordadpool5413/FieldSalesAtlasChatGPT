import { useEffect, useRef, useState } from "react";
import { Bell, BellOff, Check } from "lucide-react";
import { useOp } from "./Operations";
import { api } from "./workspaceApi";

type Notice = {
  id: string;
  reportId: string;
  createdAt: string;
  readAt?: string;
  title: string;
  detail: string;
};
type Quiet = { start: string; end: string; timeZone: string };
function applicationKey(value: string) {
  const source = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(source, (char) => char.charCodeAt(0));
}
async function supportsPush(worker: ServiceWorker) {
  return new Promise<boolean>((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => {
      channel.port1.close();
      resolve(false);
    }, 1800);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      channel.port1.close();
      resolve(event.data?.tripPush === 1);
    };
    worker.postMessage({ type: "ATLAS_PUSH_CAPABILITY" }, [channel.port2]);
  });
}
export default function TripNotifications({ reportId }: { reportId: string }) {
  const ctx = useOp();
  const [notices, setNotices] = useState<Notice[]>([]),
    [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [quiet, setQuiet] = useState<Quiet>({
    start: "",
    end: "",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  const generation = useRef(0);
  const supported =
    typeof window !== "undefined" &&
    window.isSecureContext &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;
  useEffect(() => {
    const id = ++generation.current;
    setSubscribed(false);
    setQuiet({
      start: "",
      end: "",
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    setNotices([]);
    setMessage("");
    setBusy(false);
    async function load() {
      try {
        const result = await api.get(
          "/api/travel/notifications?reportId=" + encodeURIComponent(reportId),
        );
        if (id === generation.current)
          setNotices(
            Array.isArray(result.data.notices) ? result.data.notices : [],
          );
      } catch {
        if (id === generation.current)
          setMessage(
            "Trip updates could not be loaded. Refresh when connected.",
          );
      }
    }
    void load();
    if (supported)
      void navigator.serviceWorker
        .getRegistration()
        .then(async (registration) => {
          const sub = await registration?.pushManager.getSubscription();
          if (sub) {
            const result = await api.post("/api/travel/push/status", {
              endpoint: sub.endpoint,
            });
            if (id === generation.current) {
              setSubscribed(result.data.subscribed === true);
              if (result.data.quiet) setQuiet(result.data.quiet);
            }
          }
        })
        .catch(() => undefined);
    const visible = () => {
      if (document.visibilityState === "visible") void load();
    };
    const timer = setInterval(visible, 60000);
    document.addEventListener("visibilitychange", visible);
    return () => {
      generation.current++;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [reportId, ctx.activeTrainerId, ctx.board.team?.id, supported]);
  async function enable() {
    if (busy || !supported) return;
    const id = generation.current,
      trainerId = ctx.activeTrainerId,
      workspaceId = ctx.board.team!.id;
    setBusy(true);
    setMessage("");
    try {
      if (
        (quiet.start || quiet.end) &&
        (!quiet.start || !quiet.end || quiet.start === quiet.end)
      )
        throw Error(
          "Choose different start and end times for quiet hours, or leave both empty.",
        );
      const permission = await Notification.requestPermission();
      if (permission !== "granted")
        throw Error(
          "Notifications were not permitted. Trip updates remain available in the app.",
        );
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration?.active || !(await supportsPush(registration.active)))
        throw Error(
          "Save your work and activate the available app update before enabling background alerts.",
        );
      const key = await api.get("/api/travel/push/public-key");
      let sub = await registration.pushManager.getSubscription();
      if (!sub)
        sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationKey(key.data.publicKey),
        });
      if (id !== generation.current) return;
      await api.post("/api/travel/push/subscription", {
        endpoint: sub.endpoint,
        keys: sub.toJSON().keys,
        trainerId,
        workspaceId,
        ...(quiet.start ? { quiet } : {}),
      });
      if (id !== generation.current) return;
      setSubscribed(true);
      setMessage(
        "This device is subscribed. Enable monitoring for your trip to receive material airport or weather updates.",
      );
    } catch (error) {
      if (id === generation.current)
        setMessage(
          error instanceof Error
            ? error.message
            : "This device could not subscribe.",
        );
    } finally {
      if (id === generation.current) setBusy(false);
    }
  }
  async function disable() {
    const id = generation.current,
      trainerId = ctx.activeTrainerId,
      workspaceId = ctx.board.team!.id;
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration(),
        sub = await registration?.pushManager.getSubscription();
      if (id !== generation.current) return;
      if (sub)
        await api.delete("/api/travel/push/subscription", {
          endpoint: sub.endpoint,
          trainerId,
          workspaceId,
        });
      if (id !== generation.current) return;
      setSubscribed(false);
      setMessage(
        "Background alerts stopped for this trainer on this device. Other trainer subscriptions are unchanged.",
      );
    } catch {
      if (id === generation.current)
        setMessage(
          "Could not remove this device subscription. Try again while online.",
        );
    } finally {
      if (id === generation.current) setBusy(false);
    }
  }
  async function markRead(notice: Notice) {
    const id = generation.current;
    try {
      await api.post(
        "/api/travel/notifications/" + encodeURIComponent(notice.id) + "/read",
        {},
      );
      if (id === generation.current)
        setNotices((old) =>
          old.map((row) =>
            row.id === notice.id
              ? { ...row, readAt: new Date().toISOString() }
              : row,
          ),
        );
    } catch {
      if (id === generation.current)
        setMessage("The update could not be marked reviewed.");
    }
  }
  return (
    <section
      className="my-trip-panel"
      aria-label="Trip updates and background alerts"
    >
      <header>
        <Bell size={21} />
        <div>
          <h2>Updates that reach you</h2>
          <p>
            Review airport and weather changes here, with optional background
            notifications on supported devices.
          </p>
        </div>
      </header>
      <details>
        <summary>Optional quiet hours for this device</summary>
        <div className="my-trip-form">
          <label>
            Quiet from
            <input
              type="time"
              value={quiet.start}
              onChange={(event) =>
                setQuiet({ ...quiet, start: event.target.value })
              }
            />
          </label>
          <label>
            Until
            <input
              type="time"
              value={quiet.end}
              onChange={(event) =>
                setQuiet({ ...quiet, end: event.target.value })
              }
            />
          </label>
          <label>
            IANA time zone
            <input
              value={quiet.timeZone}
              onChange={(event) =>
                setQuiet({ ...quiet, timeZone: event.target.value })
              }
            />
          </label>
        </div>
        <p>
          Save by enabling or updating alerts. Updates remain in the app during
          quiet hours; queued notifications expire after 24 hours.
        </p>
      </details>
      <div className="my-trip-actions">
        <button
          className="op-btn"
          disabled={busy || !supported}
          onClick={() => void enable()}
        >
          <Bell size={16} />{" "}
          {subscribed
            ? "Update this device’s alert settings"
            : "Enable background alerts on this device"}
        </button>
        {subscribed && (
          <button
            className="op-btn"
            disabled={busy}
            onClick={() => void disable()}
          >
            <BellOff size={16} /> Stop this device’s alerts
          </button>
        )}
      </div>
      {!supported && (
        <p>
          Background push is unavailable in this browser context. Use a
          supported installed web app; the update list remains available here.
        </p>
      )}
      <p className="my-trip-small">
        Allow notifications only on your own device. Airport/weather monitoring
        must be enabled for the trip. Delivery depends on the maintenance
        schedule, network and browser permissions; push-service acceptance is
        not proof an update was read. Notifications contain only a generic
        prompt to reopen your workspace. Confirm flight-specific changes with
        your airline.
      </p>
      {message && <p role="status">{message}</p>}
      {notices.length ? (
        <ul className="my-trip-checklist">
          {notices.map((notice) => (
            <li key={notice.id}>
              <span className="my-trip-priority">
                {notice.readAt ? "Reviewed by you" : "New update"} ·{" "}
                {new Date(notice.createdAt).toLocaleString()}
              </span>
              <h3>{notice.title}</h3>
              <p>{notice.detail}</p>
              {!notice.readAt && (
                <button
                  className="op-btn"
                  onClick={() => void markRead(notice)}
                >
                  <Check size={15} /> Mark reviewed
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p>
          No trip updates have been recorded. This does not establish normal
          airport or airline operations.
        </p>
      )}
    </section>
  );
}
