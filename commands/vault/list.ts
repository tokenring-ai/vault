import {Agent} from "@tokenring-ai/agent";
import VaultService from "../../VaultService.js";

export default async function list(_remainder: string, agent: Agent): Promise<void> {
  const vaultService = agent.requireServiceByType(VaultService);
  
  const vaultData = await vaultService.unlockVault(agent);
  const keys = Object.keys(vaultData);
  
  if (keys.length === 0) {
    agent.infoLine("Vault is empty");
  } else {
    agent.infoLine("Vault credentials:");
    for (const key of keys) {
      agent.infoLine(`  - ${key}`);
    }
  }
}
