import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Mailbox app passwords are stored encrypted (AES-256-GCM). The key comes
 * from CADENCE_SECRET_KEY in .env.local, so a database leak alone doesn't
 * expose the inboxes. Lose the key and you re-enter the passwords.
 */
function key(): Buffer {
  const secret = process.env.CADENCE_SECRET_KEY;
  if (!secret || secret.length < 16) {
    throw new Error(
      "CADENCE_SECRET_KEY is missing or too short. Add a long random string to .env.local."
    );
  }
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ct].map((b) => b.toString("base64")).join(".");
}

export function decryptSecret(enc: string): string {
  const [iv, tag, ct] = enc.split(".").map((p) => Buffer.from(p, "base64"));
  if (!iv || !tag || !ct) throw new Error("Stored password is corrupt. Re-enter it.");
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
