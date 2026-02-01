import { randomBytes, createCipheriv, createDecipheriv, pbkdf2Sync } from 'crypto';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { tmpdir } from 'os';

/**
 * Options for secrets manager
 */
export interface SecretsManagerOptions {
  storePath?: string;
}

/**
 * Secret metadata
 */
export interface SecretMetadata {
  description?: string;
  createdBy?: string;
  createdAt?: number;
  updatedAt?: number;
  expiresAt?: number;
}

/**
 * Secret version
 */
export interface SecretVersion {
  value: string;
  createdAt: number;
}

/**
 * Set options
 */
export interface SetOptions extends SecretMetadata {
  versioned?: boolean;
}

/**
 * Encryption info
 */
export interface EncryptionInfo {
  algorithm: string;
  keyDerivation: string;
}

/**
 * Access context
 */
export interface AccessContext {
  roles?: string[];
  userId?: string;
}

/**
 * Access policy
 */
export interface AccessPolicy {
  roles?: string[];
  users?: string[];
}

/**
 * Internal secret storage
 */
interface SecretEntry {
  value: string;
  metadata: SecretMetadata;
  versions?: SecretVersion[];
}

/**
 * Encrypted store format
 */
interface EncryptedStore {
  version: number;
  salt: string;
  iv: string;
  tag: string;
  data: string;
}

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const SALT_LENGTH = 32;
const IV_LENGTH = 16;
const PBKDF2_ITERATIONS = 100000;

/**
 * SecretsManager - Secure secrets storage and management
 *
 * Features:
 * - AES-256-GCM encryption
 * - PBKDF2 key derivation
 * - Version history
 * - Namespace support
 * - Access control integration
 */
export class SecretsManager {
  private readonly storePath: string;
  private secrets: Map<string, SecretEntry> = new Map();
  private accessPolicies: Map<string, AccessPolicy> = new Map();
  private masterKey: Buffer | null = null;
  private salt: Buffer | null = null;
  private initialized = false;

  constructor(options: SecretsManagerOptions = {}) {
    this.storePath = options.storePath ?? join(tmpdir(), 'seu-claude-secrets.enc');
  }

