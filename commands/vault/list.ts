import {Agent} from "@tokenring-ai/agent";
import markdownList from "@tokenring-ai/utility/string/markdownList";
import VaultService from "../../VaultService.js";

export default async function list(_remainder: string, agent: Agent): Promise<void> {
  const vaultService = agent.requireServiceByType(VaultService);
  
  const vaultData = await vaultService.unlockVault(agent);
  const keys = Object.keys(vaultData);
  
  if (keys.length === 0) {
    agent.infoMessage("Vault is empty");
  } else {
    const lines: string[] = [
      "Vault credentials:",
      markdownList(keys)
    ];
    agent.infoMessage(lines.join("\n"));
  }
}
