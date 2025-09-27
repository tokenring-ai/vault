import {Agent} from "@tokenring-ai/agent";
import {TokenRingService} from "@tokenring-ai/agent/types";
import fs from "fs-extra";
import crypto from "crypto";
export interface VaultOptions {
  vaultFile: string;
  relockTime: number;
}

type AnyJSON =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly AnyJSON[]
  | { readonly [key: string]: AnyJSON };

export default class VaultService implements TokenRingService {
  // Add password caching during session
  private sessionPassword: string | undefined;

  name = "VaultService";
  description = "A vault service for storing persisted credentials";

  private vaultFile: string;
  private vaultData: Record<string, AnyJSON> | undefined;
  private relockTimer: NodeJS.Timeout | undefined;
  private relockTime = 300 * 1000; // 5 minutes

  constructor(options: VaultOptions) {
    this.vaultFile = options.vaultFile;
    this.relockTime = options.relockTime;
  }

  private deriveKey(password: string, salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  }

  private encrypt(data: string, password: string): string {
    const salt = crypto.randomBytes(16);
    const key = this.deriveKey(password, salt);
    const iv = crypto.randomBytes(12);

    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Combine salt + iv + authTag + encrypted data
    const combined = Buffer.concat([
      salt,
      iv,
      authTag,
      Buffer.from(encrypted, 'hex')
    ]);

    return combined.toString('base64');
  }

  private decrypt(encryptedData: string, password: string): string {
    const combined = Buffer.from(encryptedData, 'base64');

    const salt = combined.subarray(0, 16);
    const iv = combined.subarray(16, 28);
    const authTag = combined.subarray(28, 44);
    const encrypted = combined.subarray(44);

    const key = this.deriveKey(password, salt);

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, undefined, 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  async unlockVault(agent: Agent): Promise<Record<string, AnyJSON>> {
    if (this.relockTimer) {
      clearTimeout(this.relockTimer);
      this.relockTimer = setTimeout(() => this.lock(), this.relockTime);
    }

    if (this.vaultData) return this.vaultData;

    if (!fs.existsSync(this.vaultFile)) {
      agent.infoLine("Vault file does not exist, a new empty vault will be created.");
      await this.save({}, agent);
      return {};
    }

    if (!this.sessionPassword) {
      this.sessionPassword = await agent.askHuman({
        type: "password",
        question: "Enter your password to unlock the vault."
      });
    }

    try {
      const encryptedContent = await fs.readFile(this.vaultFile, 'utf8');
      const decryptedContent = this.decrypt(encryptedContent, this.sessionPassword);
      this.vaultData = JSON.parse(decryptedContent) as Record<string,AnyJSON> ?? {};
      
      this.relockTimer = setTimeout(() => this.lock(), this.relockTime);
      
      return this.vaultData;
    } catch (error) {
      this.sessionPassword = undefined; // Clear invalid password
      throw new Error('Failed to decrypt vault. Invalid password or corrupted vault file.');
    }
  }

  async lock(): Promise<void> {
    this.vaultData = undefined;
    this.sessionPassword = undefined; // Clear cached password
    if (this.relockTimer) {
      clearTimeout(this.relockTimer);
      this.relockTimer = undefined;
    }
  }

  async save(vaultData: Record<string, AnyJSON>, agent: Agent) {
    if (!this.sessionPassword) {
      throw new Error('Vault must be unlocked before saving');
    }

    const jsonContent = JSON.stringify(vaultData, null, 2);
    const encryptedContent = this.encrypt(jsonContent, this.sessionPassword);

    // Set restrictive permissions (owner read/write only)
    await fs.writeFile(this.vaultFile, encryptedContent, { 
      encoding: 'utf8',
      mode: 0o600 // Owner read/write only
    });
    this.vaultData = vaultData;
  }

  async getItem(key: string, agent: Agent): Promise<AnyJSON> {
    const vaultData = await this.unlockVault(agent);
    return vaultData[key];
  }

  async setItem(key: string, value: AnyJSON, agent: Agent): Promise<void> {
    const vaultData = await this.unlockVault(agent);
    vaultData[key] = value;
    await this.save(vaultData, agent);
  }
}