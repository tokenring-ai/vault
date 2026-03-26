# @tokenring-ai/vault

A secure, encrypted vault for managing secrets and credentials. Works both as a standalone CLI tool and as a TokenRing service for programmatic access. The vault uses AES-256-GCM encryption with PBKDF2 key derivation for strong security. Files are stored with restrictive permissions (0o600), and the service automatically locks after a configurable timeout to prevent unauthorized access.

## Overview

The `@tokenring-ai/vault` package provides a comprehensive secret management solution for the TokenRing AI ecosystem. It offers both CLI and programmatic interfaces for secure storage and retrieval of credentials, API keys, and other sensitive data.

### Key Features

- **AES-256-GCM Encryption**: Industry-standard encryption for secrets at rest
- **Dual Interface**: Use as CLI tool or integrate as TokenRing service
- **Environment Variable Injection**: Run commands with vault secrets as env vars
- **Secure Password Input**: Hidden password entry in terminal with raw mode support
- **Restrictive Permissions**: Vault files created with 0o600 (owner-only access)
- **Session Management**: Automatic locking and password caching for TokenRing service
- **Plugin Integration**: Seamless integration with TokenRing application framework
- **Commander CLI**: Full featured command-line interface with password masking
- **Chat Commands**: Integrated chat commands for agent interaction (`/vault unlock`, `lock`, `list`, `store`, `get`)
- **Zod Configuration**: Type-safe configuration with schema validation
- **Comprehensive Testing**: Unit and integration tests with Vitest

## Installation

```bash
bun install @tokenring-ai/vault
```

## Core Components

### VaultService

The main service class for programmatic access to the vault. Implements the `TokenRingService` interface.

```typescript
import { VaultService } from '@tokenring-ai/vault';
```

**Constructor:**

```typescript
constructor(options: ParsedVaultConfig)
```

**Properties:**

- `name`: `"VaultService"` - The service identifier
- `description`: `"A vault service for storing persisted credentials"` - Service description
- `options`: `ParsedVaultConfig` - The configuration options passed to the constructor

**Methods:**

#### `unlockVault(agent: Agent): Promise<Record<string, string>>`

Unlocks the vault by prompting for the password (if not already unlocked), decrypts the vault file, and returns the data. If the vault is already unlocked, returns the cached data.

- **Parameters:**
  - `agent` (`Agent`): The Agent instance used for human interaction prompts, such as password entry.
- **Returns:** `Promise<Record<string, string>>` - The decrypted vault data
- **Throws:** Error if password is empty or decryption fails

**Example:**
```typescript
const vaultService = agent.getService<VaultService>('VaultService');
const data = await vaultService.unlockVault(agent);
console.log(Object.keys(data)); // List of stored keys
```

#### `lock(): Promise<void>`

Locks the vault, clearing all cached data and session password. The vault must be re-unlocked to access secrets.

- **Returns:** `Promise<void>`

**Example:**
```typescript
await vaultService.lock();
```

#### `save(vaultData: Record<string, string>): Promise<void>`

Writes the updated vault data to the vault file, re-encrypting it with the current session password.

- **Parameters:**
  - `vaultData` (`Record<string, string>`): The updated vault data to save.
- **Returns:** `Promise<void>`
- **Throws:** Error if vault is not unlocked (no session password)

**Example:**
```typescript
const data = await vaultService.unlockVault(agent);
data['NEW_KEY'] = 'new_value';
await vaultService.save(data);
```

#### `getItem(key: string, agent: Agent): Promise<string | undefined>`

Retrieves a secret value by key. Automatically unlocks the vault if needed.

- **Parameters:**
  - `key` (`string`): The secret key to retrieve.
  - `agent` (`Agent`): Agent instance for interaction.
- **Returns:** `Promise<string | undefined>` - The secret value or undefined if not found

**Example:**
```typescript
const apiKey = await vaultService.getItem('API_KEY', agent);
if (apiKey) {
  console.log(`API Key: ${apiKey}`);
}
```

