import {TokenRingService} from "@tokenring-ai/app/types";
import type {ParsedVaultConfig} from "./schema.ts";
import {readVault, writeVault} from "./vault.ts";

export default class VaultService implements TokenRingService {
  // Add password caching during session
  private sessionPassword: string | undefined;

  readonly name = "VaultService";
  description = "A vault service for storing persisted credentials";

  private vaultData: Record<string, string> | undefined;

  constructor(readonly options: ParsedVaultConfig) {
  }

  injectEnv() {
    if (!this.vaultData) return;
    for (const [key, value] of Object.entries(this.vaultData)) {
      if (key.startsWith('ENV:')) {
        process.env[key.replace('ENV:', '')] = value;
      }
    }
  }

  setPassword(password: string) {
    this.sessionPassword = password;
  }

  async start() {
    this.sessionPassword ||= process.env.TR_VAULT_PASSWORD;

    if (this.sessionPassword) {
      this.vaultData = await readVault(this.options.vaultFile, this.sessionPassword);
    }
  }

  async save(modifications: Record<string, string> = {}) {
    if (!this.sessionPassword) {
      throw new Error('No password was set before saving vault');
    }

    this.vaultData = {...this.vaultData, ...modifications};
    await writeVault(this.options.vaultFile, this.sessionPassword, this.vaultData);
  }

  async lock(): Promise<void> {
    this.vaultData = undefined;
  }

  async unlock(): Promise<Record<string, string>> {
    if (!this.sessionPassword) {
      throw new Error('No password was set before unlocking vault');
    }
    this.vaultData = await readVault(this.options.vaultFile, this.sessionPassword);
    return this.vaultData;
  }

  async getItem(key: string): Promise<string | undefined> {
    if (!this.vaultData) throw new Error('Vault is uninitialized or locked');
    return this.vaultData[key];
  }

  async setItem(key: string, value: string): Promise<void> {
    if (!this.sessionPassword) throw new Error('Vault password is not set');
    await this.save({[key]: value});
  }
}