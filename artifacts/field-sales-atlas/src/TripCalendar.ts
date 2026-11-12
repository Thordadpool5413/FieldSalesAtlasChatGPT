import type { TripWorkspace } from "../shared/travel/companion";
function escape(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}
function fold(line: string) {
  const parts: string[] = [];
  let part = "",
    size = 0;
  for (const char of line) {
    const length = new TextEncoder().encode(char).length;
    if (size + length > 75) {
      parts.push(part);
      part = " ";
      size = 1;
    }
    part += char;
    size += length;
  }
  parts.push(part);
  return parts.join("\r\n");
}
function instant(value: string) {
  if (!Number.isFinite(Date.parse(value)))
    throw Error("A calendar time is unresolved.");
  return new Date(value)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}
export async function tripCalendar(
  snapshot: TripWorkspace,
  workspaceId: string,
) {
  const valid = snapshot.timeline.filter(
    (event) =>
      event.startAt &&
      Number.isFinite(Date.parse(event.startAt)) &&
      (!event.endAt ||
        (Number.isFinite(Date.parse(event.endAt)) &&
          Date.parse(event.endAt) > Date.parse(event.startAt))),
  );
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Field Sales Atlas//Reviewed Trip//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  for (const event of valid) {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(
        workspaceId + "|" + snapshot.plan.id + "|" + event.id,
      ),
    );
    const uid = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    lines.push(
      "BEGIN:VEVENT",
      "UID:" + uid + "@field-sales-atlas",
      "SEQUENCE:" + snapshot.workspaceRevision,
      "DTSTAMP:" + instant(snapshot.checkedAt),
      "DTSTART:" + instant(event.startAt!),
      ...(event.endAt ? ["DTEND:" + instant(event.endAt)] : []),
      "SUMMARY:" + escape(event.title),
      "DESCRIPTION:" +
        escape(
          event.detail +
            "\n" +
            (event.basis === "traveler"
              ? "Traveler-supplied itinerary; airline status unverified."
              : "Saved workspace appointment; acceptance is not independently verified."),
        ),
      "STATUS:TENTATIVE",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return {
    content: lines.map(fold).join("\r\n") + "\r\n",
    count: valid.length,
    skipped: snapshot.timeline.length - valid.length,
  };
}
