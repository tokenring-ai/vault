import type TokenRingApp from "@tokenring-ai/app";
import { createPollingQueryStream } from "@tokenring-ai/rpc/createPollingQueryStream";
import { createRPCEndpoint } from "@tokenring-ai/rpc/createRPCEndpoint";
import { VaultService } from "../index.ts";
import VaultRpcSchema, { type VaultStatus } from "./schema.ts";

/**
 * Key names per category. A locked vault lists nothing — reads never unlock it, so
 * "Lock now" in the UI sticks until the user unlocks again.
 */
function projectVaultEntries(app: TokenRingApp): Record<string, string[]> {
  return app.requireService(VaultService).peekEntries() ?? {};
}

function projectStatus(app: TokenRingApp): VaultStatus {
  const vault = app.requireService(VaultService);
  const support = vault.passwordChangeSupport();
  return {
    unlocked: vault.unlocked,
    vaultExists: vault.vaultFileExists(),
    passwordSource: support.source,
    canChangePassword: support.supported,
    ...(support.reason !== undefined && { reason: support.reason }),
  };
}

function requireUnlocked(app: TokenRingApp): VaultService {
  const vault = app.requireService(VaultService);
  if (!vault.unlocked) throw new Error("The vault is locked. Unlock it first.");
  return vault;
}

function failure(error: unknown) {
  return { success: false, message: Error.isError(error) ? error.message : String(error) };
}

const streamEntries = createPollingQueryStream({
  intervalMs: 3000,
  poll: (_args, app) => projectVaultEntries(app),
});

const streamStatus = createPollingQueryStream({
  intervalMs: 2000,
  poll: (_args, app) => projectStatus(app),
});

export default createRPCEndpoint(VaultRpcSchema, {
  listEntries(_args, app: TokenRingApp) {
    return projectVaultEntries(app);
  },

  streamEntries,

  getItem(args, app: TokenRingApp) {
    const vault = requireUnlocked(app);
    const value = vault.getSecret(args.category, args.key);
    if (value === undefined) {
      return { found: false };
    }
    return { found: true, value };
  },

  async setItems(args, app: TokenRingApp) {
    const vault = requireUnlocked(app);
    await vault.save(args.updates);
    return { success: true, message: `Saved ${args.updates.length} item(s)` };
  },

  async deleteItems(args, app: TokenRingApp) {
    const vault = requireUnlocked(app);
    try {
      await vault.deleteItems(args.updates);
      return {
        success: true,
        message: `Deleted ${args.updates.length} item(s)`,
      };
    } catch (e: unknown) {
      return { success: false, message: Error.isError(e) ? e.message : String(e) };
    }
  },

  async moveItem(args, app: TokenRingApp) {
    try {
      await requireUnlocked(app).moveItem(args.from, args.to, { overwrite: args.overwrite });
      return { success: true, message: `Moved ${args.from.category}/${args.from.key} to ${args.to.category}/${args.to.key}` };
    } catch (error: unknown) {
      return failure(error);
    }
  },

  async createCategory(args, app: TokenRingApp) {
    try {
      const category = args.category.trim();
      if (!category) return { success: false, message: "Category name is required" };
      const created = await requireUnlocked(app).createCategory(category);
      return created ? { success: true, message: `Created category ${category}` } : { success: false, message: `Category ${category} already exists` };
    } catch (error: unknown) {
      return failure(error);
    }
  },

  getStatus(_args, app: TokenRingApp) {
    return projectStatus(app);
  },

  streamStatus,

  lock(_args, app: TokenRingApp) {
    app.requireService(VaultService).lock();
    return { success: true, message: "Vault locked" };
  },

  async unlock(args, app: TokenRingApp) {
    try {
      await app.requireService(VaultService).unlockExisting(args.password);
      return { success: true, message: "Vault unlocked" };
    } catch (error: unknown) {
      return failure(error);
    }
  },

  async createVault(args, app: TokenRingApp) {
    try {
      const created = await app.requireService(VaultService).createVault(args.password);
      return { success: true, message: created.message, passwordStored: created.passwordStored };
    } catch (error: unknown) {
      return { ...failure(error), passwordStored: false };
    }
  },

  async changePassword(args, app: TokenRingApp) {
    try {
      await app.requireService(VaultService).changePassword(args.currentPassword, args.newPassword);
      return { success: true, message: "Vault password changed" };
    } catch (error: unknown) {
      return failure(error);
    }
  },
});
