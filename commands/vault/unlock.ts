import {Agent} from "@tokenring-ai/agent";
import VaultService from "../../VaultService.js";

export default async function unlock(_remainder: string, agent: Agent): Promise<void> {
  const vaultService = agent.requireServiceByType(VaultService);
  
  await vaultService.unlockVault(agent);
  agent.infoLine("Vault unlocked successfully");
}
