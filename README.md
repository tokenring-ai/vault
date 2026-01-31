# @tokenring-ai/vault

## Overview

A secure, encrypted vault for managing secrets and credentials. Works both as a standalone CLI tool and as a TokenRing service for programmatic access. The vault uses AES-256-GCM encryption with PBKDF2 key derivation for strong security. Files are stored with restrictive permissions (0o600), and the service automatically locks after a configurable timeout to prevent unauthorized access.

## Features

- **AES-256-GCM Encryption**: Industry-standard encryption for secrets at rest
- **Dual Interface**: Use as CLI tool or integrate as TokenRing service
- **Environment Variable Injection**: Run commands with vault secrets as env vars
- **Secure Password Input**: Hidden password entry in terminal
- **Restrictive Permissions**: Vault files created with 0o600 (owner-only access)
- **Session Management**: Automatic locking and password caching for TokenRing service
- **Plugin Integration**: Seamless integration with TokenRing application framework
- **Commander CLI**: Full featured command-line interface with password masking
- **Chat Commands**: Integrated chat commands for agent interaction (/vault unlock, lock, list, store, get)
- **Zod Configuration**: Type-safe configuration with schema validation
- **Comprehensive Testing**: Unit and integration tests with Vitest

## Chat Commands

The vault package provides integrated chat commands for managing credentials within the agent interface:

### `/vault unlock`
Unlock the vault with password

### `/vault lock`
Lock the vault

### `/vault list`
List all credential keys in the vault

### `/vault store <key>`
Store a credential in the vault
- Prompts for the credential value securely

### `/vault get <key>`
Retrieve and display a credential from the vault

**Example usage:**
```
/vault unlock
/vault list
/vault store api_key
/vault get api_key
/vault lock
```

## Plugin Configuration

The plugin configuration options are defined in plugin.ts and VaultService.ts.

```typescript
import vaultPlugin from '@tokenring-ai/vault';
import TokenRingApp from '@tokenring-ai/app';

const app = new TokenRingApp();
app.usePlugin(vaultPlugin);
```

Configuration schema for the plugin:

```typescript
const packageConfigSchema = z.object({
  vault: vaultConfigSchema.optional()
});
```

## Agent Configuration

The VaultService has an attach method that merges in an agent config schema.

```typescript
// The VaultService doesn't have a separate agent config schema
// It uses the vaultConfigSchema from the plugin configuration
```

## Tools

This package does not have a tools.ts file or tools/ directory.

## Services

### VaultService

The main service class for programmatic access to the vault.

```typescript
import VaultService from '@tokenring-ai/vault';
```

**Properties:**

- `name`: "VaultService" - The service identifier
- `description`: "A vault service for storing persisted credentials" - Service description

**Methods:**

- `unlockVault(agent: Agent): Promise<Record<string, string>>`
  - Unlocks the vault by prompting for the password (if not already unlocked), decrypts the vault file, and returns the data. If the vault is already unlocked, returns the cached data.
  - Parameters:
    - `agent` (Agent): The Agent instance used for human interaction prompts, such as password entry.
  - Returns: Promise resolving to the decrypted vault data

- `lock(): Promise<void>`
  - Locks the vault, clearing all cached data and password. The vault must be re-unlocked to access secrets.

- `save(vaultData: Record<string, string>, agent: Agent): Promise<void>`
  - Writes the updated vault data to the vault file, re-encrypting it with the current session password.
  - Parameters:
    - `vaultData` (Record<string, string>): The updated vault data to save.
    - `agent` (Agent): Agent instance for interaction.

- `getItem(key: string, agent: Agent): Promise<string | undefined>`
  - Retrieves a secret value by key.
  - Parameters:
    - `key` (string): The secret key to retrieve.
    - `agent` (Agent): Agent instance for interaction.
  - Returns: Promise resolving to the secret value or undefined if not found.

- `setItem(key: string, value: string, agent: Agent): Promise<void>`
  - Updates the vault with a new key-value pair, saving the changes.
  - Parameters:
    - `key` (string): The secret key to set.
    - `value` (string): The value to store for the key.
    - `agent` (Agent): Agent instance for interaction.

## CLI Usage

### Initialize a New Vault

```bash
vault init
vault init -f ~/.secrets.vault
```

Creates a new encrypted vault file. You'll be prompted to set a password.

### Store Secrets

```bash
vault set API_KEY sk-1234567890
vault set DB_PASSWORD mySecretPassword
vault set -f ~/.secrets.vault AWS_KEY abc123
```

