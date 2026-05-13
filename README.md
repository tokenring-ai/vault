# @tokenring-ai/vault

A secure, encrypted vault for managing secrets and credentials. Works both as a standalone CLI tool and as a TokenRing
service for programmatic access. The vault uses AES-256-GCM encryption with PBKDF2 key derivation for strong security.
Files are stored with restrictive permissions (0o600), and the service supports password caching and automatic
relocking.

## Overview

The `@tokenring-ai/vault` package provides a comprehensive secret management solution for the TokenRing AI ecosystem. It
offers both CLI and programmatic interfaces for secure storage and retrieval of credentials, API keys, and other
sensitive data. Secrets are organized into categories for better organization.

### Key Features

- **AES-256-GCM Encryption**: Industry-standard encryption for secrets at rest
- **Dual Interface**: Use as CLI tool or integrate as TokenRing service
- **Categorized Secrets**: Organize secrets into categories (e.g., `env`, `api`, `database`)
- **Session Password Caching**: Password cached in memory for the session duration
- **Restrictive Permissions**: Vault files created with 0o600 (owner-only access)
- **Plugin Integration**: Seamless integration with TokenRing application framework
- **Commander CLI**: Full featured command-line interface with password masking
- **Chat Commands**: Integrated chat commands for agent interaction
- **Zod Configuration**: Type-safe configuration with schema validation
- **RPC Endpoints**: Remote procedure call support for vault operations
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
- `unlocked`: `boolean` - Whether the vault is currently unlocked

**Methods:**

#### `start(): Promise<void>`

Starts the vault service. Initializes the vault if a password is available via environment variable or secrets manager.

- **Returns:** `Promise<void>`

**Example:**

```typescript
const vaultService = new VaultService({ vaultFile: '.vault', relockTime: 300000 });
await vaultService.start();
```

#### `unlock(agent?: Agent): Promise<VaultFileData>`

Unlocks the vault by prompting for the password (if not already unlocked), decrypts the vault file, and returns the
data. If the vault is already unlocked, returns the cached data.

- **Parameters:**
- `agent` (`Agent`): Optional Agent instance used for human interaction prompts, such as password entry.
- **Returns:** `Promise<VaultFileData>` - The decrypted vault data
- **Throws:** Error if password is empty or decryption fails

**Example:**

```typescript
const vaultService = agent.getService<VaultService>('VaultService');
const data = await vaultService.unlock(agent);
console.log(Object.keys(data.entries)); // List of categories
```

#### `lock(): void`

Locks the vault, clearing all cached data and session password. The vault must be re-unlocked to access secrets.

- **Returns:** `void`

**Example:**

```typescript
vaultService.lock();
```

#### `save(modifications: VaultEntryUpdate[]): Promise<void>`

Writes the updated vault data to the vault file, re-encrypting it with the current session password.

- **Parameters:**
- `modifications` (`VaultEntryUpdate[]`): Array of updates to apply before saving.
- **Returns:** `Promise<void>`
- **Throws:** Error if vault is not unlocked (no session password)

**Example:**

```typescript
await vaultService.save([{ category: 'api', key: 'my_key', value: 'my_value' }]);
```

#### `setItem(category: string, key: string, value: string): Promise<void>`

Sets a secret value in the vault. Automatically saves the changes.

- **Parameters:**
- `category` (`string`): The category for the secret.
- `key` (`string`): The secret key within the category.
- `value` (`string`): The value to store.
- **Returns:** `Promise<void>`

**Example:**

```typescript
await vaultService.setItem('api', 'OPENAI_KEY', 'sk-1234567890');
```

#### `setJsonItem(category: string, key: string, value: unknown): Promise<void>`

Sets a JSON-serialized value in the vault.

- **Parameters:**
- `category` (`string`): The category for the secret.
- `key` (`string`): The secret key within the category.
- `value` (`unknown`): The value to store (will be JSON-serialized).
- **Returns:** `Promise<void>`

**Example:**

```typescript
await vaultService.setJsonItem('config', 'settings', { timeout: 30, retries: 3 });
```

#### `deleteItem(category: string, key: string, agent?: Agent): Promise<void>`

Deletes a secret from the vault.

- **Parameters:**
- `category` (`string`): The category for the secret.
- `key` (`string`): The secret key within the category.
- `agent` (`Agent`): Optional Agent instance for interaction.
- **Returns:** `Promise<void>`

