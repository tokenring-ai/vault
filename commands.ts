import list from "./commands/vault/list.ts";
import lock from "./commands/vault/lock.ts";
import setup from "./commands/vault/setup.ts";
import store from "./commands/vault/store.ts";
import unlock from "./commands/vault/unlock.ts";

export default [setup, unlock, lock, list, store];
