import fs from "fs-extra";
import crypto from "crypto";

export function deriveKey(password: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
}

export function encrypt(data: string, password: string): string {
  const salt = crypto.randomBytes(16);
  const key = deriveKey(password, salt);
  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  const combined = Buffer.concat([
    salt,
    iv,
    authTag,
    Buffer.from(encrypted, 'hex')
  ]);

  return combined.toString('base64');
}

export function decrypt(encryptedData: string, password: string): string {
  const combined = Buffer.from(encryptedData, 'base64');

  const salt = combined.subarray(0, 16);
  const iv = combined.subarray(16, 28);
  const authTag = combined.subarray(28, 44);
  const encrypted = combined.subarray(44);

  const key = deriveKey(password, salt);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, undefined, 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

export async function readVault(vaultFile: string, password: string): Promise<Record<string, string>> {
  if (!await fs.pathExists(vaultFile)) {
    throw new Error('Vault file does not exist');
  }

  const encryptedContent = await fs.readFile(vaultFile, 'utf8');
  const decryptedContent = decrypt(encryptedContent, password);
  return JSON.parse(decryptedContent) as Record<string, string>;
}

export async function writeVault(vaultFile: string, password: string, data: Record<string, string>): Promise<void> {
  const jsonContent = JSON.stringify(data, null, 2);
  const encryptedContent = encrypt(jsonContent, password);

  await fs.writeFile(vaultFile, encryptedContent, { 
    encoding: 'utf8',
    mode: 0o600
  });
}

export async function initVault(vaultFile: string, password: string): Promise<void> {
  await writeVault(vaultFile, password, {});
}
