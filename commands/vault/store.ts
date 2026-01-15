import {Agent} from "@tokenring-ai/agent";
import VaultService from "../../VaultService.js";

export default async function store(remainder: string, agent: Agent): Promise<void> {
  const vaultService = agent.requireServiceByType(VaultService);
  const key = remainder.trim();
  
  if (!key) {
    agent.errorMessage("Usage: /vault store <key>");
    return;
  }

  const value = await agent.askHuman({
    type: "askForPassword",
    message: `Enter value for "${key}"`
  });

  if (!value) {
    agent.infoMessage("Store cancelled");
    return;
  }

  await vaultService.setItem(key, value, agent);
  agent.infoMessage(`Stored credential: ${key}`);
}
