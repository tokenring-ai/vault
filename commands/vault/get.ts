import {Agent} from "@tokenring-ai/agent";
import {CommandFailedError} from "@tokenring-ai/agent/AgentError";
import VaultService from "../../VaultService.js";

export default async function get(remainder: string, agent: Agent): Promise<string> {
  const vaultService = agent.requireServiceByType(VaultService);
  const key = remainder.trim();
  
  if (!key) {
    throw new CommandFailedError("Usage: /vault get <key>");
  }

  const value = await vaultService.getItem(key, agent);
  
  if (value === undefined) {
    throw new CommandFailedError(`Credential "${key}" not found in vault`);
  } else {
    return `${key}: ${value}`;
  }
}
