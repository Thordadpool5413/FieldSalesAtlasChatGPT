import { useEffect, useRef, useState } from "react";
import {
  CloudDownload,
  CloudUpload,
  LockKeyhole,
  RefreshCw,
} from "lucide-react";
import { useOp } from "./Operations";
import { api } from "./workspaceApi";
import { readBookedFlights, storeBookedFlights } from "./BookedFlightLogic";
import {
  readTravelExperiences,
  storeTravelExperiences,
} from "./TravelExperienceData";
import {
  decryptTravel,
  encryptTravel,
  privateSnapshot,
  type PrivateTravelSnapshot,
  type TravelEnvelope,
} from "./PrivateTravelSyncData";
export default function PrivateTravelSync() {
  const ctx = useOp(),
    scope = ctx.board.team?.id || "",
    trainer = ctx.activeTrainerId;
  const [passphrase, setPassphrase] = useState(""),
    [version, setVersion] = useState<number | null>(null),
    [stamp, setStamp] = useState(""),
    [hasCopy, setHasCopy] = useState(false);
  const [preview, setPreview] = useState<PrivateTravelSnapshot | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [includeExperiences, setIncludeExperiences] = useState(false);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [failure, setFailure] = useState("");
  const serial = useRef(0),
    previewFor = useRef("");
  async function refresh() {
    const id = ++serial.current;
    try {
      const res = await api.get("/api/travel/private-sync");
      if (id === serial.current) {
        setVersion(res.data.version);
        setHasCopy(!!res.data.envelope);
        setStamp(res.data.updatedAt || "");
      }
    } catch (error) {
      if (id === serial.current)
        setFailure(
          error instanceof Error
            ? error.message
            : "Encrypted copy unavailable.",
        );
    }
  }
  useEffect(() => {
    setPassphrase("");
    setPreview(null);
    setSelected([]);
    setVersion(null);
    setHasCopy(false);
    setMessage("");
    setFailure("");
    setBusy(false);
    void refresh();
    return () => {
      serial.current++;
    };
  }, [trainer, scope]);
  async function act(work: () => Promise<void>) {
    if (busy) return;
    const id = serial.current;
    setBusy(true);
    setMessage("");
    setFailure("");
    try {
      await work();
    } catch (error) {
      if (id === serial.current)
        setFailure(
          error instanceof Error
            ? error.message
            : "The encrypted copy could not be updated.",
        );
    } finally {
      if (id === serial.current) setBusy(false);
    }
  }
  async function upload() {
    const token = serial.current;
    if (version === null) return;
    const snapshot = privateSnapshot(
      trainer,
      readBookedFlights(),
      readTravelExperiences(),
    );
    if (!snapshot.bookings.length && !snapshot.experiences.length)
      throw Error(
        "There are no reviewed bookings or measured travel records for this trainer to synchronize.",
      );
    const envelope = await encryptTravel(snapshot, passphrase, scope);
    if (token !== serial.current)
      throw Error("Trainer changed. The encrypted copy was not uploaded.");
    const res = await api.put("/api/travel/private-sync", {
      expectedVersion: version,
      workspaceId: scope,
      trainerId: trainer,
      envelope,
    });
    if (token !== serial.current) return;
    setVersion(res.data.version);
    setHasCopy(true);
    setStamp(res.data.updatedAt);
    setPreview(null);
    setMessage(
      "Encrypted copy saved. Open this workspace on your other device and unlock it with the same passphrase.",
    );
  }
  async function download() {
    const token = serial.current,
      res = await api.get("/api/travel/private-sync");
    if (token !== serial.current) return;
    setVersion(res.data.version);
    setHasCopy(!!res.data.envelope);
    setStamp(res.data.updatedAt || "");
    if (!res.data.envelope)
      throw Error("No encrypted copy has been saved for this trainer.");
    const data = await decryptTravel(
      res.data.envelope as TravelEnvelope,
      passphrase,
      scope,
      trainer,
    );
    if (token !== serial.current) return;
    previewFor.current = scope + "|" + trainer;
    setPreview(data);
    setSelected([]);
    setIncludeExperiences(false);
    setMessage("Unlocked for review. Local records have not changed.");
  }
  function restore() {
    if (!preview) return;
    if (previewFor.current !== scope + "|" + trainer)
      throw Error(
        "The workspace or trainer changed. Unlock the intended copy again before restoring.",
      );
    const bookings = preview.bookings.filter((row) =>
      selected.includes(row.id),
    );
    const priorBookings = readBookedFlights(),
      priorExperiences = readTravelExperiences();
    const nextBookings = [
      ...priorBookings.filter(
        (row) =>
          !bookings.some(
            (next) => next.id === row.id && next.trainerId === row.trainerId,
          ),
      ),
      ...bookings,
    ];
    const nextExperiences = includeExperiences
      ? [
          ...new Map(
            [...priorExperiences, ...preview.experiences].map((row) => [
              row.id,
              row,
            ]),
          ).values(),
        ]
      : priorExperiences;
    if (nextBookings.length > 30 || nextExperiences.length > 200)
      throw Error(
        "The selection exceeds this device’s 30-itinerary or 200-measurement limit. Restore fewer records or remove an old local copy first. Existing records were preserved.",
      );
    try {
      storeBookedFlights(nextBookings);
      if (includeExperiences) storeTravelExperiences(nextExperiences);
    } catch (error) {
      try {
        storeBookedFlights(priorBookings);
        storeTravelExperiences(priorExperiences);
      } catch {
        throw Error(
          "Browser storage failed during restore. Review local bookings and measurements before retrying; your encrypted copy is unchanged.",
        );
      }
      throw error;
    }
    setPreview(null);
    setPassphrase("");
    setMessage(
      "Selected records restored on this device. Open Booked flights to review or attach an itinerary. Your shared calendar was not changed.",
    );
  }
  return (
    <section
      className="my-trip-panel"
      aria-label="Encrypted travel synchronization"
    >
      <header>
        <LockKeyhole size={21} />
        <div>
          <h2>Your travel, on your devices</h2>
          <p>
            Optional encrypted copies of this trainer’s reviewed flight fields
            and measured travel times. Raw confirmations, confirmation codes and
            passenger details are excluded.
          </p>
        </div>
      </header>
      <p>
        Selected trainer: <strong>{ctx.activeTrainer.name}</strong> ·{" "}
        {version === null
          ? "Checking saved copy…"
          : hasCopy
            ? "Encrypted version " + version
            : "No encrypted copy yet"}
        {stamp ? " · Saved " + new Date(stamp).toLocaleString() : ""}
      </p>
      <label>
        Sync passphrase
        <input
          type="password"
          autoComplete="off"
          minLength={12}
          maxLength={256}
          value={passphrase}
          onChange={(event) => setPassphrase(event.target.value)}
        />
      </label>
      <small>
        The passphrase stays in this session. You need the same passphrase and
        workspace link on your other device. Keep it safe; the server cannot
        recover it. Restored records use local browser storage, which is not
        encrypted.
      </small>
      <div className="my-trip-actions">
        <button
          className="op-btn"
          disabled={busy || version === null || passphrase.length < 12}
          onClick={() => void act(upload)}
        >
          <CloudUpload size={16} /> Save encrypted copy
        </button>
        <button
          className="op-btn"
          disabled={busy || version === null || passphrase.length < 12}
          onClick={() => void act(download)}
        >
          <CloudDownload size={16} /> Unlock saved copy
        </button>
        <button
          className="op-btn"
          disabled={busy}
          onClick={() => void refresh()}
        >
          <RefreshCw size={16} /> Check saved version
        </button>
      </div>
      {preview && (
        <div className="my-trip-sync-preview">
          <h3>Review what to restore</h3>
          <p>
            Select each itinerary deliberately. Selecting an existing local
            itinerary replaces that local copy. Shared journey attachments and
            calendar records are unchanged.
          </p>
          {preview.bookings.map((row) => (
            <label className="journey-check" key={row.id}>
              <input
                type="checkbox"
                checked={selected.includes(row.id)}
                onChange={() =>
                  setSelected((old) =>
                    old.includes(row.id)
                      ? old.filter((id) => id !== row.id)
                      : [...old, row.id],
                  )
                }
              />
              {row.legs
                .map((leg) => leg.origin + " → " + leg.destination)
                .join(" · ")}{" "}
              · {row.legs[0]?.departDate}
            </label>
          ))}
          {!!preview.experiences.length && (
            <label className="journey-check">
              <input
                type="checkbox"
                checked={includeExperiences}
                onChange={(event) =>
                  setIncludeExperiences(event.target.checked)
                }
              />{" "}
              Merge {preview.experiences.length} measured travel records
            </label>
          )}
          <button
            className="op-btn primary"
            disabled={!selected.length && !includeExperiences}
            onClick={() => {
              try {
                restore();
              } catch (error) {
                setFailure(
                  error instanceof Error
                    ? error.message
                    : "Browser storage could not be updated. Keep the encrypted copy and retry.",
                );
              }
            }}
          >
            Restore reviewed selections
          </button>
        </div>
      )}
      {busy && <p role="status">Securing your travel copy…</p>}
      {message && <p role="status">{message}</p>}
      {failure && (
        <p role="alert" className="journey-alert">
          {failure}
        </p>
      )}
      {hasCopy && (
        <details>
          <summary>Remove the encrypted server copy</summary>
          <p>
            This removes the encrypted snapshot for the selected trainer. Local
            bookings and shared journeys remain available.
          </p>
          <button
            className="op-btn"
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(
                  "Remove this trainer’s encrypted server copy? Local records will remain.",
                )
              )
                void act(async () => {
                  const token = serial.current,
                    res = await api.delete("/api/travel/private-sync", {
                      expectedVersion: version,
                      workspaceId: scope,
                      trainerId: trainer,
                    });
                  if (token !== serial.current) return;
                  setVersion(res.data.version);
                  setHasCopy(false);
                  setStamp("");
                  setPreview(null);
                  setMessage(
                    "Encrypted server copy removed. Local and shared trip records were preserved.",
                  );
                });
            }}
          >
            Remove encrypted copy
          </button>
        </details>
      )}
    </section>
  );
}
