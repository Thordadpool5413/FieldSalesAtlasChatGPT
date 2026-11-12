import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { db } from "../runtime/sdk";
import type { TripEvent } from "../../shared/travel/companion";

export type CalendarProvider = "google" | "microsoft";
type Tokens = {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
};
export type CalendarConnection = {
  id: string;
  workspaceId: string;
  trainerId: string;
  provider: CalendarProvider;
  box: string;
  version: string;
  connectedAt: string;
};
export const connectionTable = "atlas_calendar_connections_v1";
const mappingTable = "atlas_calendar_event_mapping_v1";
export function publicOrigin() {
  const url = new URL(
    process.env.ATLAS_PUBLIC_URL || "https://field-sales-atlas.replit.app",
  );
  if (
    (url.protocol !== "https:" &&
      !(process.env.NODE_ENV === "test" && url.hostname === "127.0.0.1")) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw Error("Set ATLAS_PUBLIC_URL to the HTTPS app origin.");
  return url.origin;
}
function masterKey() {
  const value = process.env.ATLAS_CONNECTION_ENCRYPTION_KEY || "";
  if (!/^[a-f0-9]{64}$/i.test(value))
    throw Error("Configure the connection encryption key in Replit Secrets.");
  return Buffer.from(value, "hex");
}
export function sealConnection(value: unknown, context: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  cipher.setAAD(Buffer.from(context));
  const body = Buffer.concat([
    cipher.update(JSON.stringify(value)),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}
export function openConnection<T>(value: string, context: string): T {
  const bytes = Buffer.from(value, "base64"),
    decipher = createDecipheriv(
      "aes-256-gcm",
      masterKey(),
      bytes.subarray(0, 12),
    );
  decipher.setAuthTag(bytes.subarray(12, 28));
  decipher.setAAD(Buffer.from(context));
  return JSON.parse(
    Buffer.concat([
      decipher.update(bytes.subarray(28)),
      decipher.final(),
    ]).toString(),
  );
}
export function calendarConfig(provider: CalendarProvider) {
  const prefix = provider === "google" ? "ATLAS_GOOGLE_" : "ATLAS_MICROSOFT_";
  const clientId = process.env[prefix + "CLIENT_ID"],
    clientSecret = process.env[prefix + "CLIENT_SECRET"];
  const redirect =
    publicOrigin() + "/api/travel/calendar/oauth/" + provider + "/callback";
  return {
    clientId,
    clientSecret,
    redirect,
    configured:
      !!clientId &&
      !!clientSecret &&
      /^[a-f0-9]{64}$/i.test(process.env.ATLAS_CONNECTION_ENCRYPTION_KEY || ""),
  };
}
export function tokenUrl(provider: CalendarProvider) {
  return provider === "google"
    ? "https://oauth2.googleapis.com/token"
    : "https://login.microsoftonline.com/common/oauth2/v2.0/token";
}
export function calendarScope(provider: CalendarProvider) {
  return provider === "google"
    ? "https://www.googleapis.com/auth/calendar.events.owned"
    : "offline_access Calendars.ReadWrite";
}
export async function exchangeToken(
  provider: CalendarProvider,
  params: Record<string, string>,
): Promise<Tokens> {
  const config = calendarConfig(provider);
  const response = await fetch(tokenUrl(provider), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      ...params,
      client_id: config.clientId!,
      client_secret: config.clientSecret!,
    }),
    signal: AbortSignal.timeout(9000),
    redirect: "error",
  });
  if (!response.ok)
    throw Error(
      "Calendar authorization needs reconnecting. No calendar changes were made by this request.",
    );
  const body = await response.json();
  if (
    typeof body.access_token !== "string" ||
    !body.access_token ||
    body.access_token.length > 16384 ||
    (body.refresh_token !== undefined &&
      (typeof body.refresh_token !== "string" ||
        !body.refresh_token ||
        body.refresh_token.length > 16384)) ||
    !Number.isFinite(body.expires_in) ||
    body.expires_in < 1
  )
    throw Error("Invalid calendar token response. Reconnect the calendar.");
  return {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    expires_at: Date.now() + body.expires_in * 1000,
  };
}
async function accessToken(connection: CalendarConnection) {
  const [current] = await db.get<CalendarConnection>(
    connectionTable,
    [connection.id],
    { consistent: true },
  );
  if (!current) throw Error("This calendar was disconnected.");
  connection = current;
  const tokens = openConnection<Tokens>(connection.box, connection.id);
  if (tokens.expires_at > Date.now() + 60000) return tokens.access_token;
  if (!tokens.refresh_token)
    throw Error("Reconnect the calendar to renew access.");
  const next = await exchangeToken(connection.provider, {
    grant_type: "refresh_token",
    refresh_token: tokens.refresh_token,
  });
  next.refresh_token ||= tokens.refresh_token;
  const [updated] = await db.tx.update(
    connectionTable,
    [
      {
        id: connection.id,
        if: { version: connection.version },
        record: {
          box: sealConnection(next, connection.id),
          version: randomUUID(),
        },
      },
    ],
    { patch: true },
  );
  if (!updated)
    throw Error("Calendar access changed during refresh. Reopen the preview.");
  return next.access_token;
}
export async function calendarRequest(
  connection: CalendarConnection,
  path: string,
  options: { method?: string; body?: unknown; etag?: string } = {},
) {
  const origin =
    connection.provider === "google"
      ? "https://www.googleapis.com/calendar/v3"
      : "https://graph.microsoft.com/v1.0";
  const response = await fetch(origin + path, {
    method: options.method || "GET",
    headers: {
      Authorization: "Bearer " + (await accessToken(connection)),
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.etag ? { "If-Match": options.etag } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    signal: AbortSignal.timeout(9000),
    redirect: "error",
  });
  if (response.status === 404) return null;
  if (response.status === 412)
    throw Error(
      "This calendar event changed outside Atlas. Reopen the preview before updating it.",
    );
  if (!response.ok)
    throw Error(
      "Calendar request returned HTTP " +
        response.status +
        ". Review the connection and retry.",
    );
  const text = await response.text();
  if (text.length > 2000000)
    throw Error("The calendar response exceeds the supported size.");
  const body = JSON.parse(text);
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw Error("The calendar response did not contain an event object.");
  return body as Record<string, any>;
}
export const calendarEventKey = (
  workspaceId: string,
  reportId: string,
  eventId: string,
) =>
  createHash("sha256")
    .update(workspaceId + "|" + reportId + "|" + eventId)
    .digest("hex");
export async function mappedEvent(connection: CalendarConnection, key: string) {
  if (connection.provider === "google") return key;
  const [saved] = await db.get<{ eventId: string }>(mappingTable, [
    connection.id + "|" + key,
  ]);
  return saved?.eventId;
}
export async function saveMapping(
  connection: CalendarConnection,
  key: string,
  eventId: string,
) {
  await db.tx.update(mappingTable, [
    { id: connection.id + "|" + key, record: { eventId } },
  ]);
}
export function eventPath(provider: CalendarProvider, eventId?: string) {
  const base =
    provider === "google" ? "/calendars/primary/events" : "/me/events";
  return base + (eventId ? "/" + encodeURIComponent(eventId) : "");
}
export function eventBody(
  provider: CalendarProvider,
  event: TripEvent,
  key: string,
) {
  const description =
    event.detail +
    "\nSaved planning fields from Field Sales Atlas. Airline status and appointment acceptance require separate verification.";
  if (provider === "google")
    return {
      summary: event.title,
      description,
      start: { dateTime: event.startAt },
      end: { dateTime: event.endAt },
      status: "tentative",
      extendedProperties: { private: { atlasEventKey: key } },
    };
  return {
    subject: event.title,
    body: { contentType: "text", content: description },
    start: { dateTime: event.startAt!.replace(/Z$/, ""), timeZone: "UTC" },
    end: { dateTime: event.endAt!.replace(/Z$/, ""), timeZone: "UTC" },
    showAs: "tentative",
    transactionId: [
      key.slice(0, 8),
      key.slice(8, 12),
      key.slice(12, 16),
      key.slice(16, 20),
      key.slice(20, 32),
    ].join("-"),
  };
}
