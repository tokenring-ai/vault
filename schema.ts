import {z} from "zod";

export const VaultConfigSchema = z.object({
  vaultFile: z.string().min(1),
  relockTime: z.number().positive().default(300 * 1000),
})
export type ParsedVaultConfig = z.output<typeof VaultConfigSchema>;