#### `setItem(key: string, value: string, agent: Agent): Promise<void>`

Updates the vault with a new key-value pair, saving the changes. Automatically unlocks the vault if needed.

- **Parameters:**
  - `key` (`string`): The secret key to set.
  - `value` (`string`): The value to store for the key.
  - `agent` (`Agent`): Agent instance for interaction.
- **Returns:** `Promise<void>`

**Example:**
```typescript
await vaultService.setItem('API_KEY', 'sk-1234567890', agent);
```

### Core Vault Functions

Low-level functions for direct vault operations:

```typescript
import { readVault, writeVault, initVault, deriveKey, encrypt, decrypt } from '@tokenring-ai/vault/vault';
```

#### `deriveKey(password: string, salt: Buffer): Buffer`

Derives an encryption key from a password using PBKDF2 with SHA-256.

- **Parameters:**
  - `password` (`string`): The password to derive the key from.
  - `salt` (`Buffer`): The salt value (16 bytes).
- **Returns:** `Buffer` - The derived 32-byte key

#### `encrypt(data: string, password: string): string`

Encrypts data using AES-256-GCM.

- **Parameters:**
  - `data` (`string`): The plaintext data to encrypt.
  - `password` (`string`): The encryption password.
- **Returns:** `string` - Base64-encoded encrypted data

#### `decrypt(encryptedData: string, password: string): string`

Decrypts data using AES-256-GCM.

- **Parameters:**
  - `encryptedData` (`string`): The base64-encoded encrypted data.
  - `password` (`string`): The decryption password.
- **Returns:** `string` - The decrypted plaintext data
- **Throws:** Error if decryption fails (invalid password or corrupted data)

#### `readVault(vaultFile: string, password: string): Promise<Record<string, string>>`

Reads and decrypts a vault file.

- **Parameters:**
  - `vaultFile` (`string`): Path to the vault file.
  - `password` (`string`): The decryption password.
- **Returns:** `Promise<Record<string, string>>` - The decrypted vault data
- **Throws:** Error if file does not exist or decryption fails

#### `writeVault(vaultFile: string, password: string, data: Record<string, string>): Promise<void>`

Encrypts and writes a vault file with restrictive permissions (0o600).

- **Parameters:**
  - `vaultFile` (`string`): Path to the vault file.
  - `password` (`string`): The encryption password.
  - `data` (`Record<string, string>`): The vault data to encrypt and write.
- **Returns:** `Promise<void>`

#### `initVault(vaultFile: string, password: string): Promise<void>`

Initializes a new empty vault file.

- **Parameters:**
  - `vaultFile` (`string`): Path to the new vault file.
  - `password` (`string`): The encryption password.
- **Returns:** `Promise<void>`

## Chat Commands

### `/vault unlock`

Unlock the vault with password

**Example:**
```
/vault unlock
```

### `/vault lock`

Lock the vault

**Example:**
```
/vault lock
```

### `/vault list`

List all credential keys in the vault

**Example:**
```
/vault list
```

### `/vault store <key>`

Store a credential in the vault
- Prompts for the credential value securely

**Example:**
```
/vault store api_key
```

### `/vault get <key>`

Retrieve and display a credential from the vault

**Example:**
```
/vault get api_key
```

**Complete usage example:**
```
/vault unlock
/vault list
/vault store api_key
/vault get api_key
/vault lock
```

## Plugin Configuration

The plugin can be installed with optional configuration in your TokenRing application:

```typescript
import vaultPlugin from '@tokenring-ai/vault';
import TokenRingApp from '@tokenring-ai/app';

const app = new TokenRingApp();
app.usePlugin(vaultPlugin, {
  vault: {
    vaultFile: '.vault',
    relockTime: 300000 // 5 minutes
  }
});
```

### Plugin Configuration Schema

The plugin configuration is validated using Zod:

