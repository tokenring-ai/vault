import type { RPCSchema } from "@tokenring-ai/rpc/types";
import { z } from "zod";
import { VaultEntryDeleteSchema, VaultEntryUpdateSchema } from "../schema.ts";

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
  },
} satisfies RPCSchema;
