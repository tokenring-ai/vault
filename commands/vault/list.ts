import {Agent} from "@tokenring-ai/agent";
import {TokenRingAgentCommand} from "@tokenring-ai/agent/types";
import markdownList from "@tokenring-ai/utility/string/markdownList";
import VaultService from "../../VaultService.js";

async function execute(_remainder: string, agent: Agent): Promise<string> {
  const keys = Object.keys(await agent.requireServiceByType(VaultService).unlockVault(agent));
  return keys.length === 0 ? "Vault is empty" : `Vault credentials:\n${markdownList(keys)}`;
}

export default {
  name: "vault list", description: "List vault credentials", help: `# /vault list

List all credential keys stored in the vault.

## Example

/vault list`, execute } satisfies TokenRingAgentCommand;
