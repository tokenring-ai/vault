import {Agent} from "@tokenring-ai/agent";
import {CommandFailedError} from "@tokenring-ai/agent/AgentError";
import {TokenRingAgentCommand} from "@tokenring-ai/agent/types";
import VaultService from "../../VaultService.js";

async function execute(remainder: string, agent: Agent): Promise<string> {
  const key = remainder.trim();
  if (!key) throw new CommandFailedError("Usage: /vault store <key>");
  const value = await agent.askForText({ masked: true, message: `Enter value for "${key}"`, label: "Value" });
  if (!value) return "Store cancelled";
  await agent.requireServiceByType(VaultService).setItem(key, value, agent);
  return `Stored credential: ${key}`;
}

export default {
  name: "vault store", description: "Store a credential", help: `# /vault store <key>

Store a credential in the vault. Prompts securely for the value.

## Example

/vault store api_key`, execute } satisfies TokenRingAgentCommand;
