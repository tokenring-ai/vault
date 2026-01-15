import {Agent} from "@tokenring-ai/agent";
import VaultService from "../../VaultService.js";

export default async function get(remainder: string, agent: Agent): Promise<void> {
  const vaultService = agent.requireServiceByType(VaultService);
  const key = remainder.trim();
  
  if (!key) {
    agent.errorMessage("Usage: /vault get <key>");
    return;
  }

  const value = await vaultService.getItem(key, agent);
  
  if (value === undefined) {
    agent.errorMessage(`Credential "${key}" not found in vault`);
  } else {
    agent.infoMessage(`${key}: ${value}`);
  }
}