  /**
   * Initialize with master key
   */
  async initialize(masterKey?: string): Promise<string> {
    // Generate key if not provided
    const key = masterKey ?? randomBytes(32).toString('hex');

    // Try to load existing store
    if (existsSync(this.storePath)) {
      await this.load(key);
    } else {
      // New store - generate salt
      this.salt = randomBytes(SALT_LENGTH);
      this.masterKey = this.deriveKey(key, this.salt);
    }

    this.initialized = true;
    return key;
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Close and clear sensitive data
   */
  async close(): Promise<void> {
    this.secrets.clear();
    this.masterKey = null;
    this.salt = null;
    this.initialized = false;
  }

  /**
   * Set a secret
   */
  async set(key: string, value: string, options: SetOptions = {}): Promise<void> {
    this.ensureInitialized();

    const now = Date.now();
    const existing = this.secrets.get(key);

    const entry: SecretEntry = {
      value,
      metadata: {
        description: options.description,
        createdBy: options.createdBy,
        createdAt: existing?.metadata.createdAt ?? now,
        updatedAt: now,
        expiresAt: options.expiresAt,
      },
    };

    // Handle versioning
    if (options.versioned) {
      const versions = existing?.versions ?? [];
      // Only add existing value if it wasn't already versioned (i.e., no versions array)
      if (existing && !existing.versions) {
        versions.push({
          value: existing.value,
          createdAt: existing.metadata.updatedAt ?? existing.metadata.createdAt ?? now,
        });
      }
      versions.push({ value, createdAt: now });
      entry.versions = versions;
    }

    this.secrets.set(key, entry);
  }

  /**
   * Get a secret
   */
  async get(key: string): Promise<string | undefined> {
    this.ensureInitialized();
    return this.secrets.get(key)?.value;
  }

  /**
   * Delete a secret
   */
  async delete(key: string): Promise<void> {
    this.ensureInitialized();
    this.secrets.delete(key);
  }

  /**
   * List all secret keys
   */
  async list(): Promise<string[]> {
    this.ensureInitialized();
    return Array.from(this.secrets.keys());
  }

  /**
   * List secrets by namespace
   */
  async listByNamespace(namespace: string): Promise<string[]> {
    this.ensureInitialized();
    const prefix = namespace.endsWith('/') ? namespace : `${namespace}/`;
    return Array.from(this.secrets.keys()).filter(k => k.startsWith(prefix));
  }

  /**
   * Save secrets to encrypted file
   */
  async save(): Promise<void> {
    this.ensureInitialized();

    const data = JSON.stringify({
      secrets: Object.fromEntries(this.secrets),
      policies: Object.fromEntries(this.accessPolicies),
    });

    const encrypted = this.encrypt(data);

    // Ensure directory exists
    const dir = dirname(this.storePath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    await writeFile(this.storePath, JSON.stringify(encrypted), 'utf-8');
  }

  /**
   * Get encryption info
   */
  getEncryptionInfo(): EncryptionInfo {
    return {
      algorithm: ALGORITHM,
      keyDerivation: 'pbkdf2',
    };
  }

  /**
   * Load secrets from environment variables
   */
  async loadFromEnv(keys: string[]): Promise<void> {
    this.ensureInitialized();

    for (const key of keys) {
      const value = process.env[key];
      if (value !== undefined) {
        await this.set(key, value);
      }
    }
  }

  /**
   * Export secrets to environment object
   */
  async toEnv(keys: string[]): Promise<Record<string, string>> {
    this.ensureInitialized();

    const env: Record<string, string> = {};
    for (const key of keys) {
      const value = await this.get(key);
      if (value !== undefined) {
        env[key] = value;
      }
    }
    return env;
  }

  /**
   * Get masked secret value
   */
  async getMasked(key: string): Promise<string> {
    this.ensureInitialized();
    const value = await this.get(key);
    if (!value) return '';
    return '*'.repeat(Math.min(value.length, 8));
  }

  /**
   * Get version history
   */
  async getVersions(key: string): Promise<SecretVersion[]> {
    this.ensureInitialized();
    return this.secrets.get(key)?.versions ?? [];
  }

  /**
   * Rotate master key
   */
  async rotateMasterKey(newKey: string): Promise<void> {
    this.ensureInitialized();

    // Generate new salt and derive new key
    this.salt = randomBytes(SALT_LENGTH);
    this.masterKey = this.deriveKey(newKey, this.salt);
  }

  /**
   * Get secret metadata
   */
  async getMetadata(key: string): Promise<SecretMetadata | undefined> {
    this.ensureInitialized();
    return this.secrets.get(key)?.metadata;
  }

  /**
   * Export secrets to encrypted file
   */
  async exportToFile(path: string, password: string): Promise<void> {
    this.ensureInitialized();

    const salt = randomBytes(SALT_LENGTH);
    const key = this.deriveKey(password, salt);

    const data = JSON.stringify({
      secrets: Object.fromEntries(this.secrets),
    });

    const encrypted = this.encryptWithKey(data, key, salt);

    await writeFile(path, JSON.stringify(encrypted), 'utf-8');
  }

  /**
   * Import secrets from encrypted file
   */
  async importFromFile(path: string, password: string): Promise<void> {
    this.ensureInitialized();

    const content = await readFile(path, 'utf-8');
    const store: EncryptedStore = JSON.parse(content);

    const salt = Buffer.from(store.salt, 'hex');
    const key = this.deriveKey(password, salt);

    const data = this.decryptWithKey(store, key);
    const parsed = JSON.parse(data);

    // Merge imported secrets
    for (const [k, v] of Object.entries(parsed.secrets)) {
      this.secrets.set(k, v as SecretEntry);
    }
  }

  /**
   * Set access policy for secret pattern
   */
  async setAccessPolicy(pattern: string, policy: AccessPolicy): Promise<void> {
    this.ensureInitialized();
    this.accessPolicies.set(pattern, policy);
  }

  /**
   * Check if context can access secret
   */
  async canAccess(key: string, context: AccessContext): Promise<boolean> {
    this.ensureInitialized();

    // Find matching policy
    for (const [pattern, policy] of this.accessPolicies) {
      if (this.matchesPattern(key, pattern)) {
        // Check roles
        if (policy.roles && context.roles) {
          if (policy.roles.some(r => context.roles!.includes(r))) {
            return true;
          }
        }

        // Check users
        if (policy.users && context.userId) {
          if (policy.users.includes(context.userId)) {
            return true;
          }
        }

        // If policy exists but no match, deny
        return false;
      }
    }

    // No policy - allow by default
    return true;
  }

  /**
   * Derive encryption key from password
   */
  private deriveKey(password: string, salt: Buffer): Buffer {
    return pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
  }

  /**
   * Encrypt data with master key
   */
  private encrypt(data: string): EncryptedStore {
    if (!this.masterKey || !this.salt) {
      throw new Error('Not initialized');
    }
    return this.encryptWithKey(data, this.masterKey, this.salt);
  }

  /**
   * Encrypt data with specific key
   */
  private encryptWithKey(data: string, key: Buffer, salt: Buffer): EncryptedStore {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const tag = cipher.getAuthTag();

    return {
      version: 1,
      salt: salt.toString('hex'),
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
      data: encrypted,
    };
  }

  /**
   * Decrypt data with master key
   */
  private decrypt(store: EncryptedStore): string {
    if (!this.masterKey) {
      throw new Error('Not initialized');
    }
    return this.decryptWithKey(store, this.masterKey);
  }

  /**
   * Decrypt data with specific key
   */
  private decryptWithKey(store: EncryptedStore, key: Buffer): string {
    const iv = Buffer.from(store.iv, 'hex');
    const tag = Buffer.from(store.tag, 'hex');

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(store.data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Load from encrypted file
   */
  private async load(masterKey: string): Promise<void> {
    const content = await readFile(this.storePath, 'utf-8');
    const store: EncryptedStore = JSON.parse(content);

    this.salt = Buffer.from(store.salt, 'hex');
    this.masterKey = this.deriveKey(masterKey, this.salt);

    try {
      const data = this.decrypt(store);
      const parsed = JSON.parse(data);

      this.secrets = new Map(Object.entries(parsed.secrets || {}));
      this.accessPolicies = new Map(Object.entries(parsed.policies || {}));
    } catch {
      throw new Error('Failed to decrypt: invalid master key');
    }
  }

  /**
   * Check if key matches pattern
   */
  private matchesPattern(key: string, pattern: string): boolean {
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      return key.startsWith(prefix);
    }
    return key === pattern;
  }

  /**
   * Ensure manager is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('SecretsManager not initialized');
    }
  }
}
