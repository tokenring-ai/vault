import {Agent} from "@tokenring-ai/agent";
import {TokenRingService} from "@tokenring-ai/app/types";
import fs from "fs-extra";
import {readVault, writeVault, initVault} from "./vault.ts";
export interface VaultOptions {
  vaultFile: string;
  relockTime: number;
}

export default class VaultService implements TokenRingService {
  // Add password caching during session
  private sessionPassword: string | undefined;

  name = "VaultService";
  description = "A vault service for storing persisted credentials";

  private readonly vaultFile: string;
  private vaultData: Record<string, string> | undefined;
  private relockTimer: NodeJS.Timeout | undefined;
  private readonly relockTime = 300 * 1000; // 5 minutes

  constructor(options: VaultOptions) {
    this.vaultFile = options.vaultFile;
    this.relockTime = options.relockTime;
  }



  private async initializeVault(agent: Agent): Promise<Record<string, string>> {
    agent.infoLine("Vault file does not exist, creating a new empty vault.");
    
    this.sessionPassword = await agent.askHuman({
      type: "askForPassword",
      message: "Set a password for the new vault."
    });
    
    if (!this.sessionPassword) {
      throw new Error("Password was empty, vault creation cancelled");
    }
    
    await initVault(this.vaultFile, this.sessionPassword);
    this.vaultData = {};
    this.scheduleRelock();
    return {};
  }

  private scheduleRelock(): void {
    this.relockTimer = setTimeout(() => this.lock(), this.relockTime);
  }

  async unlockVault(agent: Agent): Promise<Record<string, string>> {
    if (this.relockTimer) {
      clearTimeout(this.relockTimer);
      this.relockTimer = setTimeout(() => this.lock(), this.relockTime);
    }

    if (this.vaultData) return this.vaultData;

    if (!await fs.pathExists(this.vaultFile)) {
      return await this.initializeVault(agent);
    }

    if (!this.sessionPassword) {
      this.sessionPassword = await agent.askHuman({
        type: "askForPassword",
        message: "Enter your password to unlock the vault."
      });
    }

    if (! this.sessionPassword) {
      throw new Error("Password was empty, vault unlock cancelled");
    }

    try {
      this.vaultData = await readVault(this.vaultFile, this.sessionPassword);
      this.scheduleRelock();
      return this.vaultData;
    } catch (error) {
      this.sessionPassword = undefined;
      throw new Error('Failed to decrypt vault. Invalid password or corrupted vault file.');
    }
  }

  async lock(): Promise<void> {
    this.vaultData = undefined;
    this.sessionPassword = undefined;
    if (this.relockTimer) {
      clearTimeout(this.relockTimer);
      this.relockTimer = undefined;
    }
  }

  async save(vaultData: Record<string, string>, agent: Agent) {
    if (!this.sessionPassword) {
      throw new Error('Vault must be unlocked before saving');
    }

    await writeVault(this.vaultFile, this.sessionPassword, vaultData);
    this.vaultData = vaultData;
  }

  async getItem(key: string, agent: Agent): Promise<string | undefined> {
    const vaultData = await this.unlockVault(agent);
    return vaultData[key];
  }

  async setItem(key: string, value: string, agent: Agent): Promise<void> {
    const vaultData = await this.unlockVault(agent);
    vaultData[key] = value;
    await this.save(vaultData, agent);
  }
}