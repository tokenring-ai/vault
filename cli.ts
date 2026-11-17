#!/usr/bin/env bun
import { spawn } from "node:child_process";
import readline from "node:readline";
import { Command } from "commander";
import fs from "fs-extra";
import { keychainPasswordStore } from "./keychain.ts";
import packageJSON from "./package.json" with { type: "json" };
import VaultService from "./VaultService.ts";
import { assertVaultName, initVault, ownEntry, readVault, writeVault } from "./vault.ts";

/** Splits `category.key` (the key may itself contain dots); both parts must be usable names. */
export function parseEntryPath(path: string): { category: string; key: string } {
  const dot = path.indexOf(".");
  const category = dot === -1 ? path : path.slice(0, dot);
  const key = dot === -1 ? "" : path.slice(dot + 1);
  if (!key) throw new Error(`"${path}" is not a vault entry; use category.key`);
  assertVaultName("category", category);
  assertVaultName("key", key);
  return { category, key };
}

/** Runs a command action, printing a failure instead of a stack trace. */
function cli<A extends unknown[]>(action: (...args: A) => Promise<void>): (...args: A) => Promise<void> {
  return async (...args: A) => {
    try {
      await action(...args);
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  };
}

let rlInterface: readline.Interface | undefined;

function getReadlineInterface(): readline.Interface {
  if (!rlInterface) {
    rlInterface = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: process.stdin.isTTY,
    });
  }
  return rlInterface;
}

function askPassword(message: string): Promise<string> {
  const rl = getReadlineInterface();

  if (!process.stdin.isTTY) {
    return new Promise(resolve => {
      rl.question(message, answer => {
        resolve(answer.trim());
      });
    });
  }

  return new Promise(resolve => {
    process.stdin.setRawMode(true);
    process.stdout.write(message + " ");

    let password = "";
    const onData = (char: Buffer) => {
      const byte = char.toString();

      if (byte === "\n" || byte === "\r" || byte === "\u0004") {
        process.stdin.setRawMode(false);
        process.stdout.write("\n");
        process.stdin.removeListener("data", onData);
        resolve(password);
      } else if (byte === "\u0003") {
        process.exit(1);
      } else if (byte === "\u007f") {
        password = password.slice(0, -1);
      } else {
        password += byte;
      }
    };
    process.stdin.on("data", onData);
  });
}

const program = new Command();

program.name("vault").version(packageJSON.version).description("Encrypted vault for managing secrets").option("-f, --file <path>", "Vault file path", ".vault");

program
  .command("init")
  .description("Initialize a new vault")
  .option("--force", "Replace an existing vault file, discarding every secret in it")
  .action(
    cli(async (options: { force?: boolean }) => {
      const opts = program.opts();
      if ((await fs.pathExists(opts.file)) && !options.force) {
        throw new Error(`${opts.file} already exists. Re-running init would replace it with an empty vault; pass --force if that is really what you want.`);
      }
      const password = await askPassword("Set a password for the new vault:");
      if (!password) throw new Error("The password must not be empty");
      await initVault(opts.file, password);
      console.log(`Vault initialized: ${opts.file}`);
    }),
  );

program
  .command("get <key>")
  .description("Get a secret value (format: category.key)")
  .action(
    cli(async (path: string) => {
      const opts = program.opts();
      const { category, key } = parseEntryPath(path);
      const password = await askPassword("Enter vault password:");
      const data = await readVault(opts.file, password);
      console.log(ownEntry(data, category, key) ?? "");
    }),
  );

program
  .command("set <key> <value>")
  .description("Set a secret value (format: category.key)")
  .action(
    cli(async (path: string, value: string) => {
      const opts = program.opts();
      const { category, key } = parseEntryPath(path);
      if (!value) throw new Error("The value must not be empty");
      const password = await askPassword("Enter vault password:");
      const data = await readVault(opts.file, password);
      if (!Object.hasOwn(data.entries, category)) data.entries[category] = {};
      data.entries[category]![key] = value;
      await writeVault(opts.file, password, data);
      console.log(`Set ${path}`);
    }),
  );

program
  .command("list")
  .description("List all secret keys")
  .action(async () => {
    const opts = program.opts();
    const password = await askPassword("Enter vault password:");
    const data = await readVault(opts.file, password);
    for (const [category, entries] of Object.entries(data.entries)) {
      for (const key of Object.keys(entries)) {
        console.log(`${category}.${key}`);
      }
    }
  });

program
  .command("remove <key>")
  .description("Remove a secret (format: category.key)")
  .action(
    cli(async (path: string) => {
      const opts = program.opts();
      const { category, key } = parseEntryPath(path);
      const password = await askPassword("Enter vault password:");
      const data = await readVault(opts.file, password);
      if (ownEntry(data, category, key) === undefined) throw new Error(`${path} is not in the vault`);
      const items = data.entries[category]!;
      delete items[key];
      if (Object.keys(items).length === 0) delete data.entries[category];
      await writeVault(opts.file, password, data);
      console.log(`Removed ${path}`);
    }),
  );

program
  .command("change-password")
  .description("Change vault password")
  .action(
    cli(async () => {
      const opts = program.opts();
      const oldPassword = await askPassword("Enter current vault password:");
      await readVault(opts.file, oldPassword);
      const newPassword = await askPassword("Enter new vault password:");
      if (newPassword.length < 8) throw new Error("The new password must be at least 8 characters");
      if ((await askPassword("Repeat the new vault password:")) !== newPassword) throw new Error("The passwords did not match; nothing was changed");

      // The same path as the app's own password change: the file is swapped in only after the OS
      // keychain entry TokenRing unlocks with (if it holds the old password) has been updated.
      const fromEnvironment = !!process.env.TR_VAULT_PASSWORD;
      const service = new VaultService({ vaultFile: String(opts.file) });
      if (!fromEnvironment) service.setPasswordStore(keychainPasswordStore);
      await service.changePassword(oldPassword, newPassword);
      console.log("Password changed successfully");
      if (fromEnvironment) console.log("TR_VAULT_PASSWORD is set: update it to the new password before starting TokenRing again.");
    }),
  );

program
  .command("run")
  .description("Run a command with vault secrets as environment variables")
  .argument("<command>", "Command to execute")
  .argument("[args...]", "Command arguments")
  .action(async (command: string, args: string[]) => {
    const opts = program.opts();
    const password = await askPassword("Enter vault password:");
    const data = await readVault(opts.file, password);

    const env = { ...process.env };
    for (const entries of Object.values(data.entries)) {
      for (const [key, value] of Object.entries(entries)) {
        env[key] = value;
      }
    }

    const child = spawn(command, args, {
      env,
      stdio: "inherit",
    });

    // Without a shell, args reach the executable verbatim (no re-parsing/quotes).
    child.on("error", err => {
      console.error(`Failed to run ${command}: ${err.message}`);
      process.exit(1);
    });
    child.on("exit", code => {
      process.exit(code ?? 0);
    });
  });

await program.parseAsync(process.argv);

if (rlInterface) {
  rlInterface.close();
}
