import {TokenRingAgentCommand} from "@tokenring-ai/agent/types";
import createSubcommandRouter from "@tokenring-ai/agent/util/subcommandRouter";
import unlock from "./vault/unlock.js";
import lock from "./vault/lock.js";
import list from "./vault/list.js";
import store from "./vault/store.js";
import get from "./vault/get.js";

const description = "/vault - Manage encrypted credential vault";

const execute = createSubcommandRouter({
  unlock,
  lock,
  list,
  store,
  get
});

const help: string = `# /vault - Manage encrypted credential vault

## Commands

### /vault unlock
Unlock the vault with password

### /vault lock
Lock the vault

### /vault list
List all credential keys in the vault

### /vault store <key>
Store a credential in the vault
- Prompts for the credential value securely

### /vault get <key>
Retrieve and display a credential from the vault

## Examples

/vault unlock
/vault list
/vault store api_key
/vault get api_key
/vault lock`;

export default {
  description,
  execute,
  help,
} satisfies TokenRingAgentCommand;