**Example:**

```typescript
await vaultService.deleteItem('api', 'OLD_KEY', agent);
```

#### `requireItem(category: string, key: string): string`

Retrieves a secret value by key. Throws if the vault is locked or the item does not exist.

- **Parameters:**
- `category` (`string`): The category for the secret.
- `key` (`string`): The secret key within the category.
- **Returns:** `string` - The secret value
- **Throws:** Error if vault is locked or item does not exist

**Example:**

```typescript
const apiKey = vaultService.requireItem('api', 'OPENAI_KEY');
console.log(`API Key: ${apiKey}`);
```

#### `requireJsonItem<T>(category: string, key: string, schema: z.ZodType<T>): T`

Retrieves and parses a JSON-serialized value from the vault.

- **Parameters:**
- `category` (`string`): The category for the secret.
- `key` (`string`): The secret key within the category.
- `schema` (`z.ZodType<T>`): Zod schema to parse and validate the value.
- **Returns:** `T` - The parsed value
- **Throws:** Error if parsing fails or item does not exist

**Example:**

```typescript
const config = vaultService.requireJsonItem('config', 'settings', z.object({
  timeout: z.number(),
  retries: z.number()
}));
```

#### `injectEnv(): void`

Injects all secrets in the `env` category into process environment variables.

- **Returns:** `void`

**Example:**

```typescript
await vaultService.setItem('env', 'API_KEY', 'secret_value');
vaultService.injectEnv();
console.log(process.env.API_KEY); // 'secret_value'
```

#### `setPassword(password: string): void`

Sets the session password for the vault.

- **Parameters:**
- `password` (`string`): The password to use for encryption/decryption.
- **Returns:** `void`

**Example:**

```typescript
vaultService.setPassword('my-secret-password');
await vaultService.unlock();
```

## Core Vault Functions

Low-level functions for direct vault operations:

```typescript
import { readVault, writeVault, initVault, deriveKey, encrypt, decrypt, readOrInitializeVault } from '@tokenring-ai/vault/vault';
```

### Encryption Functions

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

### Vault File Operations

#### `readVault(vaultFile: string, password: string): Promise<VaultFileData>`

Reads and decrypts a vault file.

- **Parameters:**
- `vaultFile` (`string`): Path to the vault file.
- `password` (`string`): The decryption password.
- **Returns:** `Promise<VaultFileData>` - The decrypted vault data
- **Throws:** Error if file does not exist or decryption fails

#### `writeVault(vaultFile: string, password: string, data: VaultFileData): Promise<void>`

Encrypts and writes a vault file with restrictive permissions (0o600).

- **Parameters:**
- `vaultFile` (`string`): Path to the vault file.
- `password` (`string`): The encryption password.
- `data` (`VaultFileData`): The vault data to encrypt and write.
- **Returns:** `Promise<void>`

#### `initVault(vaultFile: string, password: string): Promise<void>`

Initializes a new empty vault file.

- **Parameters:**
- `vaultFile` (`string`): Path to the new vault file.
- `password` (`string`): The encryption password.
- **Returns:** `Promise<void>`

#### `readOrInitializeVault(vaultFile: string, password: string): Promise<VaultFileData>`

Reads an existing vault file or initializes a new one if it doesn't exist.

- **Parameters:**
- `vaultFile` (`string`): Path to the vault file.
- `password` (`string`): The encryption/decryption password.
- **Returns:** `Promise<VaultFileData>` - The vault data

## Chat Commands

### `/vault unlock`

Unlock the vault with password prompt.

**Example:**

```bash
/vault unlock
```

### `/vault lock`

Lock the vault, clearing cached credentials.

**Example:**

```bash
/vault lock
```

### `/vault list`

List all credential keys stored in the vault.

**Example:**

```bash
/vault list
```

### `/vault store <key> <value>`

Store a credential in the vault. The key must be in the format `category.key`.

- **Arguments:**
- `key`: The credential key in format `category.key` (e.g., `api.OPENAI_KEY`)
- `value`: The credential value

**Example:**

```bash
/vault store api.OPENAI_KEY sk-1234567890
```

## RPC Endpoints

The vault package provides RPC endpoints for remote vault operations.

### Endpoint Path: `/rpc/vault`

#### `listEntries()`

Lists all entries in the vault as a flat key-value map.

