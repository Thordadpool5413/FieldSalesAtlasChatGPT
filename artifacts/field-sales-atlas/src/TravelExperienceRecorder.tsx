import { useState } from "react";
import { Clock3, Trash2 } from "lucide-react";
import { useOp } from "./Operations";
import { today } from "./opsModels";
import {
  readTravelExperiences,
  storeTravelExperiences,
  earlierSecurityExperiences,
} from "./TravelExperienceData";
import {
  summarizeExperiences,
  type TravelExperience,
} from "../shared/travel/companion";
const kinds: Record<TravelExperience["kind"], string> = {
  security: "Security screening",
  arrival: "Arrival processing",
  "rental-return": "Rental return",
  "gate-transfer": "Gate transfer",
  "home-drive": "Airport-to-home drive",
};
export default function TravelExperienceRecorder({
  airport,
}: {
  airport: string;
}) {
  const ctx = useOp();
  const [rows, setRows] = useState(readTravelExperiences),
    [code, setCode] = useState(airport),
    [kind, setKind] = useState<TravelExperience["kind"]>("security");
  const [lane, setLane] = useState<"standard" | "precheck">("standard"),
    [date, setDate] = useState(today()),
    [minutes, setMinutes] = useState(""),
    [message, setMessage] = useState("");
  const earlier = earlierSecurityExperiences(
    ctx.board.team?.id || "",
    ctx.activeTrainerId,
  );
  const summary = summarizeExperiences(rows, {
    trainerId: ctx.activeTrainerId,
    airport: code,
    kind,
    lane,
  });
  const own = rows.filter(
    (row) =>
      row.trainerId === ctx.activeTrainerId &&
      row.airport === code &&
      row.kind === kind &&
      (kind !== "security" || row.lane === lane),
  );
  function save(event: React.FormEvent) {
    event.preventDefault();
    const value = Number(minutes);
    if (
      !/^[A-Z]{3}$/.test(code) ||
      !minutes ||
      !Number.isInteger(value) ||
      value < 1 ||
      value > 720 ||
      !date ||
      date > today()
    ) {
      setMessage(
        "Supply an actual airport, past travel date and measured duration from 1 to 720 minutes.",
      );
      return;
    }
    const record: TravelExperience = {
      id: crypto.randomUUID(),
      trainerId: ctx.activeTrainerId,
      airport: code,
      kind,
      lane: kind === "security" ? lane : undefined,
      date,
      minutes: value,
      recordedAt: new Date().toISOString(),
    };
    try {
      const next = [record, ...readTravelExperiences()];
      storeTravelExperiences(next);
      setRows(next);
      setMinutes("");
      setMessage(
        "Your measured time was saved on this device. Use encrypted sync if you want it on another device.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Browser storage could not save the measurement.",
      );
    }
  }
  return (
    <section className="my-trip-panel" aria-label="Personal travel experience">
      <header>
        <Clock3 size={21} />
        <div>
          <h2>Learn from your real trips</h2>
          <p>
            Record elapsed times you actually measured. These personal records
            are separate from public checkpoint estimates and belong to{" "}
            {ctx.activeTrainer.name}.
          </p>
        </div>
      </header>
      <form className="my-trip-form" onSubmit={save}>
        <label>
          Airport
          <input
            required
            maxLength={3}
            pattern="[A-Z]{3}"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
          />
        </label>
        <label>
          What did you measure?
          <select
            value={kind}
            onChange={(event) =>
              setKind(event.target.value as TravelExperience["kind"])
            }
          >
            {Object.entries(kinds).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {kind === "security" && (
          <label>
            Screening lane
            <select
              value={lane}
              onChange={(event) => setLane(event.target.value as typeof lane)}
            >
              <option value="standard">Standard</option>
              <option value="precheck">TSA PreCheck</option>
            </select>
          </label>
        )}
        <label>
          Observed date
          <input
            required
            type="date"
            max={today()}
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
        <label>
          Measured minutes
          <input
            required
            type="number"
            min={1}
            max={720}
            step={1}
            value={minutes}
            onChange={(event) => setMinutes(event.target.value)}
          />
        </label>
        <button className="op-btn primary" type="submit">
          Save measured time
        </button>
      </form>
      <div className="my-trip-metrics">
        <article>
          <span>Comparable records · last year</span>
          <strong>{summary.count}</strong>
        </article>
        <article>
          <span>Your observed median</span>
          <strong>
            {summary.medianMinutes === null
              ? "More history needed"
              : summary.medianMinutes + " min"}
          </strong>
        </article>
        <article>
          <span>80th-percentile observation</span>
          <strong>
            {summary.upperMinutes === null
              ? "More history needed"
              : summary.upperMinutes + " min"}
          </strong>
        </article>
      </div>
      <p>
        {summary.count < 5
          ? "At least five measurements for this trainer, airport, activity and lane are needed before a personal benchmark is shown."
          : "Observed " +
            summary.firstDate +
            " to " +
            summary.lastDate +
            ". Review before using a benchmark as a planning allowance; future timings may differ."}{" "}
        Conditions and time of day can differ. No forecast or automatic schedule
        change is made.
      </p>
      {!!own.length && (
        <details>
          <summary>Review your measurements</summary>
          {own.map((row) => (
            <div className="my-trip-measurement" key={row.id}>
              <span>
                {row.date} · {row.minutes} min
              </span>
              <button
                className="op-btn"
                aria-label={"Delete measurement " + row.id}
                onClick={() => {
                  const next = readTravelExperiences().filter(
                    (item) => item.id !== row.id,
                  );
                  try {
                    storeTravelExperiences(next);
                    setRows(next);
                  } catch {
                    setMessage("Measurement could not be deleted.");
                  }
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </details>
      )}
      {!!earlier.length && (
        <details>
          <summary>Bring in your existing airport security records</summary>
          <p>
            {earlier.length} valid measurements from this trainer’s Security
            &amp; airport tool are available on this device. Import preserves
            their observation dates; the import time is recorded separately.
          </p>
          <button
            className="op-btn"
            onClick={() => {
              try {
                const next = [...readTravelExperiences(), ...earlier];
                storeTravelExperiences(next);
                setRows(next);
                setMessage(
                  "Existing measured security times were imported. Original records were preserved.",
                );
              } catch (error) {
                setMessage(
                  error instanceof Error
                    ? error.message
                    : "Browser storage could not import these records.",
                );
              }
            }}
          >
            Import my existing measurements
          </button>
        </details>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
