import type TokenRingApp from "@tokenring-ai/app";
import { createPollingQueryStream } from "@tokenring-ai/rpc/createPollingQueryStream";
import { createRPCEndpoint } from "@tokenring-ai/rpc/createRPCEndpoint";
import { VaultService } from "../index.ts";
import VaultRpcSchema from "./schema.ts";

async function projectVaultEntries(app: TokenRingApp) {
  const vault = app.requireService(VaultService);
  const data = await vault.unlock();
  return Object.fromEntries(Object.entries(data.entries).map(([category, items]) => [category, Object.keys(items)]));
}

const streamEntries = createPollingQueryStream({
  intervalMs: 10000,
  poll: async (_args, app) => projectVaultEntries(app),
});

export default createRPCEndpoint(VaultRpcSchema, {
  async listEntries(_args, app: TokenRingApp) {
    const vault = app.requireService(VaultService);
    const data = await vault.unlock();
    return projectVaultEntries(app);
  },

  streamEntries,

  async setItems(args, app: TokenRingApp) {
    const vault = app.requireService(VaultService);
    await vault.save(args.updates);
    return { success: true, message: `Saved ${args.updates.length} item(s)` };
  },

  async deleteItems(args, app: TokenRingApp) {
    const vault = app.requireService(VaultService);
    try {
      for (const { category, key } of args.updates) {
        await vault.deleteItem(category, key);
      }
      return {
        success: true,
        message: `Deleted ${args.updates.length} item(s)`,
      };
    } catch (e: unknown) {
      return { success: false, message: Error.isError(e) ? e.message : String(e) };
    }
  },
});
