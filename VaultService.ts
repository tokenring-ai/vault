import type Agent from "@tokenring-ai/agent/Agent";
import type { TokenRingService } from "@tokenring-ai/app/types";
import type { SecretStore } from "@tokenring-ai/secrets";
import fs from "fs-extra";
import type { z } from "zod";
import type { ParsedVaultConfig, VaultEntryUpdate, VaultFileData } from "./schema.ts";
import { readOrInitializeVault, writeVault } from "./vault.ts";

export default class VaultService implements TokenRingService, SecretStore {
  readonly name = "VaultService";
  description = "A vault service for storing persisted credentials";
  // Add password caching during session
  private sessionPassword: string | undefined;
  private vaultData: VaultFileData | undefined;
  private relockTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(readonly options: ParsedVaultConfig) {}

  get unlocked(): boolean {
    return !!this.vaultData;
  }

  /**
   * Reads an entry without throwing — the {@link SecretStore} contract used by
   * the app's SecretService to resolve `{ source: "vault" }` config references.
   * Returns undefined when the vault is locked or the entry is absent, so an
   * unset credential looks the same as a missing environment variable.
   */
  getSecret(category: string, key: string): string | undefined {
    if (!this.vaultData) return undefined;
    this.scheduleRelock();
    return this.vaultData.entries[category]?.[key];
  }

  /** Every entry in a category, or an empty object when the vault is locked. */
  listSecrets(category: string): Record<string, string> {
    if (!this.vaultData) return {};
    this.scheduleRelock();
    return this.vaultData.entries[category] ?? {};
  }

  setPassword(password: string) {
    this.sessionPassword = password;
  }

  async start() {
    this.sessionPassword ||= process.env.TR_VAULT_PASSWORD;

    if (this.sessionPassword) {
      this.vaultData = await readOrInitializeVault(this.options.vaultFile, this.sessionPassword);
      this.scheduleRelock();
    }
  }

  async save(modifications: VaultEntryUpdate[] = []) {
    if (!this.sessionPassword) throw new Error("No password was set before saving vault");

    await this.unlock();

    for (const modification of modifications) {
      (this.vaultData!.entries[modification.category] ??= {})[modification.key] = modification.value;
    }

    await writeVault(this.options.vaultFile, this.sessionPassword, this.vaultData!);
    this.scheduleRelock();
  }

  lock() {
    this.clearRelockTimer();
    this.vaultData = undefined;
  }

  async unlock(agent?: Agent): Promise<VaultFileData> {
    if (this.vaultData) {
      this.scheduleRelock();
      return this.vaultData;
    }

    if (!this.sessionPassword) {
      if (!agent) {
        throw new Error("No password was set before unlocking vault");
      }
      this.sessionPassword = await this.promptForPassword(agent);
    }

    this.vaultData = await readOrInitializeVault(this.options.vaultFile, this.sessionPassword);
    this.scheduleRelock();
    return this.vaultData;
  }

  requireItem(category: string, key: string): string {
    if (!this.vaultData) throw new Error("Vault is uninitialized or locked");
    this.scheduleRelock();
    const data = this.vaultData;
    if (!data.entries[category]) throw new Error(`Category ${category} does not exist in vault`);
    if (!data.entries[category][key]) throw new Error(`Item ${key} does not exist in category ${category} in vault`);
    return data.entries[category][key];
  }

  requireJsonItem<T>(category: string, key: string, schema: z.ZodType<T>): T {
    const value = this.requireItem(category, key);
    return schema.parse(JSON.parse(value));
  }

  getItemsByCategory(category: string): Record<string, string> {
    if (!this.vaultData) throw new Error("Vault is uninitialized or locked");
    this.scheduleRelock();
    return this.vaultData.entries[category] ?? {};
  }

  getJSONItemsByCategory<T>(category: string, schema: z.ZodType<T>): Record<string, T> {
    const items = this.getItemsByCategory(category);
    return Object.fromEntries(Object.entries(items).map(([key, value]) => [key, schema.parse(JSON.parse(value))]));
  }

  async setItem(category: string, key: string, value: string): Promise<void> {
    await this.save([{ category, key, value }]);
  }

  async setJsonItem(category: string, key: string, value: unknown): Promise<void> {
    await this.setItem(category, key, JSON.stringify(value));
  }

  async deleteItem(category: string, key: string, agent?: Agent): Promise<void> {
    await this.unlock(agent);
    if (!this.vaultData) throw new Error("Vault is uninitialized or locked");

    if (!this.vaultData.entries[category]?.[key]) {
      throw new Error(`Key ${key} does not exist in category ${category}`);
    }
    delete this.vaultData.entries[category][key];
    if (Object.keys(this.vaultData.entries[category]).length === 0) {
      delete this.vaultData.entries[category];
    }
    await writeVault(this.options.vaultFile, this.sessionPassword!, this.vaultData);
    this.scheduleRelock();
  }

  private clearRelockTimer() {
    if (this.relockTimer !== undefined) {
      clearTimeout(this.relockTimer);
      this.relockTimer = undefined;
    }
  }

  private scheduleRelock() {
    this.clearRelockTimer();
    const relockTime = this.options.relockTime;
    if (relockTime === undefined || relockTime <= 0 || !this.vaultData) return;

    this.relockTimer = setTimeout(() => {
      this.relockTimer = undefined;
      this.lock();
    }, relockTime);
    this.relockTimer.unref();
  }

  private async promptForPassword(agent: Agent): Promise<string> {
    const hasExistingVault = await fs.pathExists(this.options.vaultFile);
    const password = await agent.askForText({
      message: hasExistingVault ? "Enter the vault password to continue." : "Set a vault password so Google tokens can be stored securely.",
      label: hasExistingVault ? "Vault Password" : "New Vault Password",
      masked: true,
    });

    if (!password) {
      throw new Error(hasExistingVault ? "Vault unlock cancelled" : "Vault initialization cancelled");
    }

    return password;
  }
}
