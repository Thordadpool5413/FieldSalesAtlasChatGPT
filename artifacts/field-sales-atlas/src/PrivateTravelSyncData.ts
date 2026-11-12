import { sanitizedBooking, type BookedFlight } from "./BookedFlightLogic";
import { validExperience } from "./TravelExperienceData";
import type { TravelExperience } from "../shared/travel/companion";
export type PrivateTravelSnapshot = {
  format: 1;
  trainerId: "trainer_a" | "trainer_b";
  bookings: BookedFlight[];
  experiences: TravelExperience[];
  createdAt: string;
};
export type TravelEnvelope = {
  format: 1;
  algorithm: "AES-256-GCM";
  kdf: "PBKDF2-SHA256";
  iterations: 600000;
  salt: string;
  iv: string;
  ciphertext: string;
};
function base64(bytes: Uint8Array) {
  let value = "";
  for (let offset = 0; offset < bytes.length; offset += 8192)
    value += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(value);
}
function bytes(value: string) {
  if (typeof value !== "string" || value.length > 750000)
    throw Error("Encrypted copy exceeds the supported size.");
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}
function buffer(value: Uint8Array) {
  return value.buffer as ArrayBuffer;
}
async function key(passphrase: string, salt: Uint8Array) {
  if (passphrase.length < 12 || passphrase.length > 256)
    throw Error("Use a passphrase between 12 and 256 characters.");
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: buffer(salt), iterations: 600000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
export function privateSnapshot(
  trainerId: PrivateTravelSnapshot["trainerId"],
  bookings: BookedFlight[],
  experiences: TravelExperience[],
): PrivateTravelSnapshot {
  return {
    format: 1,
    trainerId,
    createdAt: new Date().toISOString(),
    bookings: bookings
      .filter((row) => row && row.trainerId === trainerId && row.verified)
      .slice(0, 30)
      .map((row) => sanitizedBooking({ ...row, changes: [] })!)
      .filter(Boolean),
    experiences: experiences
      .filter(
        (row) => row && row.trainerId === trainerId && validExperience(row),
      )
      .slice(0, 200)
      .map((row) => ({
        id: row.id,
        trainerId: row.trainerId,
        airport: row.airport,
        date: row.date,
        kind: row.kind,
        minutes: row.minutes,
        lane: row.lane,
        recordedAt: row.recordedAt,
      })),
  };
}
export async function encryptTravel(
  snapshot: PrivateTravelSnapshot,
  passphrase: string,
  workspaceId: string,
): Promise<TravelEnvelope> {
  const salt = crypto.getRandomValues(new Uint8Array(16)),
    iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(
    JSON.stringify(
      privateSnapshot(
        snapshot.trainerId,
        snapshot.bookings,
        snapshot.experiences,
      ),
    ),
  );
  if (plain.length > 512000)
    throw Error("Choose fewer records before synchronizing.");
  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: buffer(iv),
      additionalData: new TextEncoder().encode(
        "atlas-travel-v1|" + workspaceId + "|" + snapshot.trainerId,
      ),
    },
    await key(passphrase, salt),
    plain,
  );
  return {
    format: 1,
    algorithm: "AES-256-GCM",
    kdf: "PBKDF2-SHA256",
    iterations: 600000,
    salt: base64(salt),
    iv: base64(iv),
    ciphertext: base64(new Uint8Array(encrypted)),
  };
}
export async function decryptTravel(
  envelope: TravelEnvelope,
  passphrase: string,
  workspaceId: string,
  trainerId: PrivateTravelSnapshot["trainerId"],
): Promise<PrivateTravelSnapshot> {
  if (
    envelope.format !== 1 ||
    envelope.algorithm !== "AES-256-GCM" ||
    envelope.kdf !== "PBKDF2-SHA256" ||
    envelope.iterations !== 600000
  )
    throw Error("This encrypted copy uses an unsupported format.");
  const salt = bytes(envelope.salt),
    iv = bytes(envelope.iv);
  if (salt.length !== 16 || iv.length !== 12)
    throw Error("Invalid encrypted travel copy.");
  let parsed: Partial<PrivateTravelSnapshot>;
  try {
    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: buffer(iv),
        additionalData: new TextEncoder().encode(
          "atlas-travel-v1|" + workspaceId + "|" + trainerId,
        ),
      },
      await key(passphrase, salt),
      buffer(bytes(envelope.ciphertext)),
    );
    parsed = JSON.parse(new TextDecoder().decode(decrypted));
  } catch {
    throw Error(
      "Could not unlock this copy. Check the passphrase, workspace and trainer.",
    );
  }
  if (
    parsed.format !== 1 ||
    parsed.trainerId !== trainerId ||
    !Array.isArray(parsed.bookings) ||
    !Array.isArray(parsed.experiences)
  )
    throw Error("The unlocked travel data has an invalid format.");
  const clean = privateSnapshot(trainerId, parsed.bookings, parsed.experiences);
  if (
    new Set(parsed.bookings.map((row) => row.id)).size !==
      parsed.bookings.length ||
    new Set(parsed.experiences.map((row) => row.id)).size !==
      parsed.experiences.length ||
    clean.bookings.length !== parsed.bookings.length ||
    clean.experiences.length !== parsed.experiences.length ||
    clean.bookings.some(
      (row, index) => row.legs.length !== parsed.bookings![index].legs?.length,
    )
  )
    throw Error(
      "Some unlocked records did not pass validation. No local records were changed.",
    );
  return {
    ...clean,
    createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : "",
  };
}
