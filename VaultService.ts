import { existsSync } from "node:fs";
import type Agent from "@tokenring-ai/agent/Agent";
import type { TokenRingService } from "@tokenring-ai/app/types";
import type { SecretStore } from "@tokenring-ai/secrets";
import { VAULT_NOT_SET_UP_MESSAGE } from "@tokenring-ai/secrets/SecretService";
import fs from "fs-extra";
import type { z } from "zod";
import { MIN_VAULT_PASSWORD_LENGTH, type ParsedVaultConfig, type VaultEntryUpdate, type VaultFileData } from "./schema.ts";
import { assertVaultName, createVaultFile, ownEntry, readOrInitializeVault, readVault, writeVault } from "./vault.ts";

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
  /**
   * Best effort, after a vault was created with a password the user chose: keep it where startup re-reads it,
   * so the next start unlocks by itself. Must not throw, and the reason must never contain the password.
   */
  remember?(password: string): Promise<{ stored: boolean; reason?: string }>;
}

/** What {@link VaultService.createVault} did beyond creating the file. */
export type VaultCreation = { passwordStored: boolean; message: string };

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
  /** Writes run one at a time: each re-reads the file, so two at once would each drop the other's change. */
  private writeQueue: Promise<unknown> = Promise.resolve();
  /** Bumped by {@link lock}, so a write that was already running when the vault locked can't unlock it again. */
  private lockGeneration = 0;
  /** Where startup problems are reported; the plugin points this at app.serviceError. */
  private errorReporter: (message: string) => void = message => console.error(`[VaultService] ${message}`);
  /** Set once a startup unlock failed, so {@link start} does not retry and report the same bad password twice. */
  private startupUnlockFailed = false;

  constructor(readonly options: ParsedVaultConfig) {}

  get unlocked(): boolean {
    return !!this.vaultData;
  }

  /** Whether the vault file exists (locked or not): the difference between "locked" and "not set up". */
  vaultFileExists(): boolean {
    return existsSync(this.options.vaultFile);
  }

  /** {@link SecretStore}: false while no vault file exists, so callers can say "set one up" rather than "unlock". */
  get isSetUp(): boolean {
    return this.vaultFileExists();
  }

  /**
   * Creates a new vault with a password the user chose, unlocks it, and tries to keep the password in the OS
   * secrets manager so the next start unlocks by itself. Never overwrites an existing vault file. The password
   * is never part of the result or of any error text.
   */
  createVault(password: string): Promise<VaultCreation> {
    return this.serialized(() => this.createVaultNow(password));
  }

  private async createVaultNow(password: string): Promise<VaultCreation> {
    if (this.vaultFileExists()) throw new Error("A vault already exists on this computer, so a new one was not created. Unlock it instead.");
    if (password.length < MIN_VAULT_PASSWORD_LENGTH) throw new Error(`The vault password must be at least ${MIN_VAULT_PASSWORD_LENGTH} characters.`);
    await createVaultFile(this.options.vaultFile, password);
    this.sessionPassword = password;
    this.vaultData = { vaultVersion: 1, entries: {} };
    this.startupUnlockFailed = false;
    this.scheduleRelock();
    this.notifyChanged();

    let outcome: { stored: boolean; reason?: string | undefined };
    try {
      outcome = (await this.passwordStore?.remember?.(password)) ?? { stored: false, reason: "no secure password store is available here" };
    } catch {
      outcome = { stored: false, reason: "the secure password store could not be written" };
    }
    return outcome.stored
      ? {
          passwordStored: true,
          message: "Vault created and unlocked. Its password is saved in your computer's secure password store, so TokenRing unlocks it by itself next time.",
        }
      : {
          passwordStored: false,
          message:
            `Vault created and unlocked. The password could not be saved on this computer (${outcome.reason ?? "no secure password store is available"}), ` +
            "so you will need to enter it every time TokenRing starts. On a server, set the TR_VAULT_PASSWORD environment variable instead.",
        };
  }

  /**
   * Unlocks an existing vault for a person: with their password, or the saved one. A missing vault is reported as
   * "not set up" (use {@link createVault}) instead of being created from a password typed into an unlock box.
   */
  async unlockExisting(password?: string): Promise<void> {
    if (this.unlocked) return;
    if (password !== undefined && !this.vaultFileExists()) throw new Error(VAULT_NOT_SET_UP_MESSAGE);
    try {
      await this.unlockWithPassword(password);
    } catch (error) {
      if (!this.vaultFileExists()) throw new Error(VAULT_NOT_SET_UP_MESSAGE);
      throw error;
    }
  }

  private changeListeners = new Set<() => void>();

  /** {@link SecretStore}: unlocked vaults can be written by the app (an AI provider key saved from the UI). */
  get writable(): boolean {
    return this.unlocked;
  }

  async storeSecret(category: string, key: string, value: string): Promise<void> {
    await this.setItem(category, key, value);
  }

  async removeSecret(category: string, key: string): Promise<void> {
    if (this.getSecret(category, key) === undefined) return;
    await this.deleteItem(category, key);
  }

  /** {@link SecretStore}: called after an unlock or a write — not on lock, since what was read stays in use. */
  onChange(listener: () => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  private notifyChanged(): void {
    for (const listener of this.changeListeners) {
      try {
        listener();
      } catch (error) {
        this.errorReporter(`A vault change listener failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
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
    return ownEntry(this.vaultData, category, key);
  }

  /** Every entry in a category, or an empty object when the vault is locked. */
  listSecrets(category: string): Record<string, string> {
    if (!this.vaultData) return {};
    this.scheduleRelock();
    return Object.hasOwn(this.vaultData.entries, category) ? this.vaultData.entries[category]! : {};
  }

  setPassword(password: string) {
    this.sessionPassword = password;
  }

  setPasswordResolver(resolver: () => Promise<string>) {
    this.passwordResolver = resolver;
  }

  setErrorReporter(reporter: (message: string) => void) {
    this.errorReporter = reporter;
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
    this.notifyChanged();
  }

  /**
   * Re-encrypts the vault with `newPassword` after verifying `currentPassword` against the
   * file. The new file is written beside the old one, the password store is updated, and
   * only then is the file swapped in — a failure at any step leaves the old password working.
   */
  changePassword(currentPassword: string, newPassword: string): Promise<void> {
    return this.serialized(() => this.changePasswordNow(currentPassword, newPassword));
  }

  private async changePasswordNow(currentPassword: string, newPassword: string): Promise<void> {
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

  /**
   * The app's unlock at boot. A password that does not open the vault (a wrong
   * TR_VAULT_PASSWORD, a corrupted file) leaves the vault locked and is reported rather than
   * thrown, so the app still boots and the user can unlock from the UI. Having no password
   * at all does not throw either: the vault stays locked (or not set up). Resolves whether the vault is now unlocked.
   */
  async unlockAtStartup(): Promise<boolean> {
    if (this.vaultData) return true;
    let password: string;
    try {
      password = await this.requirePassword();
    } catch {
      // No password from TR_VAULT_PASSWORD or the OS secrets manager. The app still boots: with no vault file
      // it is "not set up" (the UI and /vault setup create it); with one, it stays locked until unlocked.
      if (this.vaultFileExists()) {
        this.errorReporter(
          "The vault is locked and no password is available to unlock it (no TR_VAULT_PASSWORD, and the OS secrets manager is not available). " +
            "Unlock it from the UI or with `/vault unlock`.",
        );
      }
      return false;
    }
    return this.openAtStartup(password);
  }

  async start() {
    if (this.vaultData || this.startupUnlockFailed) return;
    this.sessionPassword ||= process.env.TR_VAULT_PASSWORD;
    if (this.sessionPassword) await this.openAtStartup(this.sessionPassword);
  }

  /** Clears the relock timer so a stopped service leaves nothing scheduled. */
  stop() {
    this.clearRelockTimer();
  }

  private async openAtStartup(password: string): Promise<boolean> {
    try {
      this.vaultData = await readOrInitializeVault(this.options.vaultFile, password);
      this.scheduleRelock();
      this.notifyChanged();
      return true;
    } catch (error) {
      this.startupUnlockFailed = true;
      this.vaultData = undefined;
      this.sessionPassword = undefined;
      this.errorReporter(
        `Could not unlock the vault at startup; it stays locked until unlocked from the UI or \`/vault unlock\`. ` +
          `Check TR_VAULT_PASSWORD (or the password in the OS secrets manager). ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  async save(modifications: VaultEntryUpdate[] = [], agent?: Agent) {
    for (const modification of modifications) {
      assertVaultName("category", modification.category);
      assertVaultName("key", modification.key);
    }
    await this.write(data => {
      for (const modification of modifications) {
        ownCategory(data, modification.category)[modification.key] = modification.value;
      }
    }, agent);
  }

  /** Drops the decrypted entries and the cached password from memory. */
  lock() {
    this.clearRelockTimer();
    this.lockGeneration++;
    this.vaultData = undefined;
    this.sessionPassword = undefined;
  }

  private serialized<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.writeQueue.then(fn, fn);
    this.writeQueue = run.catch(() => {});
    return run;
  }

  /**
   * Re-reads the file, applies `mutate`, and writes it back, one write at a time. A write to a
   * locked vault (the app saving a refreshed token) still goes through — the password comes from
   * the resolver — but leaves the vault locked, so Lock means locked until someone unlocks it.
   */
  private write<T>(mutate: (data: VaultFileData) => T, agent?: Agent): Promise<T> {
    return this.serialized(async () => {
      const wasUnlocked = this.unlocked;
      const hadPassword = this.sessionPassword !== undefined;
      const generation = this.lockGeneration;
      let written: VaultFileData | undefined;
      try {
        const { password, data } = await this.reloadForWrite(agent);
        const result = mutate(data);
        await writeVault(this.options.vaultFile, password, data);
        written = data;
        queueMicrotask(() => this.notifyChanged());
        return result;
      } finally {
        if (wasUnlocked && generation === this.lockGeneration) {
          if (written) this.vaultData = written;
          if (this.vaultData) this.scheduleRelock();
        } else {
          // Locked before the write, or locked while it ran: stay locked.
          this.vaultData = undefined;
          if (!hadPassword || generation !== this.lockGeneration) this.sessionPassword = undefined;
        }
      }
    });
  }

  async unlock(agent?: Agent): Promise<VaultFileData> {
    if (this.vaultData) {
      this.scheduleRelock();
      return this.vaultData;
    }

    const password = await this.requirePassword(agent);
    this.vaultData = await readOrInitializeVault(this.options.vaultFile, password);
    this.scheduleRelock();
    this.notifyChanged();
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
      return { password, data: await readOrInitializeVault(this.options.vaultFile, password) };
    } catch (error) {
      this.vaultData = undefined;
      throw new Error(
        `Vault file ${this.options.vaultFile} can no longer be opened with the password this session unlocked it with ` +
          "(was it changed with `vault change-password` while TokenRing was running?). " +
          `Restart TokenRing with the new password before saving.\n\n${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Moves (renames, re-categorizes, or both) one entry. Refuses to overwrite an existing
   * destination unless `overwrite` is set.
   */
  async moveItem(from: { category: string; key: string }, to: { category: string; key: string }, options: { overwrite?: boolean } = {}): Promise<void> {
    if (from.category === to.category && from.key === to.key) return;
    assertVaultName("category", to.category);
    assertVaultName("key", to.key);
    await this.write(data => {
      const value = ownEntry(data, from.category, from.key);
      if (value === undefined) throw new Error(`Key ${from.key} does not exist in category ${from.category}`);
      if (ownEntry(data, to.category, to.key) !== undefined && !options.overwrite) {
        throw new Error(`Key ${to.key} already exists in category ${to.category}`);
      }
      ownCategory(data, to.category)[to.key] = value;
      const source = data.entries[from.category]!;
      delete source[from.key];
      if (Object.keys(source).length === 0) delete data.entries[from.category];
    });
  }

  /** Adds an empty category so it can be filled from the UI. Existing categories are left alone. */
  async createCategory(category: string): Promise<boolean> {
    assertVaultName("category", category);
    return this.write(data => {
      if (Object.hasOwn(data.entries, category)) return false;
      data.entries[category] = {};
      return true;
    });
  }

  requireItem(category: string, key: string): string {
    if (!this.vaultData) throw new Error("Vault is uninitialized or locked");
    this.scheduleRelock();
    const data = this.vaultData;
    if (!Object.hasOwn(data.entries, category)) throw new Error(`Category ${category} does not exist in vault`);
    const value = ownEntry(data, category, key);
    if (!value) throw new Error(`Item ${key} does not exist in category ${category} in vault`);
    return value;
  }

  requireJsonItem<T>(category: string, key: string, schema: z.ZodType<T>): T {
    const value = this.requireItem(category, key);
    return schema.parse(JSON.parse(value));
  }

  getItemsByCategory(category: string): Record<string, string> {
    if (!this.vaultData) throw new Error("Vault is uninitialized or locked");
    this.scheduleRelock();
    return Object.hasOwn(this.vaultData.entries, category) ? this.vaultData.entries[category]! : {};
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
    await this.deleteItems([{ category, key }], agent);
  }

  /**
   * Deletes several entries in one write, all or nothing: if any key is missing, nothing is
   * deleted and the file is left untouched.
   */
  async deleteItems(items: { category: string; key: string }[], agent?: Agent): Promise<void> {
    await this.write(data => {
      for (const { category, key } of items) {
        if (ownEntry(data, category, key) === undefined) {
          throw new Error(`Key ${key} does not exist in category ${category}`);
        }
      }
      for (const { category, key } of items) {
        const entries = data.entries[category];
        if (!entries) continue; // duplicate of an earlier item whose category was emptied
        delete entries[key];
        if (Object.keys(entries).length === 0) delete data.entries[category];
      }
    }, agent);
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

/** The category's own entries object, created when missing. */
function ownCategory(data: VaultFileData, category: string): Record<string, string> {
  if (!Object.hasOwn(data.entries, category)) data.entries[category] = {};
  return data.entries[category]!;
}
