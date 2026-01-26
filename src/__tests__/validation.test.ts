/**
 * Tests for validation utilities
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  validateFilePath,
  validateSearchQuery,
  validateNumber,
  sanitizeForLogging,
  RateLimiter,
} from '../utils/validation.js';

describe('validateFilePath', () => {
  it('should accept valid paths', () => {
    expect(validateFilePath('/Users/test/project/file.ts').valid).toBe(true);
    expect(validateFilePath('src/index.ts').valid).toBe(true);
    expect(validateFilePath('./file.ts').valid).toBe(true);
  });

  it('should reject paths with null bytes', () => {
    const result = validateFilePath('/path/to\0file.ts');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('null bytes');
  });

  it('should reject path traversal attempts', () => {
    expect(validateFilePath('../../../etc/passwd').valid).toBe(false);
    expect(validateFilePath('/path/../../../etc/passwd').valid).toBe(false);
    expect(validateFilePath('..\\..\\windows\\system32').valid).toBe(false);
  });

  it('should reject paths outside allowed root', () => {
    const result = validateFilePath('/etc/passwd', '/Users/test/project');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('outside allowed root');
  });

  it('should accept paths within allowed root', () => {
    const result = validateFilePath('/Users/test/project/src/file.ts', '/Users/test/project');
    expect(result.valid).toBe(true);
  });

  it('should reject suspicious system paths', () => {
    expect(validateFilePath('/etc/passwd').valid).toBe(false);
    expect(validateFilePath('/proc/self/environ').valid).toBe(false);
    expect(validateFilePath('/sys/kernel').valid).toBe(false);
    expect(validateFilePath('/dev/null').valid).toBe(false);
    expect(validateFilePath('C:\\Windows\\System32').valid).toBe(false);
  });
});

describe('validateSearchQuery', () => {
  it('should accept valid queries', () => {
    expect(validateSearchQuery('function authentication').valid).toBe(true);
    expect(validateSearchQuery('class User extends BaseModel').valid).toBe(true);
  });

  it('should reject empty queries', () => {
    expect(validateSearchQuery('').valid).toBe(false);
    // @ts-expect-error - testing invalid input
    expect(validateSearchQuery(null).valid).toBe(false);
    // @ts-expect-error - testing invalid input
    expect(validateSearchQuery(undefined).valid).toBe(false);
  });

  it('should reject queries that are too long', () => {
    const longQuery = 'a'.repeat(10001);
    const result = validateSearchQuery(longQuery);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('too long');
  });

  it('should reject queries with null bytes', () => {
    const result = validateSearchQuery('test\0query');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('null bytes');
  });
});

describe('validateNumber', () => {
  it('should accept valid numbers', () => {
    expect(validateNumber(5).valid).toBe(true);
    expect(validateNumber(0).valid).toBe(true);
    expect(validateNumber(-10).valid).toBe(true);
    expect(validateNumber(3.14).valid).toBe(true);
  });

  it('should reject non-numbers', () => {
    expect(validateNumber('5').valid).toBe(false);
    expect(validateNumber(null).valid).toBe(false);
    expect(validateNumber(undefined).valid).toBe(false);
    expect(validateNumber(NaN).valid).toBe(false);
  });

  it('should enforce minimum value', () => {
    expect(validateNumber(5, { min: 0 }).valid).toBe(true);
    expect(validateNumber(-1, { min: 0 }).valid).toBe(false);
  });

  it('should enforce maximum value', () => {
    expect(validateNumber(5, { max: 10 }).valid).toBe(true);
    expect(validateNumber(15, { max: 10 }).valid).toBe(false);
  });

  it('should use custom name in error messages', () => {
    const result = validateNumber('invalid', { name: 'limit' });
    expect(result.error).toContain('limit');
  });
});

describe('sanitizeForLogging', () => {
  it('should redact long alphanumeric strings (potential tokens)', () => {
    const input = 'API key: sk_test_12345678901234567890';
    const result = sanitizeForLogging(input);
    expect(result).toContain('[REDACTED]');
    expect(result).not.toContain('12345678901234567890');
  });

  it('should redact email addresses', () => {
    const input = 'Contact: user@example.com for support';
    const result = sanitizeForLogging(input);
    expect(result).toContain('[EMAIL]');
    expect(result).not.toContain('user@example.com');
  });

  it('should redact IP addresses', () => {
    const input = 'Request from 192.168.1.100';
    const result = sanitizeForLogging(input);
    expect(result).toContain('[IP]');
    expect(result).not.toContain('192.168.1.100');
  });

  it('should handle multiple sensitive items', () => {
    const input = 'User user@test.com from 10.0.0.1 with token abc123456789012345678901234567890';
    const result = sanitizeForLogging(input);
    expect(result).toContain('[EMAIL]');
    expect(result).toContain('[IP]');
    expect(result).toContain('[REDACTED]');
  });

  it('should preserve non-sensitive text', () => {
    const input = 'Normal log message without sensitive data';
    const result = sanitizeForLogging(input);
    expect(result).toBe('Normal log message without sensitive data');
  });
});

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter(5, 1000); // 5 calls per second
  });

  it('should allow calls within limit', () => {
    expect(limiter.canProceed()).toBe(true);
    expect(limiter.canProceed()).toBe(true);
    expect(limiter.canProceed()).toBe(true);
  });

  it('should block calls exceeding limit', () => {
    for (let i = 0; i < 5; i++) {
      expect(limiter.canProceed()).toBe(true);
    }
    expect(limiter.canProceed()).toBe(false);
  });

  it('should report remaining calls correctly', () => {
    expect(limiter.getRemainingCalls()).toBe(5);

    limiter.canProceed();
    expect(limiter.getRemainingCalls()).toBe(4);

    limiter.canProceed();
    limiter.canProceed();
    expect(limiter.getRemainingCalls()).toBe(2);
  });

  it('should reset after window expires', async () => {
    // Fill up the limit
    for (let i = 0; i < 5; i++) {
      limiter.canProceed();
    }
    expect(limiter.canProceed()).toBe(false);

    // Create a new limiter with very short window to test expiration
    const shortLimiter = new RateLimiter(2, 50);
    shortLimiter.canProceed();
    shortLimiter.canProceed();
    expect(shortLimiter.canProceed()).toBe(false);

    // Wait for window to expire
    await new Promise(resolve => {
      setTimeout(resolve, 60);
    });
    expect(shortLimiter.canProceed()).toBe(true);
  });

  it('should use default values', () => {
    const defaultLimiter = new RateLimiter();
    // Default is 100 calls per minute
    for (let i = 0; i < 100; i++) {
      expect(defaultLimiter.canProceed()).toBe(true);
    }
  });
});
