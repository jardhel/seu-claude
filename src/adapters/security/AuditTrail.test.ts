import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdir, rm, readFile } from 'fs/promises';
import { AuditTrail } from './AuditTrail.js';

describe('AuditTrail', () => {
  let testDir: string;
  let audit: AuditTrail;

  beforeEach(async () => {
    testDir = join(tmpdir(), `audit-trail-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(testDir, { recursive: true });
    audit = new AuditTrail({ logDir: testDir });
  });

  afterEach(async () => {
    await audit.close();
    await rm(testDir, { recursive: true, force: true });
  });

  describe('initialization', () => {
    it('creates audit trail with default options', () => {
      const defaultAudit = new AuditTrail();
      expect(defaultAudit).toBeDefined();
    });

    it('creates log directory if it does not exist', async () => {
      const newDir = join(testDir, 'new-audit-dir');
      const newAudit = new AuditTrail({ logDir: newDir });
      await newAudit.log({ type: 'tool_invocation', tool: 'test', params: {} });
      await newAudit.close();

      const { existsSync } = await import('fs');
      expect(existsSync(newDir)).toBe(true);
    });
  });

  describe('logging events', () => {
    it('logs tool invocation events', async () => {
      await audit.log({
        type: 'tool_invocation',
        tool: 'execute_sandbox',
        params: { command: 'echo', args: ['hello'] },
      });

      const events = await audit.query({ type: 'tool_invocation' });
      expect(events.length).toBe(1);
      expect(events[0].tool).toBe('execute_sandbox');
    });

    it('logs file change events', async () => {
      await audit.log({
        type: 'file_change',
        path: '/src/test.ts',
        operation: 'write',
        contentHash: 'abc123',
      });

      const events = await audit.query({ type: 'file_change' });
      expect(events.length).toBe(1);
      expect(events[0].path).toBe('/src/test.ts');
      expect(events[0].operation).toBe('write');
    });

    it('logs user action events', async () => {
      await audit.log({
        type: 'user_action',
        action: 'approve_plan',
        details: { planId: 'plan-123' },
      });

      const events = await audit.query({ type: 'user_action' });
      expect(events.length).toBe(1);
      expect(events[0].action).toBe('approve_plan');
    });

    it('logs security events', async () => {
      await audit.log({
        type: 'security_event',
        severity: 'warning',
        message: 'Attempted access to sensitive file',
        path: '/etc/passwd',
      });

      const events = await audit.query({ type: 'security_event' });
      expect(events.length).toBe(1);
      expect(events[0].severity).toBe('warning');
    });

    it('logs error events', async () => {
      await audit.log({
        type: 'error',
        error: 'Command failed',
        stack: 'Error: Command failed\n  at ...',
        context: { command: 'npm test' },
      });

      const events = await audit.query({ type: 'error' });
      expect(events.length).toBe(1);
      expect(events[0].error).toBe('Command failed');
    });
  });

  describe('event metadata', () => {
    it('adds timestamp to all events', async () => {
      const before = Date.now();
      await audit.log({ type: 'tool_invocation', tool: 'test', params: {} });
      const after = Date.now();

      const events = await audit.query({});
      expect(events[0].timestamp).toBeGreaterThanOrEqual(before);
      expect(events[0].timestamp).toBeLessThanOrEqual(after);
    });

    it('adds unique event ID to all events', async () => {
      await audit.log({ type: 'tool_invocation', tool: 'test1', params: {} });
      await audit.log({ type: 'tool_invocation', tool: 'test2', params: {} });

      const events = await audit.query({});
      expect(events[0].id).toBeDefined();
      expect(events[1].id).toBeDefined();
      expect(events[0].id).not.toBe(events[1].id);
    });

    it('supports custom session ID', async () => {
      const sessionAudit = new AuditTrail({ logDir: testDir, sessionId: 'session-123' });
      await sessionAudit.log({ type: 'tool_invocation', tool: 'test', params: {} });

      const events = await sessionAudit.query({});
      expect(events[0].sessionId).toBe('session-123');
      await sessionAudit.close();
    });

    it('supports user ID tracking', async () => {
      audit.setUserId('user-456');
      await audit.log({ type: 'tool_invocation', tool: 'test', params: {} });

      const events = await audit.query({});
      expect(events[0].userId).toBe('user-456');
    });
  });

  describe('querying events', () => {
    beforeEach(async () => {
      // Create diverse test events
      await audit.log({ type: 'tool_invocation', tool: 'tool1', params: {} });
      await audit.log({ type: 'tool_invocation', tool: 'tool2', params: {} });
      await audit.log({ type: 'file_change', path: '/a.ts', operation: 'write' });
      await audit.log({ type: 'file_change', path: '/b.ts', operation: 'delete' });
      await audit.log({ type: 'security_event', severity: 'warning', message: 'test' });
    });

    it('queries by event type', async () => {
      const toolEvents = await audit.query({ type: 'tool_invocation' });
      expect(toolEvents.length).toBe(2);

      const fileEvents = await audit.query({ type: 'file_change' });
      expect(fileEvents.length).toBe(2);
    });

    it('queries by time range', async () => {
      const now = Date.now();
      const events = await audit.query({
        startTime: now - 1000,
        endTime: now + 1000,
      });
      expect(events.length).toBe(5);
    });

    it('queries with limit and offset', async () => {
      const page1 = await audit.query({ limit: 2, offset: 0 });
      expect(page1.length).toBe(2);

      const page2 = await audit.query({ limit: 2, offset: 2 });
      expect(page2.length).toBe(2);

      expect(page1[0].id).not.toBe(page2[0].id);
    });

    it('queries with text search', async () => {
      await audit.log({
        type: 'error',
        error: 'Connection refused',
        context: {},
      });

      const events = await audit.query({ search: 'refused' });
      expect(events.length).toBe(1);
    });

    it('returns events in chronological order', async () => {
      const events = await audit.query({});
      for (let i = 1; i < events.length; i++) {
        expect(events[i].timestamp ?? 0).toBeGreaterThanOrEqual(events[i - 1].timestamp ?? 0);
      }
    });
  });

  describe('persistence', () => {
    it('writes events to log file', async () => {
      await audit.log({ type: 'tool_invocation', tool: 'test', params: {} });
      await audit.flush();

      const { readdirSync } = await import('fs');
      const files = readdirSync(testDir);
      expect(files.some(f => f.endsWith('.jsonl'))).toBe(true);
    });

    it('uses JSON Lines format', async () => {
      await audit.log({ type: 'tool_invocation', tool: 'test1', params: {} });
      await audit.log({ type: 'tool_invocation', tool: 'test2', params: {} });
      await audit.flush();

      const { readdirSync } = await import('fs');
      const files = readdirSync(testDir).filter(f => f.endsWith('.jsonl'));
      const content = await readFile(join(testDir, files[0]), 'utf-8');
      const lines = content.trim().split('\n');

      expect(lines.length).toBe(2);
      expect(() => JSON.parse(lines[0])).not.toThrow();
      expect(() => JSON.parse(lines[1])).not.toThrow();
    });

    it('survives restart and reloads events', async () => {
      await audit.log({ type: 'tool_invocation', tool: 'test', params: {} });
      await audit.close();

      // Create new instance with same directory
      const audit2 = new AuditTrail({ logDir: testDir });
      const events = await audit2.query({});
      expect(events.length).toBe(1);
      await audit2.close();
    });
  });

  describe('log rotation', () => {
    it('rotates logs when size limit exceeded', async () => {
      const smallAudit = new AuditTrail({
        logDir: testDir,
        maxFileSize: 500, // Very small for testing
      });

      // Log enough to trigger rotation
      for (let i = 0; i < 20; i++) {
        await smallAudit.log({
          type: 'tool_invocation',
          tool: `tool-${i}`,
          params: { data: 'x'.repeat(50) },
        });
      }
      await smallAudit.flush();
      await smallAudit.close();

      const { readdirSync } = await import('fs');
      const logFiles = readdirSync(testDir).filter(f => f.endsWith('.jsonl'));
      expect(logFiles.length).toBeGreaterThan(1);
    });

    it('maintains event order across rotated files', async () => {
      const smallAudit = new AuditTrail({
        logDir: testDir,
        maxFileSize: 500,
      });

      for (let i = 0; i < 10; i++) {
        await smallAudit.log({
          type: 'tool_invocation',
          tool: `tool-${i}`,
          params: {},
        });
      }
      await smallAudit.flush();

      const events = await smallAudit.query({});
      expect(events.length).toBe(10);

      // Verify order
      for (let i = 0; i < events.length; i++) {
        expect(events[i].tool).toBe(`tool-${i}`);
      }
      await smallAudit.close();
    });
  });

  describe('export functionality', () => {
    it('exports events to JSON', async () => {
      await audit.log({ type: 'tool_invocation', tool: 'test', params: {} });
      const json = await audit.exportAsJson();

      expect(Array.isArray(json)).toBe(true);
      expect(json.length).toBe(1);
    });

    it('exports events to CSV', async () => {
      await audit.log({ type: 'tool_invocation', tool: 'test', params: {} });
      const csv = await audit.exportAsCsv();

      expect(typeof csv).toBe('string');
      expect(csv).toContain('timestamp');
      expect(csv).toContain('tool_invocation');
    });

    it('exports filtered events', async () => {
      await audit.log({ type: 'tool_invocation', tool: 'test', params: {} });
      await audit.log({ type: 'file_change', path: '/test.ts', operation: 'write' });

      const json = await audit.exportAsJson({ type: 'tool_invocation' });
      expect(json.length).toBe(1);
      expect(json[0].type).toBe('tool_invocation');
    });
  });

  describe('security features', () => {
    it('redacts sensitive data from params', async () => {
      await audit.log({
        type: 'tool_invocation',
        tool: 'api_call',
        params: {
          apiKey: 'secret-key-123',
          password: 'my-password',
          data: 'normal data',
        },
      });

      const events = await audit.query({});
      expect(events[0].params?.apiKey).toBe('[REDACTED]');
      expect(events[0].params?.password).toBe('[REDACTED]');
      expect(events[0].params?.data).toBe('normal data');
    });

    it('allows custom sensitive field patterns', async () => {
      const customAudit = new AuditTrail({
        logDir: testDir,
        sensitiveFields: ['apiKey', 'password', 'token', 'secret', 'customSecret'],
      });

      await customAudit.log({
        type: 'tool_invocation',
        tool: 'test',
        params: { customSecret: 'value' },
      });

      const events = await customAudit.query({});
      expect(events[0].params?.customSecret).toBe('[REDACTED]');
      await customAudit.close();
    });

    it('computes integrity hash for events', async () => {
      await audit.log({ type: 'tool_invocation', tool: 'test', params: {} });

      const events = await audit.query({});
      expect(events[0].integrityHash).toBeDefined();
      expect(typeof events[0].integrityHash).toBe('string');
    });
  });

  describe('performance', () => {
    it('handles high-volume logging efficiently', async () => {
      const startTime = Date.now();

      for (let i = 0; i < 1000; i++) {
        await audit.log({
          type: 'tool_invocation',
          tool: `tool-${i}`,
          params: { index: i },
        });
      }

      const duration = Date.now() - startTime;
      // Should complete in reasonable time (< 5 seconds for 1000 events)
      expect(duration).toBeLessThan(5000);

      const events = await audit.query({});
      expect(events.length).toBe(1000);
    });
  });
});
