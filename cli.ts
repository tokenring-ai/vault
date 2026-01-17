#!/usr/bin/env bun
import {spawn} from 'child_process';
import {Command} from 'commander';
import readline from 'readline';
import {initVault, readVault, writeVault} from './vault.ts';

let rlInterface: readline.Interface | undefined;

function getReadlineInterface(): readline.Interface {
  if (!rlInterface) {
    rlInterface = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: process.stdin.isTTY
    });
  }
  return rlInterface;
}

async function askPassword(message: string): Promise<string> {
  const rl = getReadlineInterface();

  if (!process.stdin.isTTY) {
    return new Promise((resolve) => {
      rl.question(message, (answer) => {
        resolve(answer.trim());
      });
    });
  }

  return new Promise((resolve) => {
    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(true);
    }
    process.stdout.write(message + ' ');
    
    let password = '';
    const onData = (char: Buffer) => {
      const byte = char.toString();
      
      if (byte === '\n' || byte === '\r' || byte === '\u0004') {
        if (process.stdin.setRawMode) {
          process.stdin.setRawMode(false);
        }
        process.stdout.write('\n');
        process.stdin.removeListener('data', onData);
        resolve(password);
      } else if (byte === '\u0003') {
        process.exit(1);
      } else if (byte === '\u007f') {
        password = password.slice(0, -1);
      } else {
        password += byte;
      }
    };
    process.stdin.on('data', onData);
  });
}

const program = new Command();

program
  .name('vault')
  .version('0.1.0')
  .description('Encrypted vault for managing secrets')
  .option('-f, --file <path>', 'Vault file path', '.vault');

program
  .command('init')
  .description('Initialize a new vault')
  .action(async () => {
    const opts = program.opts();
    const password = await askPassword('Set a password for the new vault:');
    await initVault(opts.file, password);
    console.log(`Vault initialized: ${opts.file}`);
  });

program
  .command('get <key>')
  .description('Get a secret value')
  .action(async (key) => {
    const opts = program.opts();
    const password = await askPassword('Enter vault password:');
    const data = await readVault(opts.file, password);
    console.log(data[key] ?? '');
  });

program
  .command('set <key> <value>')
  .description('Set a secret value')
  .action(async (key, value) => {
    const opts = program.opts();
    const password = await askPassword('Enter vault password:');
    const data = await readVault(opts.file, password);
    data[key] = value;
    await writeVault(opts.file, password, data);
    console.log(`Set ${key}`);
  });

program
  .command('list')
  .description('List all secret keys')
  .action(async () => {
    const opts = program.opts();
    const password = await askPassword('Enter vault password:');
    const data = await readVault(opts.file, password);
    console.log(Object.keys(data).join('\n'));
  });

program
  .command('remove <key>')
  .description('Remove a secret')
  .action(async (key) => {
    const opts = program.opts();
    const password = await askPassword('Enter vault password:');
    const data = await readVault(opts.file, password);
    delete data[key];
    await writeVault(opts.file, password, data);
    console.log(`Removed ${key}`);
  });

program
  .command('change-password')
  .description('Change vault password')
  .action(async () => {
    try {
      const opts = program.opts();
      const oldPassword = await askPassword('Enter current vault password:');
      const data = await readVault(opts.file, oldPassword);
      const newPassword = await askPassword('Enter new vault password:');
      await writeVault(opts.file, newPassword, data);
      console.log('Password changed successfully');
    } catch (e: any) {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    }
  });

program
  .command('run')
  .description('Run a command with vault secrets as environment variables')
  .argument('<command>', 'Command to execute')
  .argument('[args...]', 'Command arguments')
  .action(async (command, args) => {
    const opts = program.opts();
    const password = await askPassword('Enter vault password:');
    const data = await readVault(opts.file, password);
    
    const env = { ...process.env };
    for (const [key, value] of Object.entries(data)) {
      env[key] = value;
    }
    
    const child = spawn(command, args, {
      env,
      stdio: 'inherit',
      shell: true
    });
    
    child.on('exit', (code) => {
      process.exit(code ?? 0);
    });
  });

program.parseAsync(process.argv).then(() => {
  if (rlInterface) {
    rlInterface.close();
  }
});
