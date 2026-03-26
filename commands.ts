import get from "./commands/vault/get.ts";
import list from "./commands/vault/list.ts";
import lock from "./commands/vault/lock.ts";
import store from "./commands/vault/store.ts";
import unlock from "./commands/vault/unlock.ts";

export default [unlock, lock, list, store, get];