### Retrieve Secrets

```bash
vault get API_KEY
vault get DB_PASSWORD
```

### List All Keys

```bash
vault list
```

Shows all secret keys (not values) stored in the vault.

### Remove Secrets

```bash
vault remove API_KEY
vault remove OLD_TOKEN
```

### Change Vault Password

```bash
vault change-password
```

Re-encrypts the vault with a new password.

### Run Commands with Secrets

```bash
vault run -- node app.js
vault run -- bun start
vault run -- bash -c 'echo $API_KEY'
```

Executes a command with all vault secrets injected as environment variables. Only string values are injected.

## CLI Commands

### `vault init`

Initialize a new encrypted vault file.

**Options:**
- `-f, --file <path>`: Specify vault file path (default: `.vault`)

### `vault get <key>`

Retrieve a secret value by key.

### `vault set <key> <value>`

Store a secret value.

### `vault list`

List all secret keys (not values) stored in the vault.

### `vault remove <key>`

Remove a secret by key.

### `vault change-password`

Change the vault encryption password.

### `vault run <command> [args...]`

Run a command with vault secrets injected as environment variables.

## TokenRing Integration

```typescript
import { Agent } from '@tokenring-ai/agent';
import { VaultService } from '@tokenring-ai/vault';

const agent = new Agent({
  services: [
    new VaultService({ vaultFile: '.vault', relockTime: 300000 })
  ]
});

// Access a secret
const apiKey = await agent.getService('VaultService').getItem('API_KEY', agent);

// Or use chat commands
// /vault unlock
// /vault get API_KEY
```

## Programmatic Vault Access

```typescript
import { readVault, writeVault, initVault, deriveKey } from '@tokenring-ai/vault/vault';
import fs from 'fs-extra';

// Initialize new vault
await initVault('.vault', 'myPassword');

// Read vault contents
const data = await readVault('.vault', 'myPassword');

// Write vault contents
await writeVault('.vault', 'myPassword', { API_KEY: 'value' });

// Derive encryption key from password and salt
const salt = crypto.randomBytes(16);
const key = deriveKey('myPassword', salt);
```

## Configuration

### Service Configuration

```typescript
import { VaultService } from '@tokenring-ai/vault';
import { vaultConfigSchema } from '@tokenring-ai/vault';

const config = vaultConfigSchema.parse({
  vaultFile: '.vault',
  relockTime: 300000,  // 5 minutes in milliseconds
});

const vault = new VaultService(config);
```

**Configuration Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `vaultFile` | string | `.vault` | Path to the vault file |
| `relockTime` | number | `300000` | Time in milliseconds before the vault automatically locks |

### Plugin Configuration

```json
{
  "vault": {
    "vaultFile": ".vault",
    "relockTime": 300000
  }
}
```

## Installation

```bash
bun install @tokenring-ai/vault
```

## Error Handling

The package provides comprehensive error handling:

- **Invalid Password**: Throws error when decryption fails due to wrong password
- **Corrupted Vault**: Detects and reports corrupted vault files
- **File Permission Errors**: Handles issues with file access permissions
- **Configuration Errors**: Validates configuration schema with Zod
- **Session Errors**: Handles invalid session management attempts
- **Environment Variable Errors**: Proper handling of injection failures

## Development

### Testing

```bash
bun run test
bun run test:watch
bun run test:coverage
```

### Package Structure

```
pkg/vault/
├── VaultService.ts          # Main service implementation
├── vault.ts                 # Core encryption/decryption functions
├── plugin.ts                # TokenRing plugin definition
├── cli.ts                   # CLI interface with Commander
├── index.ts                 # Module exports
├── schema.ts                # Zod configuration schema
├── chatCommands.ts          # Chat commands for agent integration
├── commands/                # Chat command implementations
│   ├── vault.ts            # Main command router
│   ├── unlock.ts           # Unlock command
│   ├── lock.ts             # Lock command
│   ├── list.ts             # List command
│   ├── store.ts            # Store command
│   └── get.ts              # Get command
├── package.json
├── vitest.config.ts
├── LICENSE
└── test/
    ├── plugin.unit.test.ts
    ├── cli.integration.test.ts
    ├── vault-service.unit.test.ts
    ├── vault.unit.test.ts
    └── test-utils.ts
```

### Contribution Guidelines

- Follow established coding patterns
- Add unit tests for new functionality
- Update documentation for new features
- Ensure all changes work with TokenRing agent framework

## License

MIT License - see [LICENSE](./LICENSE) file for details.
