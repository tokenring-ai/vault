import get from './commands/vault/get.js';
import list from './commands/vault/list.js';
import lock from './commands/vault/lock.js';
import store from './commands/vault/store.js';
import unlock from './commands/vault/unlock.js';

export default [unlock, lock, list, store, get];
