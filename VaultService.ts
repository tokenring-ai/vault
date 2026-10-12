import type Agent from "@tokenring-ai/agent/Agent";
import type { TokenRingService } from "@tokenring-ai/app/types";
import type { SecretStore } from "@tokenring-ai/secrets";
import fs from "fs-extra";
import type { z } from "zod";
import type { ParsedVaultConfig, VaultEntryUpdate, VaultFileData } from "./schema.ts";
import { readOrInitializeVault, readVault, writeVault } from "./vault.ts";

/**
 * Where the app re-reads the vault password from (see {@link VaultService.setPasswordStore}).
 * A password change must update it too, or the next start could not open the vault.
 */
export interface VaultPasswordStore {
  /** Whether {@link update} can persist a new password; `reason` explains a refusal to the user. */
  describe(): { source: string; canUpdate: boolean; reason?: string };
  /**
   * Replace `currentPassword` with `newPassword`. Must throw without side effects when it
   * cannot; a store that does not hold `currentPassword` (nothing to update) resolves.
   */
  update(currentPassword: string, newPassword: string): Promise<void>;
}

export type VaultPasswordChangeSupport = { supported: boolean; source: string; reason?: string };

export default class VaultService implements TokenRingService, SecretStore {
  readonly name = "VaultService";
  description = "A vault service for storing persisted credentials";
  // Add password caching during session
  private sessionPassword: string | undefined;
  private vaultData: VaultFileData | undefined;
  private relockTimer: ReturnType<typeof setTimeout> | undefined;
  /**
   * Re-obtains the password without prompting (the app resolves it from
   * TR_VAULT_PASSWORD or the OS secrets manager). Used whenever the vault is
   * unlocked with no password in memory, so {@link lock} can drop the password
   * without breaking the app's automatic unlock.
   */
  private passwordResolver: (() => Promise<string>) | undefined;
  private passwordStore: VaultPasswordStore | undefined;

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

  setPasswordResolver(resolver: () => Promise<string>) {
    this.passwordResolver = resolver;
  }

  setPasswordStore(store: VaultPasswordStore) {
    this.passwordStore = store;
  }

  /** Whether {@link changePassword} can run, and where the password otherwise lives. */
  passwordChangeSupport(): VaultPasswordChangeSupport {
    if (!this.passwordStore) return { supported: true, source: "session" };
    const { source, canUpdate, reason } = this.passwordStore.describe();
    return { supported: canUpdate, source, ...(reason !== undefined && { reason }) };
  }

  /** Category → key names of the unlocked vault, or null when locked. Does not reset the relock timer. */
  peekEntries(): Record<string, string[]> | null {
    if (!this.vaultData) return null;
    return Object.fromEntries(Object.entries(this.vaultData.entries).map(([category, items]) => [category, Object.keys(items)]));
  }

  /**
   * Unlocks with an explicit password, verifying it against the vault file first.
   * Without a password this is {@link unlock} (cached password, then the resolver).
   */
  async unlockWithPassword(password?: string): Promise<void> {
    if (password === undefined) {
      await this.unlock();
      return;
    }
    const data = await readOrInitializeVault(this.options.vaultFile, password);
    this.sessionPassword = password;
    this.vaultData = data;
    this.scheduleRelock();
  }

  /**
   * Re-encrypts the vault with `newPassword` after verifying `currentPassword` against the
   * file. The new file is written beside the old one, the password store is updated, and
   * only then is the file swapped in — a failure at any step leaves the old password working.
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    if (!newPassword) throw new Error("The new password must not be empty");
    if (newPassword === currentPassword) throw new Error("The new password is the same as the current one");
    const support = this.passwordChangeSupport();
    if (!support.supported) throw new Error(support.reason ?? "The vault password cannot be changed from here");

    let data: VaultFileData;
    try {
      data = await readVault(this.options.vaultFile, currentPassword);
    } catch {
      throw new Error("The current password is incorrect");
    }

    const vaultFile = this.options.vaultFile;
    const pendingFile = `${vaultFile}.${process.pid}.${Date.now()}.tmp`;
    await writeVault(pendingFile, newPassword, data);
    try {
      await this.passwordStore?.update(currentPassword, newPassword);
    } catch (error) {
      await fs.remove(pendingFile);
      throw new Error(`Could not update the stored vault password; nothing was changed. ${error instanceof Error ? error.message : String(error)}`);
    }
    try {
      await fs.rename(pendingFile, vaultFile);
    } catch (error) {
      await fs.remove(pendingFile);
      // Put the store back so it still matches the file on disk.
      await this.passwordStore?.update(newPassword, currentPassword).catch(() => {});
      throw error;
    }

    this.sessionPassword = newPassword;
    this.vaultData = data;
    this.scheduleRelock();
  }

  async start() {
    this.sessionPassword ||= process.env.TR_VAULT_PASSWORD;

    if (this.sessionPassword) {
      this.vaultData = await readOrInitializeVault(this.options.vaultFile, this.sessionPassword);
      this.scheduleRelock();
    }
  }

  async save(modifications: VaultEntryUpdate[] = [], agent?: Agent) {
    const { password, data } = await this.reloadForWrite(agent);

    for (const modification of modifications) {
      (data.entries[modification.category] ??= {})[modification.key] = modification.value;
    }

    await writeVault(this.options.vaultFile, password, data);
    this.scheduleRelock();
  }

  /** Drops the decrypted entries and the cached password from memory. */
  lock() {
    this.clearRelockTimer();
    this.vaultData = undefined;
    this.sessionPassword = undefined;
  }

