import Agent from "@tokenring-ai/agent/Agent";
import {TokenRingService} from "@tokenring-ai/app/types";
import fs from "fs-extra";
import type {ParsedVaultConfig, VaultEntryUpdate, VaultFileData} from "./schema.ts";
import {readOrInitializeVault, writeVault} from "./vault.ts";

export default class VaultService implements TokenRingService {
  // Add password caching during session
  private sessionPassword: string | undefined;

  readonly name = "VaultService";
  description = "A vault service for storing persisted credentials";

  private vaultData: VaultFileData | undefined;

  constructor(readonly options: ParsedVaultConfig) {
  }

  get unlocked(): boolean {
    return !!this.vaultData;
  }

  injectEnv() {
    if (!this.vaultData) return;
    for (const [key, value] of Object.entries(this.vaultData.entries['env'] ?? {})) {
      process.env[key] = value;
    }
  }

  setPassword(password: string) {
    this.sessionPassword = password;
  }

  async start() {
    this.sessionPassword ||= process.env.TR_VAULT_PASSWORD;

    if (this.sessionPassword) {
      this.vaultData = await readOrInitializeVault(this.options.vaultFile, this.sessionPassword);
    }
  }

  async save(modifications: VaultEntryUpdate[] = []) {
    await this.unlock();

    this.vaultData ??= {
      vaultVersion: 1,
      entries: {}
    }

    for (const modification of modifications) {
      (this.vaultData.entries[modification.category] ??= {})[modification.key] = modification.value;
    }

    await writeVault(this.options.vaultFile, this.sessionPassword!, this.vaultData);
  }

  async lock(): Promise<void> {
    this.vaultData = undefined;
  }

  async unlock(agent?: Agent): Promise<VaultFileData> {
    if (this.vaultData) return this.vaultData;

    if (!this.sessionPassword) {
      if (!agent) {
        throw new Error('No password was set before unlocking vault');
      }
      this.sessionPassword = await this.promptForPassword(agent);
    }

    this.vaultData = await readOrInitializeVault(this.options.vaultFile, this.sessionPassword);
    return this.vaultData;
  }

  async getItem(category: string, key: string, agent?: Agent): Promise<string | undefined> {
    const data = await this.unlock(agent);
    return data.entries[category]?.[key];
  }

  async getJsonItem<T>(category: string, key: string, agent?: Agent): Promise<T | undefined> {
    const value = await this.getItem(category, key, agent);
    if (value === undefined) return undefined;
    return JSON.parse(value) as T;
  }

  async setItem(category: string, key: string, value: string, agent?: Agent): Promise<void> {
    await this.unlock(agent);
    await this.save([{category, key, value}]);
  }

  async setJsonItem(category: string, key: string, value: unknown, agent?: Agent): Promise<void> {
    await this.setItem(category, key, JSON.stringify(value), agent);
  }

  async deleteItem(category: string, key: string, agent?: Agent): Promise<void> {
    await this.unlock(agent);
    if (!this.vaultData) throw new Error('Vault is uninitialized or locked');

    if (!this.vaultData.entries[category]?.[key]) {
      throw new Error(`Key ${key} does not exist in category ${category}`);
    }
    delete this.vaultData.entries[category][key];
    await writeVault(this.options.vaultFile, this.sessionPassword!, this.vaultData);
  }

  private async promptForPassword(agent: Agent): Promise<string> {
    const hasExistingVault = await fs.pathExists(this.options.vaultFile);
    const password = await agent.askForText({
      message: hasExistingVault
        ? 'Enter the vault password to continue.'
        : 'Set a vault password so Google tokens can be stored securely.',
      label: hasExistingVault ? 'Vault Password' : 'New Vault Password',
      masked: true,
    });

    if (!password) {
      throw new Error(hasExistingVault ? 'Vault unlock cancelled' : 'Vault initialization cancelled');
    }

    return password;
  }
}
