import crypto from "node:crypto";
import path from "node:path";
import formatError from "@tokenring-ai/utility/error/formatError";
import fs from "fs-extra";
import { type VaultFileData, VaultFileSchema } from "./schema.ts";

export function deriveKey(password: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(password, salt, 100000, 32, "sha256");
}

export function encrypt(data: string, password: string): string {
  const salt = crypto.randomBytes(16);
  const key = deriveKey(password, salt);
  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  let encrypted = cipher.update(data, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  const combined = Buffer.concat([salt, iv, authTag, Buffer.from(encrypted, "hex")]);

  return combined.toString("base64");
}

export function decrypt(encryptedData: string, password: string): string {
  const combined = Buffer.from(encryptedData, "base64");

  const salt = combined.subarray(0, 16);
  const iv = combined.subarray(16, 28);
  const authTag = combined.subarray(28, 44);
  const encrypted = combined.subarray(44);

  const key = deriveKey(password, salt);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, undefined, "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

export async function readOrInitializeVault(vaultFile: string, password: string): Promise<VaultFileData> {
  if (!(await fs.pathExists(vaultFile))) {
    await initVault(vaultFile, password);
  }

  return readVault(vaultFile, password);
}

export async function readVault(vaultFile: string, password: string): Promise<VaultFileData> {
  if (!(await fs.pathExists(vaultFile))) {
    throw new Error("Vault file does not exist");
  }

  const encryptedContent = await fs.readFile(vaultFile, "utf8");
  let decryptedContent: string;
  try {
    decryptedContent = decrypt(encryptedContent, password);
  } catch (error) {
    throw new Error(`Failed to decrypt vault file ${vaultFile}. Did you provide the right password?\n\n${formatError(error)}`);
  }
  try {
    return VaultFileSchema.parse(JSON.parse(decryptedContent));
  } catch (error) {
    throw new Error(`Vault file ${vaultFile} contains corrupted data.\n\n${formatError(error)}`);
  }
}

/**
 * Encrypts and writes the vault. Written beside the real file and renamed over it, so a crash or a
 * full disk mid-write leaves the previous vault intact instead of a truncated, undecryptable file.
 */
export async function writeVault(vaultFile: string, password: string, data: VaultFileData): Promise<void> {
  const jsonContent = JSON.stringify(data, null, 2);
  const encryptedContent = encrypt(jsonContent, password);

  const pendingFile = `${vaultFile}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(pendingFile, encryptedContent, { encoding: "utf8", mode: 0o600 });
    await fs.rename(pendingFile, vaultFile);
  } catch (error) {
    await fs.remove(pendingFile).catch(() => {});
    throw error;
  }
}

/** Names that would reach Object.prototype (or Object itself) instead of an entry. */
const RESERVED_NAMES = new Set(["__proto__", "constructor", "prototype"]);

/** Throws for a category or key name that can't be stored: empty, or reserved by JavaScript objects. */
export function assertVaultName(kind: "category" | "key", name: string): void {
  if (!name) throw new Error(`The ${kind} name must not be empty`);
  if (RESERVED_NAMES.has(name)) throw new Error(`"${name}" cannot be used as a ${kind} name`);
}

/** An entry's value, ignoring anything inherited from Object.prototype. */
export function ownEntry(data: VaultFileData, category: string, key: string): string | undefined {
  const items = Object.hasOwn(data.entries, category) ? data.entries[category] : undefined;
  return items && Object.hasOwn(items, key) ? items[key] : undefined;
}

export async function initVault(vaultFile: string, password: string): Promise<void> {
  await writeVault(vaultFile, password, { vaultVersion: 1, entries: {} });
}

/**
 * Creates a brand-new vault file, refusing to touch one that exists. The encrypted file is written
 * beside the target and hard-linked into place, which fails if the target appeared in the meantime, so
 * two creators (or a creator and a restore) never overwrite each other.
 */
export async function createVaultFile(vaultFile: string, password: string): Promise<void> {
  await fs.ensureDir(path.dirname(vaultFile), { mode: 0o700 });
  const pendingFile = `${vaultFile}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(pendingFile, encrypt(JSON.stringify({ vaultVersion: 1, entries: {} }, null, 2), password), { encoding: "utf8", mode: 0o600 });
    try {
      await fs.link(pendingFile, vaultFile);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("A vault already exists here; it was not overwritten.");
      // A file system without hard links: fall back to a checked rename.
      if (await fs.pathExists(vaultFile)) throw new Error("A vault already exists here; it was not overwritten.");
      await fs.rename(pendingFile, vaultFile);
    }
  } finally {
    await fs.remove(pendingFile).catch(() => {});
  }
}