  async unlock(agent?: Agent): Promise<VaultFileData> {
    if (this.vaultData) {
      this.scheduleRelock();
      return this.vaultData;
    }

    const password = await this.requirePassword(agent);
    this.vaultData = await readOrInitializeVault(this.options.vaultFile, password);
    this.scheduleRelock();
    return this.vaultData;
  }

  /** The cached password, else the resolver's (env / OS secrets manager), else a prompt when an agent is available. */
  private async requirePassword(agent?: Agent, action: "unlocking" | "saving" = "unlocking"): Promise<string> {
    if (this.sessionPassword) return this.sessionPassword;

    if (this.passwordResolver) {
      try {
        this.sessionPassword = await this.passwordResolver();
        return this.sessionPassword;
      } catch (error) {
        if (!agent) throw error;
      }
    }

    if (!agent) {
      throw new Error(`No password was set before ${action} vault`);
    }
    this.sessionPassword = await this.promptForPassword(agent);
    return this.sessionPassword;
  }

  /**
   * Re-reads the vault file before a write so changes made outside this process
   * (the `vault` CLI) are not overwritten with stale data. If the file no longer
   * decrypts with the cached password — e.g. `vault change-password` ran while
   * TokenRing was up — refuse rather than re-encrypting with the old password.
   */
  private async reloadForWrite(agent?: Agent): Promise<{ password: string; data: VaultFileData }> {
    const password = await this.requirePassword(agent, "saving");
    try {
      this.vaultData = await readOrInitializeVault(this.options.vaultFile, password);
    } catch (error) {
      this.vaultData = undefined;
      throw new Error(
        `Vault file ${this.options.vaultFile} can no longer be opened with the password this session unlocked it with ` +
          "(was it changed with `vault change-password` while TokenRing was running?). " +
          `Restart TokenRing with the new password before saving.\n\n${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return { password, data: this.vaultData };
  }

  /**
   * Moves (renames, re-categorizes, or both) one entry. Refuses to overwrite an existing
   * destination unless `overwrite` is set.
   */
  async moveItem(from: { category: string; key: string }, to: { category: string; key: string }, options: { overwrite?: boolean } = {}): Promise<void> {
    if (from.category === to.category && from.key === to.key) return;
    const { password, data } = await this.reloadForWrite();
    const value = data.entries[from.category]?.[from.key];
    if (value === undefined) throw new Error(`Key ${from.key} does not exist in category ${from.category}`);
    if (data.entries[to.category]?.[to.key] !== undefined && !options.overwrite) {
      throw new Error(`Key ${to.key} already exists in category ${to.category}`);
    }
    (data.entries[to.category] ??= {})[to.key] = value;
    const source = data.entries[from.category]!;
    delete source[from.key];
    if (Object.keys(source).length === 0) delete data.entries[from.category];
    await writeVault(this.options.vaultFile, password, data);
    this.scheduleRelock();
  }

  /** Adds an empty category so it can be filled from the UI. Existing categories are left alone. */
  async createCategory(category: string): Promise<boolean> {
    const { password, data } = await this.reloadForWrite();
    if (data.entries[category]) return false;
    data.entries[category] = {};
    await writeVault(this.options.vaultFile, password, data);
    this.scheduleRelock();
    return true;
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
    const { password, data } = await this.reloadForWrite(agent);

    if (!data.entries[category]?.[key]) {
      throw new Error(`Key ${key} does not exist in category ${category}`);
    }
    delete data.entries[category][key];
    if (Object.keys(data.entries[category]).length === 0) {
      delete data.entries[category];
    }
    await writeVault(this.options.vaultFile, password, data);
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
