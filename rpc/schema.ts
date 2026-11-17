import type { RPCSchema } from "@tokenring-ai/rpc/types";
import { z } from "zod";
import { VaultEntryDeleteSchema, VaultEntryUpdateSchema } from "../schema.ts";

const MutationResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

export const VaultStatusSchema = z.object({
  unlocked: z.boolean(),
  /** Whether a vault file exists. False and locked means "not set up yet": the app asks for a password to create one. */
  vaultExists: z.boolean(),
  /** Where the password is kept between runs: "keychain", "environment", or "session". */
  passwordSource: z.string(),
  /** Whether changePassword can run from here; `reason` says why not. */
  canChangePassword: z.boolean(),
  reason: z.string().exactOptional(),
});
export type VaultStatus = z.infer<typeof VaultStatusSchema>;

export default {
  name: "Vault RPC",
  path: "/rpc/vault",
  methods: {
    listEntries: {
      type: "query",
      input: z.object({}),
      result: z.record(z.string(), z.array(z.string())),
    },
    streamEntries: {
      type: "stream",
      input: z.object({}),
      result: z.record(z.string(), z.array(z.string())),
    },
    /** Fetch a single secret value on demand (for reveal in the Vault UI). */
    getItem: {
      type: "query",
      input: z.object({
        category: z.string().min(1),
        key: z.string().min(1),
      }),
      result: z.object({
        found: z.boolean(),
        value: z.string().optional(),
      }),
    },
    setItems: {
      type: "mutation",
      input: z.object({
        updates: z.array(VaultEntryUpdateSchema),
      }),
      result: z.object({
        success: z.boolean(),
        message: z.string(),
      }),
    },
    deleteItems: {
      type: "mutation",
      input: z.object({
        updates: z.array(VaultEntryDeleteSchema),
      }),
      result: z.object({
        success: z.boolean(),
        message: z.string(),
      }),
    },
    /** Rename a key, move it to another category, or both. */
    moveItem: {
      type: "mutation",
      input: z.object({
        from: VaultEntryDeleteSchema,
        to: VaultEntryDeleteSchema,
        overwrite: z.boolean().default(false),
      }),
      result: MutationResultSchema,
    },
    createCategory: {
      type: "mutation",
      input: z.object({
        category: z.string().min(1).max(64),
      }),
      result: MutationResultSchema,
    },
    /** Locked state and whether the password can be changed from the UI. Never unlocks. */
    getStatus: {
      type: "query",
      input: z.object({}),
      result: VaultStatusSchema,
    },
    streamStatus: {
      type: "stream",
      input: z.object({}),
      result: VaultStatusSchema,
    },
    /** Drop the decrypted entries and cached password from server memory. */
    lock: {
      type: "mutation",
      input: z.object({}),
      result: MutationResultSchema,
    },
    /** Unlock with the given password, or without one from the environment / OS secrets manager. */
    unlock: {
      type: "mutation",
      input: z.object({
        password: z.string().min(1).exactOptional(),
      }),
      result: MutationResultSchema,
    },
    /**
     * Create the vault with a password the user chose, unlock it, and try to keep the password in the OS secrets
     * manager. Refuses when a vault file already exists or the password is too short. The password is never echoed.
     */
    createVault: {
      type: "mutation",
      input: z.object({
        password: z.string().min(1),
      }),
      result: z.object({
        success: z.boolean(),
        message: z.string(),
        /** Whether the password was saved in the OS secrets manager (otherwise it is needed at every start). */
        passwordStored: z.boolean(),
      }),
    },
    /** Re-encrypt the vault under a new master password (and update the OS secrets manager entry). */
    changePassword: {
      type: "mutation",
      input: z.object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(8),
      }),
      result: MutationResultSchema,
    },
  },
} satisfies RPCSchema;
