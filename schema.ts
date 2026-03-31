import {z} from "zod";

export const VaultConfigSchema = z.object({
  vaultFile: z.string().min(1),
  relockTime: z.number().optional()
});
export type ParsedVaultConfig = z.output<typeof VaultConfigSchema>;