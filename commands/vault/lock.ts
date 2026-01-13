import {Agent} from "@tokenring-ai/agent";
import VaultService from "../../VaultService.js";

export default async function lock(_remainder: string, agent: Agent): Promise<void> {
  const vaultService = agent.requireServiceByType(VaultService);
  
  await vaultService.lock();
  agent.infoLine("Vault locked");
}
