import type {RPCSchema} from "@tokenring-ai/rpc/types";
import {z} from "zod";
import {VaultEntryDeleteSchema, VaultEntryUpdateSchema} from "../schema.ts";

export default {
  name: "Vault RPC",
  path: "/rpc/vault",
  methods: {
    listEntries: {
      type: "query",
      input: z.object({}),
      result: z.record(z.string(), z.string()),
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