- **Type:** Query
- **Input:** `{}`
- **Result:** `Record<string, string>` - Map of `category.key` to values

**Example:**

```typescript
import { rpcClient } from '@tokenring-ai/rpc';

const entries = await rpcClient.call('/rpc/vault', 'listEntries', {});
console.log(entries); // { 'api.OPENAI_KEY': 'sk-...', 'env.API_URL': 'https://...' }
```

#### `setItems({ updates })`

Sets multiple items in the vault.

- **Type:** Mutation
- **Input:** `{ updates: Array<{ category: string, key: string, value: string }> }`
- **Result:** `{ success: boolean, message: string }`

**Example:**

```typescript
const result = await rpcClient.call('/rpc/vault', 'setItems', {
  updates: [
    { category: 'api', key: 'OPENAI_KEY', value: 'sk-123' },
    { category: 'api', key: 'ANTHROPIC_KEY', value: 'sk-456' }
  ]
});
console.log(result); // { success: true, message: 'Saved 2 item(s)' }
```

#### `deleteItems({ updates })`

Deletes multiple items from the vault.

- **Type:** Mutation
- **Input:** `{ updates: Array<{ category: string, key: string }> }`
- **Result:** `{ success: boolean, message: string }`

**Example:**

```typescript
const result = await rpcClient.call('/rpc/vault', 'deleteItems', {
  updates: [
    { category: 'api', key: 'OLD_KEY' }
  ]
});
console.log(result); // { success: true, message: 'Deleted 1 item(s)' }
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

| Option  | Type          | Default     | Description                         |
|---------|---------------|-------------|-------------------------------------|
| `vault` | `VaultConfig` | `undefined` | Optional vault configuration object |

### VaultConfig Schema

| Option       | Type     | Default  | Description                                                       |
|--------------|----------|----------|-------------------------------------------------------------------|
| `vaultFile`  | `string` | Required | Path to the vault file                                            |
| `relockTime` | `number` | `300000` | Time in milliseconds before automatic relock (default: 5 minutes) |

## CLI Usage

The vault package provides a full-featured command-line interface built with Commander.

### Global Options

| Option       | Description     | Default  |
|--------------|-----------------|----------|
| `-f, --file` | Vault file path | `.vault` |

### Initialize a New Vault

```bash
vault init
vault init -f ~/.secrets.vault
```

Creates a new encrypted vault file. You'll be prompted to set a password.

### Store Secrets

Secrets are stored in categories using the format `category.key`:

```bash
vault set api.OPENAI_KEY sk-1234567890
vault set database.POSTGRES_URL postgres://user:pass@localhost/db
vault -f ~/.secrets.vault set aws.ACCESS_KEY AKIAIOSFODNN7EXAMPLE
```

### Retrieve Secrets

```bash
vault get api.OPENAI_KEY
vault get database.POSTGRES_URL
```

### List All Keys

```bash
vault list
```

Shows all secret keys (not values) stored in the vault, organized by category.

### Remove Secrets

```bash
vault remove api.OLD_KEY
vault remove database.OLD_URL
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

Executes a command with all vault secrets injected as environment variables.

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

- `<key>`: The secret key in format `category.key`

**Example:**

```bash
vault get api.OPENAI_KEY
```

### `vault set <key> <value>`

Store a secret value.

**Arguments:**

- `<key>`: The secret key in format `category.key`
- `<value>`: The secret value

**Example:**

```bash
vault set api.OPENAI_KEY sk-1234567890
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

- `<key>`: The secret key in format `category.key`

**Example:**

```bash
vault remove api.OLD_KEY
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

// Unlock and access a secret
await agent.getService<VaultService>('VaultService').unlock(agent);
const apiKey = agent.getService<VaultService>('VaultService').requireItem('api', 'OPENAI_KEY');

// Or use chat commands
// /vault unlock
// /vault list
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

### Password Configuration

The vault plugin supports multiple password sources:

1. **Environment Variable:** Set `TR_VAULT_PASSWORD` environment variable
2. **Secrets Manager:** Reads from Bun secrets with service `tokenring` and name `vault-password`
3. **Interactive Prompt:** Prompts at startup if no password is configured