```typescript
const packageConfigSchema = z.object({
  vault: VaultConfigSchema.optional()
});
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `vault` | `VaultConfig` | `undefined` | Optional vault configuration object |

### VaultConfig Schema

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `vaultFile` | `string` | Required | Path to the vault file |
| `relockTime` | `number` | `300000` | Time in milliseconds before the vault automatically locks (default: 5 minutes) |

## CLI Usage

The vault package provides a full-featured command-line interface built with Commander.

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
vault -f ~/.secrets.vault set AWS_KEY abc123
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

Re-encrypts the vault with a new password. Prompts for current and new passwords.

### Run Commands with Secrets

```bash
vault run node app.js
vault run bun start
vault run bash -c 'echo $API_KEY'
```

Executes a command with all vault secrets injected as environment variables. Only string values are injected.

## CLI Commands Reference

### `vault init`

Initialize a new encrypted vault file.

**Options:**
- `-f, --file <path>`: Specify vault file path (default: `.vault`)

**Example:**
```bash
vault init -f ~/.my-vault
```

### `vault get <key>`

Retrieve a secret value by key.

**Arguments:**
- `<key>`: The secret key to retrieve

**Example:**
```bash
vault get API_KEY
```

### `vault set <key> <value>`

Store a secret value.

**Arguments:**
- `<key>`: The secret key
- `<value>`: The secret value

**Example:**
```bash
vault set API_KEY sk-1234567890
```

### `vault list`

List all secret keys (not values) stored in the vault.

**Example:**
```bash
vault list
```

### `vault remove <key>`

Remove a secret by key.

**Arguments:**
- `<key>`: The secret key to remove

**Example:**
```bash
vault remove OLD_TOKEN
```

### `vault change-password`

Change the vault encryption password.

Prompts for current password and new password, then re-encrypts the vault.

**Example:**
```bash
vault change-password
```

### `vault run <command> [args...]`

Run a command with vault secrets injected as environment variables.

**Arguments:**
- `<command>`: The command to execute
- `[args...]`: Command arguments

**Example:**
```bash
vault run node app.js
vault run bash -c 'echo $API_KEY'
```

**Note:** Use `-f, --file` option before the command to specify vault file:
```bash
vault -f ~/.secrets.vault run node app.js
```

## TokenRing Integration

### Using with Agent

```typescript
import { Agent } from '@tokenring-ai/agent';
import { VaultService } from '@tokenring-ai/vault';

const agent = new Agent({
  services: [
    new VaultService({ vaultFile: '.vault', relockTime: 300000 })
  ]
});

// Access a secret
const apiKey = await agent.getService<VaultService>('VaultService').getItem('API_KEY', agent);

// Or use chat commands
// /vault unlock
// /vault get API_KEY
```

### Using as Plugin

```typescript
import TokenRingApp from '@tokenring-ai/app';
import vaultPlugin from '@tokenring-ai/vault';

const app = new TokenRingApp();

// Install plugin with configuration
app.usePlugin(vaultPlugin, {
  vault: {
    vaultFile: '.vault',
    relockTime: 300000 // 5 minutes
  }
});

// Access the service after the plugin is installed
const vaultService = app.getService<VaultService>('VaultService');
```

## Programmatic Vault Access

For low-level vault operations:

```typescript
import { readVault, writeVault, initVault, deriveKey, encrypt, decrypt } from '@tokenring-ai/vault/vault';
import crypto from 'crypto';

// Initialize new vault
await initVault('.vault', 'myPassword');

// Read vault contents
const data = await readVault('.vault', 'myPassword');

// Write vault contents
await writeVault('.vault', 'myPassword', { API_KEY: 'value' });

// Derive encryption key from password and salt
const salt = crypto.randomBytes(16);
const key = deriveKey('myPassword', salt);

// Encrypt data
const encrypted = encrypt('sensitive data', 'myPassword');

// Decrypt data
const decrypted = decrypt(encrypted, 'myPassword');
```

## Configuration

### Service Configuration

```typescript
import { VaultService } from '@tokenring-ai/vault';
import { VaultConfigSchema } from '@tokenring-ai/vault/schema';

const config = VaultConfigSchema.parse({
  vaultFile: '.vault',
  relockTime: 300000,  // 5 minutes in milliseconds
});

