import type { ConfigFieldMeta } from "@tokenring-ai/app/config/metadata";
import { z } from "zod";

export const VaultConfigSchema = z
  .object({
    vaultFile: z
      .string()
      .min(1)
      .meta({ restartRequired: true, description: "Path to the encrypted vault file" } satisfies ConfigFieldMeta),
    relockTime: z
      .number()
      .exactOptional()
      .meta({ unit: "ms", advanced: true, description: "Idle time before the vault automatically relocks" } satisfies ConfigFieldMeta),
  })
  .meta({ label: "Vault", description: "Encrypted secret storage" } satisfies ConfigFieldMeta);
export type ParsedVaultConfig = z.output<typeof VaultConfigSchema>;

export const VaultFileSchema = z.object({
  vaultVersion: z.number().default(1),
  entries: z.record(z.string().min(1), z.record(z.string().min(1), z.string())),
});

export type VaultFileData = z.output<typeof VaultFileSchema>;

export const VaultEntryDeleteSchema = z.object({
  category: z.string().min(1),
  key: z.string().min(1),
});

export type VaultEntryDelete = z.input<typeof VaultEntryDeleteSchema>;

export const VaultEntryUpdateSchema = z.object({
  category: z.string().min(1),
  key: z.string().min(1),
  value: z.string().min(1),
});

export type VaultEntryUpdate = z.input<typeof VaultEntryUpdateSchema>;