```bash
# Using environment variable
export TR_VAULT_PASSWORD="my-secret-password"
bun run app

# Or in .env file
TR_VAULT_PASSWORD=my-secret-password
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
console.log(data.entries); // { env: { API_KEY: 'value' }, api: { ... } }

// Write vault contents
await writeVault('.vault', 'myPassword', {
  vaultVersion: 1,
  entries: {
    env: { API_KEY: 'value' },
    api: { OPENAI_KEY: 'sk-123' }
  }
});

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

## Schema Definitions

### VaultFileSchema

The structure of the vault file:

```typescript
const VaultFileSchema = z.object({
  vaultVersion: z.number().default(1),
  entries: z.record(z.string().min(1), z.record(z.string().min(1), z.string())),
});
```

**Fields:**

| Field          | Type                                     | Description                  |
|----------------|------------------------------------------|------------------------------|
| `vaultVersion` | `number`                                 | Schema version (currently 1) |
| `entries`      | `Record<string, Record<string, string>>` | Category-key-value structure |

**Example:**

```json
{
  "vaultVersion": 1,
  "entries": {
    "env": {
      "API_KEY": "secret_value",
      "API_URL": "https://api.example.com"
    },
    "api": {
      "OPENAI_KEY": "sk-1234567890",
      "ANTHROPIC_KEY": "sk-abcdef123456"
    }
  }
}
```

### VaultEntryUpdateSchema

For updating vault entries:

```typescript
const VaultEntryUpdateSchema = z.object({
  category: z.string().min(1),
  key: z.string().min(1),
  value: z.string().min(1),
});
```

### VaultEntryDeleteSchema

For deleting vault entries:

```typescript
const VaultEntryDeleteSchema = z.object({
  category: z.string().min(1),
  key: z.string().min(1),
});
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
  vaultService.requireItem('api', 'OPENAI_KEY');
} catch (error) {
  if (error.message.includes('Vault is uninitialized or locked')) {
    console.error('Vault must be unlocked first');
    await vaultService.unlock(agent);
  } else if (error.message.includes('does not exist')) {
    console.error('Secret not found in vault');
  }
}
```

## State Management

The VaultService maintains internal state for:

- `vaultData`: Cached decrypted vault data
- `sessionPassword`: Cached password for the current session
- `unlocked`: Boolean indicating if vault is currently unlocked

### Session Password Caching

Once unlocked, the password is cached in memory for the duration of the session. This allows multiple operations without
re-prompting for the password. The password is cleared when:

- `lock()` is called explicitly
- The service is restarted

### Environment Variable Injection

The `injectEnv()` method injects all secrets in the `env` category into `process.env`. This is useful for applications
that expect secrets in environment variables.

```typescript
await vaultService.setItem('env', 'API_KEY', 'secret_value');
vaultService.injectEnv();
// process.env.API_KEY is now 'secret_value'
```

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

```text
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
│       ├── get.ts           # /vault get command (not implemented)
│       ├── list.ts          # /vault list command
│       ├── lock.ts          # /vault lock command
│       ├── store.ts         # /vault store command
│       └── unlock.ts        # /vault unlock command
├── rpc/
│   ├── schema.ts            # RPC schema definition
│   └── vault.ts             # RPC endpoint implementation
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

| Package                 | Version   | Description                   |
|-------------------------|-----------|-------------------------------|
| `@tokenring-ai/app`     | `0.2.0`   | Base application framework    |
| `@tokenring-ai/agent`   | `0.2.0`   | Agent orchestration system    |
| `@tokenring-ai/utility` | `0.2.0`   | Shared utilities              |
| `@tokenring-ai/rpc`     | `0.2.0`   | RPC framework                 |
| `@types/fs-extra`       | `^11.0.4` | TypeScript types for fs-extra |
| `commander`             | `^14.0.3` | CLI framework                 |
| `fs-extra`              | `^11.3.4` | File system operations        |
| `zod`                   | `^4.3.6`  | Schema validation             |

### Dev Dependencies

| Package      | Version  | Description         |
|--------------|----------|---------------------|
| `vitest`     | `^4.1.1` | Testing framework   |
| `typescript` | `^6.0.2` | TypeScript compiler |

## Related Components

- **@tokenring-ai/agent** - Agent system that integrates with VaultService
- **@tokenring-ai/app** - Application framework with plugin system
- **@tokenring-ai/rpc** - RPC framework for remote vault operations
- **@tokenring-ai/utility** - Utility functions including `markdownList` for command output

## License

MIT License - see [LICENSE](./LICENSE) file for details.
