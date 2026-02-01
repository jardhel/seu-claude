import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdir, rm, readFile } from 'fs/promises';
import { SecretsManager } from './SecretsManager.js';

describe('SecretsManager', () => {
  let testDir: string;
  let secrets: SecretsManager;

  beforeEach(async () => {
    testDir = join(tmpdir(), `secrets-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(testDir, { recursive: true });
    secrets = new SecretsManager({ storePath: join(testDir, 'secrets.enc') });
    await secrets.initialize('test-master-key');
  });

  afterEach(async () => {
    await secrets.close();
    await rm(testDir, { recursive: true, force: true });
  });

  describe('initialization', () => {
    it('creates secrets manager with default options', async () => {
      const defaultSecrets = new SecretsManager();
      expect(defaultSecrets).toBeDefined();
    });

    it('initializes with master key', async () => {
      const newSecrets = new SecretsManager({ storePath: join(testDir, 'new-secrets.enc') });
      await newSecrets.initialize('my-master-key');
      expect(newSecrets.isInitialized()).toBe(true);
      await newSecrets.close();
    });

    it('generates master key if not provided', async () => {
      const autoSecrets = new SecretsManager({ storePath: join(testDir, 'auto-secrets.enc') });
      const key = await autoSecrets.initialize();
      expect(typeof key).toBe('string');
      expect(key.length).toBeGreaterThan(0);
      await autoSecrets.close();
    });

    it('fails to operate before initialization', async () => {
      const uninitSecrets = new SecretsManager();
      await expect(uninitSecrets.set('key', 'value')).rejects.toThrow();
    });
  });

  describe('storing and retrieving secrets', () => {
    it('stores and retrieves a secret', async () => {
      await secrets.set('api-key', 'secret-value-123');
      const value = await secrets.get('api-key');
      expect(value).toBe('secret-value-123');
    });

    it('returns undefined for non-existent secrets', async () => {
      const value = await secrets.get('non-existent');
      expect(value).toBeUndefined();
    });

    it('overwrites existing secrets', async () => {
      await secrets.set('key', 'value1');
      await secrets.set('key', 'value2');
      const value = await secrets.get('key');
      expect(value).toBe('value2');
    });

    it('stores multiple secrets', async () => {
      await secrets.set('key1', 'value1');
      await secrets.set('key2', 'value2');
      await secrets.set('key3', 'value3');

      expect(await secrets.get('key1')).toBe('value1');
      expect(await secrets.get('key2')).toBe('value2');
      expect(await secrets.get('key3')).toBe('value3');
    });

    it('deletes secrets', async () => {
      await secrets.set('key', 'value');
      expect(await secrets.get('key')).toBe('value');

      await secrets.delete('key');
      expect(await secrets.get('key')).toBeUndefined();
    });

    it('lists all secret keys', async () => {
      await secrets.set('key1', 'value1');
      await secrets.set('key2', 'value2');

      const keys = await secrets.list();
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
    });
  });

  describe('encryption', () => {
    it('encrypts secrets at rest', async () => {
      await secrets.set('sensitive', 'my-password');
      await secrets.save();

      // Read the raw file content
      const content = await readFile(join(testDir, 'secrets.enc'), 'utf-8');

      // Should not contain plaintext
      expect(content).not.toContain('my-password');
      expect(content).not.toContain('sensitive');
    });

    it('persists secrets across instances', async () => {
      await secrets.set('persistent-key', 'persistent-value');
      await secrets.save();
      await secrets.close();

      // Create new instance with same key
      const secrets2 = new SecretsManager({ storePath: join(testDir, 'secrets.enc') });
      await secrets2.initialize('test-master-key');

      const value = await secrets2.get('persistent-key');
      expect(value).toBe('persistent-value');
      await secrets2.close();
    });

    it('fails to decrypt with wrong master key', async () => {
      await secrets.set('key', 'value');
      await secrets.save();
      await secrets.close();

      const secrets2 = new SecretsManager({ storePath: join(testDir, 'secrets.enc') });
      await expect(secrets2.initialize('wrong-key')).rejects.toThrow();
    });

    it('uses strong encryption algorithm', async () => {
      const info = secrets.getEncryptionInfo();
      expect(info.algorithm).toBe('aes-256-gcm');
      expect(info.keyDerivation).toBe('pbkdf2');
    });
  });

  describe('environment variables', () => {
    it('loads secrets from environment variables', async () => {
      process.env.TEST_SECRET_KEY = 'test-secret-value';

      await secrets.loadFromEnv(['TEST_SECRET_KEY']);
      const value = await secrets.get('TEST_SECRET_KEY');
      expect(value).toBe('test-secret-value');

      delete process.env.TEST_SECRET_KEY;
    });

    it('exports secrets to environment object', async () => {
      await secrets.set('DB_PASSWORD', 'password123');
      await secrets.set('API_KEY', 'key456');

      const env = await secrets.toEnv(['DB_PASSWORD', 'API_KEY']);
      expect(env.DB_PASSWORD).toBe('password123');
      expect(env.API_KEY).toBe('key456');
    });

    it('masks secrets in output', async () => {
      await secrets.set('password', 'secret-value');

      const masked = await secrets.getMasked('password');
      expect(masked).not.toBe('secret-value');
      expect(masked).toMatch(/^\*+$/); // Should be asterisks
    });
  });

  describe('namespaces', () => {
    it('supports namespaced secrets', async () => {
      await secrets.set('production/db-password', 'prod-pass');
      await secrets.set('staging/db-password', 'stage-pass');

      expect(await secrets.get('production/db-password')).toBe('prod-pass');
      expect(await secrets.get('staging/db-password')).toBe('stage-pass');
    });

    it('lists secrets by namespace', async () => {
      await secrets.set('production/key1', 'val1');
      await secrets.set('production/key2', 'val2');
      await secrets.set('staging/key1', 'val3');

      const prodKeys = await secrets.listByNamespace('production');
      expect(prodKeys.length).toBe(2);
      expect(prodKeys).toContain('production/key1');
      expect(prodKeys).toContain('production/key2');
    });
  });

  describe('secret rotation', () => {
    it('rotates secret with version history', async () => {
      await secrets.set('rotating-key', 'version1', { versioned: true });
      await secrets.set('rotating-key', 'version2', { versioned: true });

      const current = await secrets.get('rotating-key');
      expect(current).toBe('version2');

      const versions = await secrets.getVersions('rotating-key');
      expect(versions.length).toBe(2);
      expect(versions[0].value).toBe('version1');
      expect(versions[1].value).toBe('version2');
    });

    it('rotates master key', async () => {
      await secrets.set('key', 'value');
      await secrets.rotateMasterKey('new-master-key');
      await secrets.save();
      await secrets.close();

      // Should work with new key
      const secrets2 = new SecretsManager({ storePath: join(testDir, 'secrets.enc') });
      await secrets2.initialize('new-master-key');
      expect(await secrets2.get('key')).toBe('value');
      await secrets2.close();

      // Should fail with old key
      const secrets3 = new SecretsManager({ storePath: join(testDir, 'secrets.enc') });
      await expect(secrets3.initialize('test-master-key')).rejects.toThrow();
    });
  });

  describe('secret metadata', () => {
    it('stores metadata with secrets', async () => {
      await secrets.set('api-key', 'secret', {
        description: 'API key for external service',
        createdBy: 'admin',
        expiresAt: Date.now() + 86400000, // 1 day
      });

      const metadata = await secrets.getMetadata('api-key');
      expect(metadata?.description).toBe('API key for external service');
      expect(metadata?.createdBy).toBe('admin');
      expect(metadata?.expiresAt).toBeDefined();
    });

    it('tracks creation and update timestamps', async () => {
      await secrets.set('key', 'value1');
      const meta1 = await secrets.getMetadata('key');
      expect(meta1?.createdAt).toBeDefined();

      await new Promise(r => setTimeout(r, 10));
      await secrets.set('key', 'value2');
      const meta2 = await secrets.getMetadata('key');

      expect(meta2?.createdAt).toBe(meta1?.createdAt);
      expect(meta2?.updatedAt).toBeGreaterThan(meta1?.updatedAt ?? 0);
    });
  });

  describe('import/export', () => {
    it('exports secrets to encrypted file', async () => {
      await secrets.set('key1', 'value1');
      await secrets.set('key2', 'value2');

      const exportPath = join(testDir, 'export.enc');
      await secrets.exportToFile(exportPath, 'export-password');

      const content = await readFile(exportPath, 'utf-8');
      expect(content).not.toContain('value1');
      expect(content).not.toContain('value2');
    });

    it('imports secrets from encrypted file', async () => {
      const exportPath = join(testDir, 'import.enc');

      // Create export
      await secrets.set('imported-key', 'imported-value');
      await secrets.exportToFile(exportPath, 'import-password');

      // Clear and import
      await secrets.delete('imported-key');
      expect(await secrets.get('imported-key')).toBeUndefined();

      await secrets.importFromFile(exportPath, 'import-password');
      expect(await secrets.get('imported-key')).toBe('imported-value');
    });
  });

  describe('access control integration', () => {
    it('checks access permissions for secrets', async () => {
      await secrets.set('admin/secret', 'admin-value');
      await secrets.setAccessPolicy('admin/*', { roles: ['admin'] });

      expect(await secrets.canAccess('admin/secret', { roles: ['admin'] })).toBe(true);
      expect(await secrets.canAccess('admin/secret', { roles: ['user'] })).toBe(false);
    });
  });
});
