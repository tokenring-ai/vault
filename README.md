# @tokenring-ai/vault

A secure, encrypted vault for managing secrets and credentials. Works both as a standalone CLI tool and as a TokenRing service for programmatic access.

## Features

- **AES-256-GCM Encryption**: Industry-standard encryption for secrets at rest
- **Dual Interface**: Use as CLI tool or integrate as TokenRing service
- **Environment Variable Injection**: Run commands with vault secrets as env vars
- **Secure Password Input**: Hidden password entry in terminal
- **Restrictive Permissions**: Vault files created with 0o600 (owner-only access)
- **Session Management**: Automatic locking and password caching for TokenRing service

## Installation

```bash
bun install @tokenring-ai/vault
```

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
vault run -- npm start
vault run -- bash -c 'echo $API_KEY'
```

Executes a command with all vault secrets injected as environment variables. Only string values are injected.

### CLI Options

- `-f, --file <path>`: Specify vault file path (default: `.vault`)

## TokenRing Service Usage

### Configuration

```typescript
import { VaultService } from '@tokenring-ai/vault';

const vault = new VaultService({
  vaultFile: '.vault',
  relockTime: 300000  // 5 minutes in milliseconds
});
```

### Service Methods

#### unlockVault(agent: Agent)

Prompts for password and unlocks the vault. Returns the vault data.

```typescript
const data = await vault.unlockVault(agent);
```

#### lock()

Locks the vault and clears cached password and data.

```typescript
await vault.lock();
```

#### getItem(key: string, agent: Agent)

Retrieves a value by key. Unlocks vault if needed. Returns string or undefined.

```typescript
const apiKey = await vault.getItem('API_KEY', agent);
```

#### setItem(key: string, value: string, agent: Agent)

Stores a string value by key. Unlocks vault if needed.

```typescript
await vault.setItem('API_KEY', 'sk-1234567890', agent);
```

#### save(vaultData: Record<string, string>, agent: Agent)

Saves the entire vault data.

```typescript
await vault.save({ API_KEY: 'new-key', DB_PASSWORD: 'new-pass' }, agent);
```

### Service Features

- **Password Caching**: Password cached during session, cleared on lock
- **Automatic Locking**: Vault locks after configured timeout
- **Session Management**: Relock timer resets on each access

## Programmatic Vault Access

For direct vault file manipulation without the service layer:

```typescript
import { readVault, writeVault, initVault } from '@tokenring-ai/vault/vault';

// Initialize new vault
await initVault('.vault', 'myPassword');

// Read vault (returns Record<string, string>)
const data = await readVault('.vault', 'myPassword');

// Write vault (accepts Record<string, string>)
await writeVault('.vault', 'myPassword', { API_KEY: 'value' });
```

## Data Types

The vault stores string key-value pairs:
- Keys: strings
- Values: strings

## Security

### Encryption

- **Algorithm**: AES-256-GCM (Galois/Counter Mode)
- **Key Derivation**: PBKDF2 with 100,000 iterations using SHA-256
- **Salt**: 16 random bytes per encryption
- **IV**: 12 random bytes per encryption
- **Authentication**: GCM provides authenticated encryption

### File Security

- Vault files created with `0o600` permissions (owner read/write only)
- Password never stored, only cached in memory during session
- Automatic session timeout prevents unauthorized access

### Best Practices

- Use strong, unique passwords for vault encryption
- Store vault files in secure locations
- Don't commit vault files to version control
- Use `.gitignore` to exclude vault files
- Rotate secrets regularly
- Use different vaults for different environments

## Examples

### CLI Workflow

```bash
# Initialize vault
vault init -f .production.vault

# Store production secrets
vault -f .production.vault set DATABASE_URL postgres://...
vault -f .production.vault set API_KEY sk-prod-...
vault -f .production.vault set JWT_SECRET random-secret

# List stored keys
vault -f .production.vault list

# Run application with secrets
vault -f .production.vault run -- node server.js
```

### TokenRing Integration

```typescript
import { Agent } from '@tokenring-ai/agent';
import { VaultService } from '@tokenring-ai/vault';

const agent = new Agent({
  services: [
    new VaultService({
      vaultFile: '.vault',
      relockTime: 300000
    })
  ]
});

// Access vault through agent
const vault = agent.getService('VaultService');
const apiKey = await vault.getItem('API_KEY', agent);
```

### Environment Variable Pattern

```bash
# Store all environment variables
vault set NODE_ENV production
vault set PORT 3000
vault set DATABASE_URL postgres://localhost/mydb
vault set REDIS_URL redis://localhost:6379

# Run with all secrets injected
vault run -- npm start
```

## Error Handling

```typescript
try {
  const data = await readVault('.vault', password);
} catch (error) {
  // Invalid password or corrupted vault file
  console.error('Failed to decrypt vault');
}
```

## License

MIT