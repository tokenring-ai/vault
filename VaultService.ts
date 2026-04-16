import type Agent from "@tokenring-ai/agent/Agent";
import type {TokenRingService} from "@tokenring-ai/app/types";
import fs from "fs-extra";
import type {z} from "zod";
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
    for (const [key, value] of Object.entries(
      this.vaultData.entries.env ?? {},
    )) {
      process.env[key] = value;
    }
  }

  setPassword(password: string) {
    this.sessionPassword = password;
  }

  async start() {
    this.sessionPassword ||= process.env.TR_VAULT_PASSWORD;

    if (this.sessionPassword) {
      this.vaultData = await readOrInitializeVault(
        this.options.vaultFile,
        this.sessionPassword,
      );
    }
  }

  async save(modifications: VaultEntryUpdate[] = []) {
    if (! this.sessionPassword) throw new Error("No password was set before saving vault");

    this.vaultData ??= {
      vaultVersion: 1,
      entries: {},
    };

    for (const modification of modifications) {
      (this.vaultData.entries[modification.category] ??= {})[modification.key] =
        modification.value;
    }

    await writeVault(
      this.options.vaultFile,
      this.sessionPassword!,
      this.vaultData,
    );
  }

  lock() {
    this.vaultData = undefined;
  }

  async unlock(agent?: Agent): Promise<VaultFileData> {
    if (this.vaultData) return this.vaultData;

    if (!this.sessionPassword) {
      if (!agent) {
        throw new Error("No password was set before unlocking vault");
      }
      this.sessionPassword = await this.promptForPassword(agent);
    }

    this.vaultData = await readOrInitializeVault(
      this.options.vaultFile,
      this.sessionPassword,
    );
    return this.vaultData;
  }

  requireItem(
    category: string,
    key: string,
  ): string {
    if (! this.vaultData) throw new Error("Vault is uninitialized or locked");
    const data = this.vaultData;
    if (! data.entries[category]) throw new Error(`Category ${category} does not exist in vault`);
    if (! data.entries[category][key]) throw new Error(`Item ${key} does not exist in category ${category} in vault`);
    return data.entries[category][key];
  }

  requireJsonItem<T>(
    category: string,
    key: string,
    schema: z.ZodType<T>,
  ): T {
    const value = this.requireItem(category, key);
    return schema.parse(JSON.parse(value));
  }

  async setItem(
    category: string,
    key: string,
    value: string,
  ): Promise<void> {
    await this.save([{category, key, value}]);
  }

  async setJsonItem(
    category: string,
    key: string,
    value: unknown,
  ): Promise<void> {
    await this.setItem(category, key, JSON.stringify(value));
  }

  async deleteItem(
    category: string,
    key: string,
    agent?: Agent,
  ): Promise<void> {
    await this.unlock(agent);
    if (!this.vaultData) throw new Error("Vault is uninitialized or locked");

    if (!this.vaultData.entries[category]?.[key]) {
      throw new Error(`Key ${key} does not exist in category ${category}`);
    }
    delete this.vaultData.entries[category][key];
    await writeVault(
      this.options.vaultFile,
      this.sessionPassword!,
      this.vaultData,
    );
  }

  private async promptForPassword(agent: Agent): Promise<string> {
    const hasExistingVault = await fs.pathExists(this.options.vaultFile);
    const password = await agent.askForText({
      message: hasExistingVault
        ? "Enter the vault password to continue."
        : "Set a vault password so Google tokens can be stored securely.",
      label: hasExistingVault ? "Vault Password" : "New Vault Password",
      masked: true,
    });

    if (!password) {
      throw new Error(
        hasExistingVault
          ? "Vault unlock cancelled"
          : "Vault initialization cancelled",
      );
    }

    return password;
  }
}