const vault = new VaultService(config);
```

### Plugin Configuration (JSON)

```json
{
  "vault": {
    "vaultFile": ".vault",
    "relockTime": 300000
  }
}
```

## Error Handling

The package provides comprehensive error handling:

- **Invalid Password**: Throws error when decryption fails due to wrong password
- **Corrupted Vault**: Detects and reports corrupted vault files
- **File Permission Errors**: Handles issues with file access permissions
- **Configuration Errors**: Validates configuration schema with Zod
- **Session Errors**: Handles invalid session management attempts (e.g., saving without unlocking)
- **Environment Variable Errors**: Proper handling of injection failures in CLI `run` command
- **Empty Password**: Throws error when password input is empty or cancelled

### Common Errors

```typescript
try {
  await vaultService.getItem('API_KEY', agent);
} catch (error) {
  if (error.message.includes('Invalid password')) {
    console.error('Wrong password provided');
  } else if (error.message.includes('Vault must be unlocked')) {
    console.error('Session expired, please unlock again');
  }
}
```

## State Management

The VaultService maintains internal state for:

- `vaultData`: Cached decrypted vault data
- `sessionPassword`: Cached password for the current session
- `relockTimer`: Timer for automatic re-locking

### Automatic Relocking

The vault automatically locks after the configured `relockTime` (default: 5 minutes) to prevent unauthorized access. The timer is reset each time the vault is accessed while unlocked.

### Session Password Caching

Once unlocked, the password is cached in memory for the duration of the session. This allows multiple operations without re-prompting for the password. The password is cleared when:
- `lock()` is called explicitly
- The automatic relock timer expires
- Decryption fails (invalid password attempt)

## Testing

### Running Tests

```bash
bun run test
bun run test:watch
bun run test:coverage
```

### Test Structure

The package includes comprehensive tests:

- **Unit Tests:**
  - `test/vault.unit.test.ts` - Core encryption/decryption functions
  - `test/vault-service.unit.test.ts` - VaultService methods
  - `test/plugin.unit.test.ts` - Plugin installation and configuration
  - `test/test-utils.ts` - Test utilities and helpers

- **Integration Tests:**
  - `test/cli.integration.test.ts` - CLI command integration

## Package Structure

```
pkg/vault/
├── VaultService.ts          # Main service implementation
├── vault.ts                 # Core encryption/decryption functions
├── plugin.ts                # TokenRing plugin definition
├── cli.ts                   # CLI interface with Commander
├── index.ts                 # Module exports
├── schema.ts                # Zod configuration schema
├── commands.ts              # Chat command router
├── commands/
│   └── vault/
│       ├── get.ts           # /vault get command
│       ├── list.ts          # /vault list command
│       ├── lock.ts          # /vault lock command
│       ├── store.ts         # /vault store command
│       └── unlock.ts        # /vault unlock command
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

## Dependencies

### Runtime Dependencies

| Package | Version | Description |
|---------|---------|-------------|
| `@tokenring-ai/app` | `0.2.0` | Base application framework |
| `@tokenring-ai/agent` | `0.2.0` | Agent orchestration system |
| `@tokenring-ai/utility` | `0.2.0` | Shared utilities |
| `@types/fs-extra` | `^11.0.4` | TypeScript types for fs-extra |
| `commander` | `^14.0.3` | CLI framework |
| `fs-extra` | `^11.3.4` | File system operations |
| `zod` | `^4.3.6` | Schema validation |

### Dev Dependencies

| Package | Version | Description |
|---------|---------|-------------|
| `vitest` | `^4.1.1` | Testing framework |
| `typescript` | `^6.0.2` | TypeScript compiler |

## Related Components

- **@tokenring-ai/agent** - Agent system that integrates with VaultService
- **@tokenring-ai/app** - Application framework with plugin system
- **@tokenring-ai/utility** - Utility functions including `markdownList` for command output

## License

MIT License - see [LICENSE](./LICENSE) file for details.
