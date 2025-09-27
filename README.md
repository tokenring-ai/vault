## Usage

### Basic Operations

The VaultService provides the following methods:

- `unlockVault(agent: Agent)`: Prompts for password and unlocks the vault
- `lock()`: Locks the vault and clears cached data
- `getItem(key: string, agent: Agent)`: Retrieves a value by key
- `setItem(key: string, value: AnyJSON, agent: Agent)`: Stores a value by key
- `save(vaultData: Record<string, AnyJSON>, agent: Agent)`: Saves the entire vault data

### Security Features

- **Password Caching**: Password is cached during the session but cleared when locked
- **Automatic Locking**: Vault automatically locks after the configured timeout
- **Encryption**: Uses industry-standard AES-256-GCM encryption
- **Salt and IV**: Each encryption uses unique salt and initialization vector
- **File Permissions**: Vault files are created with 0o600 permissions (owner only)

### Data Types

The vault can store any JSON-serializable data:
- Strings, numbers, booleans
- Arrays and objects
- Nested structures
- null and undefined values

## Installation

Install as a TokenRing plugin and configure with your desired vault file path and relock time.

## Security Considerations

- Choose a strong password for vault encryption
- Vault files are stored with restrictive file permissions
- Password is only cached during the session
- Automatic locking prevents unauthorized access to unlocked vaults
- Uses cryptographically secure random values for salts and IVs