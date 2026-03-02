import {Agent} from "@tokenring-ai/agent";
import {CommandFailedError} from "@tokenring-ai/agent/AgentError";
import {TokenRingAgentCommand} from "@tokenring-ai/agent/types";
import VaultService from "../../VaultService.js";

async function execute(remainder: string, agent: Agent): Promise<string> {
  const key = remainder.trim();
  if (!key) throw new CommandFailedError("Usage: /vault get <key>");
  const value = await agent.requireServiceByType(VaultService).getItem(key, agent);
  if (value === undefined) throw new CommandFailedError(`Credential "${key}" not found in vault`);
  return `${key}: ${value}`;
}

export default { name: "vault get", description: "/vault get - Retrieve a credential", help: `# /vault get <key>

Retrieve and display a credential from the vault.

## Example

/vault get api_key`, execute } satisfies TokenRingAgentCommand;
