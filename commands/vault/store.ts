import {Agent} from "@tokenring-ai/agent";
import {CommandFailedError} from "@tokenring-ai/agent/AgentError";
import VaultService from "../../VaultService.js";

export default async function store(remainder: string, agent: Agent): Promise<string> {
  const vaultService = agent.requireServiceByType(VaultService);
  const key = remainder.trim();
  
  if (!key) {
    throw new CommandFailedError("Usage: /vault store <key>");
  }

  const value = await agent.askForText({
    masked: true,
    message: `Enter value for "${key}"`,
    label: "Value"
  });

  if (!value) {
    return "Store cancelled";
  }

  await vaultService.setItem(key, value, agent);
  return `Stored credential: ${key}`;
}
