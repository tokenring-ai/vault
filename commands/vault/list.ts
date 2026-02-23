import {Agent} from "@tokenring-ai/agent";
import markdownList from "@tokenring-ai/utility/string/markdownList";
import VaultService from "../../VaultService.js";

export default async function list(_remainder: string, agent: Agent): Promise<string> {
  const vaultService = agent.requireServiceByType(VaultService);
  
  const vaultData = await vaultService.unlockVault(agent);
  const keys = Object.keys(vaultData);
  
  if (keys.length === 0) {
    return "Vault is empty";
  } else {
    const lines: string[] = [
      "Vault credentials:",
      markdownList(keys)
    ];
    return lines.join("\n");
  }
}
