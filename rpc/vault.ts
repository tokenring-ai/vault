import type TokenRingApp from "@tokenring-ai/app";
import {createRPCEndpoint} from "@tokenring-ai/rpc/createRPCEndpoint";
import {VaultService} from "../index.ts";
import VaultRpcSchema from "./schema.ts";

export default createRPCEndpoint(VaultRpcSchema, {
  async listEntries(_args, app: TokenRingApp) {
    const vault = app.requireService(VaultService);
    const data = await vault.unlock();
    const flat: Record<string, string> = {};
    for (const [category, entries] of Object.entries(data.entries)) {
      for (const [key, value] of Object.entries(entries)) {
        flat[`${category}.${key}`] = value;
      }
    }
    return flat;
  },

  async setItems(args, app: TokenRingApp) {
    const vault = app.requireService(VaultService);
    await vault.save(args.updates);
    return {success: true, message: `Saved ${args.updates.length} item(s)`};
  },

  async deleteItems(args, app: TokenRingApp) {
    const vault = app.requireService(VaultService);
    try {
      for (const {category, key} of args.updates) {
        await vault.deleteItem(category, key);
      }
      return {
        success: true,
        message: `Deleted ${args.updates.length} item(s)`,
      };
    } catch (e: any) {
      return {success: false, message: e.message};
    }
  },
});
