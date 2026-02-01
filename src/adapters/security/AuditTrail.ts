import { randomUUID } from 'crypto';
import { createHash } from 'crypto';
import { mkdir, readdir, readFile, appendFile, stat } from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

/**
 * Audit event types
 */
export type AuditEventType =
  | 'tool_invocation'
  | 'file_change'
  | 'user_action'
  | 'security_event'
  | 'error';

/**
 * Base audit event
 */
export interface AuditEvent {
  /** Event type */
  type: AuditEventType;
  /** Unique event ID (auto-generated) */
  id?: string;
  /** Timestamp (auto-generated) */
  timestamp?: number;
  /** Session ID */
  sessionId?: string;
  /** User ID */
  userId?: string;
  /** Integrity hash */
  integrityHash?: string;

  // Tool invocation fields
  tool?: string;
  params?: Record<string, unknown>;

  // File change fields
  path?: string;
  operation?: 'read' | 'write' | 'delete' | 'create';
  contentHash?: string;

  // User action fields
  action?: string;
  details?: Record<string, unknown>;

  // Security event fields
  severity?: 'info' | 'warning' | 'error' | 'critical';
  message?: string;

  // Error fields
  error?: string;
  stack?: string;
  context?: Record<string, unknown>;
}

/**
 * Query options for filtering events
 */
export interface AuditQueryOptions {
  type?: AuditEventType;
  startTime?: number;
  endTime?: number;
  limit?: number;
  offset?: number;
  search?: string;
}

/**
 * Audit trail configuration
 */
export interface AuditTrailOptions {
  logDir?: string;
  sessionId?: string;
  maxFileSize?: number;
  sensitiveFields?: string[];
}

/**
 * Default sensitive field patterns
 */
const DEFAULT_SENSITIVE_FIELDS = [
  'apiKey',
  'api_key',
  'password',
  'secret',
  'token',
  'authorization',
  'auth',
  'credential',
  'private',
  'privateKey',
];

/**
 * AuditTrail - Secure logging for all system actions
 *
 * Features:
 * - Structured JSON Lines logging
 * - Automatic log rotation
 * - Sensitive data redaction
 * - Integrity hashing
 * - Query and export capabilities
 */
export class AuditTrail {
  private readonly logDir: string;
  private readonly sessionId: string;
  private readonly maxFileSize: number;
  private readonly sensitiveFields: Set<string>;
  private userId?: string;
  private buffer: AuditEvent[] = [];
  private currentLogFile: string;
  private initialized = false;

  constructor(options: AuditTrailOptions = {}) {
    this.logDir = options.logDir ?? join(tmpdir(), 'seu-claude-audit');
    this.sessionId = options.sessionId ?? randomUUID();
    this.maxFileSize = options.maxFileSize ?? 10 * 1024 * 1024; // 10MB default
    this.sensitiveFields = new Set(options.sensitiveFields ?? DEFAULT_SENSITIVE_FIELDS);
    this.currentLogFile = this.generateLogFileName();

    // Ensure log directory exists synchronously for constructor
    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true });
    }
    this.initialized = true;
  }

  /**
   * Set user ID for subsequent events
   */
  setUserId(userId: string): void {
    this.userId = userId;
  }

  /**
   * Log an audit event
   */
  async log(event: AuditEvent): Promise<void> {
    await this.ensureInitialized();

    // Add metadata
    const enrichedEvent: AuditEvent = {
      ...event,
      id: randomUUID(),
      timestamp: Date.now(),
      sessionId: this.sessionId,
      userId: this.userId,
    };

    // Redact sensitive fields
    if (enrichedEvent.params) {
      enrichedEvent.params = this.redactSensitive(enrichedEvent.params);
    }
    if (enrichedEvent.context) {
      enrichedEvent.context = this.redactSensitive(enrichedEvent.context);
    }
    if (enrichedEvent.details) {
      enrichedEvent.details = this.redactSensitive(enrichedEvent.details);
    }

    // Compute integrity hash
    enrichedEvent.integrityHash = this.computeHash(enrichedEvent);

    // Add to buffer
    this.buffer.push(enrichedEvent);

    // Write to file
    await this.writeEvent(enrichedEvent);
  }

  /**
   * Query events with filtering
   */
  async query(options: AuditQueryOptions): Promise<AuditEvent[]> {
    await this.ensureInitialized();

    // Load all events from files
    const allEvents = await this.loadAllEvents();

    // Apply filters
    let filtered = allEvents;

    if (options.type) {
      filtered = filtered.filter(e => e.type === options.type);
    }

    if (options.startTime !== undefined) {
      filtered = filtered.filter(e => (e.timestamp ?? 0) >= options.startTime!);
    }

    if (options.endTime !== undefined) {
      filtered = filtered.filter(e => (e.timestamp ?? 0) <= options.endTime!);
    }

    if (options.search) {
      const searchLower = options.search.toLowerCase();
      filtered = filtered.filter(e => {
        const str = JSON.stringify(e).toLowerCase();
        return str.includes(searchLower);
      });
    }

    // Sort by timestamp
    filtered.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));

    // Apply pagination
    const offset = options.offset ?? 0;
    const limit = options.limit ?? filtered.length;

    return filtered.slice(offset, offset + limit);
  }

  /**
   * Flush buffer to disk
   */
  async flush(): Promise<void> {
    // Buffer is already written on each log, this ensures file handle is synced
    this.buffer = [];
  }

  /**
   * Close the audit trail
   */
  async close(): Promise<void> {
    await this.flush();
  }

  /**
   * Export events as JSON array
   */
  async exportAsJson(filter?: AuditQueryOptions): Promise<AuditEvent[]> {
    return this.query(filter ?? {});
  }

  /**
   * Export events as CSV
   */
  async exportAsCsv(filter?: AuditQueryOptions): Promise<string> {
    const events = await this.query(filter ?? {});

    if (events.length === 0) {
      return '';
    }

    // Build headers from all unique keys
    const headers = new Set<string>();
    for (const event of events) {
      for (const key of Object.keys(event)) {
        headers.add(key);
      }
    }

    const headerArray = Array.from(headers);
    const rows: string[] = [headerArray.join(',')];

    for (const event of events) {
      const row = headerArray.map(h => {
        const value = (event as unknown as Record<string, unknown>)[h];
        if (value === undefined || value === null) {
          return '';
        }
        if (typeof value === 'object') {
          return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
        }
        const str = String(value);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      });
      rows.push(row.join(','));
    }

    return rows.join('\n');
  }

  /**
   * Generate log file name
   */
  private generateLogFileName(): string {
    const date = new Date().toISOString().split('T')[0];
    const timestamp = Date.now();
    return join(this.logDir, `audit-${date}-${timestamp}.jsonl`);
  }

  /**
   * Ensure directory and initialization
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await mkdir(this.logDir, { recursive: true });
      this.initialized = true;
    }
  }

  /**
   * Write event to log file
   */
  private async writeEvent(event: AuditEvent): Promise<void> {
    // Check if rotation needed
    await this.checkRotation();

    const line = JSON.stringify(event) + '\n';
    await appendFile(this.currentLogFile, line, 'utf-8');
  }

  /**
   * Check if log rotation is needed
   */
  private async checkRotation(): Promise<void> {
    try {
      const stats = await stat(this.currentLogFile);
      if (stats.size >= this.maxFileSize) {
        this.currentLogFile = this.generateLogFileName();
      }
    } catch {
      // File doesn't exist yet, no rotation needed
    }
  }

  /**
   * Load all events from log files
   */
  private async loadAllEvents(): Promise<AuditEvent[]> {
    const events: AuditEvent[] = [];

    try {
      const files = await readdir(this.logDir);
      const logFiles = files
        .filter(f => f.endsWith('.jsonl'))
        .sort(); // Chronological order by filename

      for (const file of logFiles) {
        const content = await readFile(join(this.logDir, file), 'utf-8');
        const lines = content.trim().split('\n').filter(l => l);

        for (const line of lines) {
          try {
            events.push(JSON.parse(line));
          } catch {
            // Skip malformed lines
          }
        }
      }
    } catch {
      // Directory might not exist or be empty
    }

    return events;
  }

  /**
   * Redact sensitive fields from object
   */
  private redactSensitive(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (this.isSensitiveField(key)) {
        result[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        result[key] = this.redactSensitive(value as Record<string, unknown>);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Check if field name is sensitive
   */
  private isSensitiveField(key: string): boolean {
    const lowerKey = key.toLowerCase();
    for (const sensitive of this.sensitiveFields) {
      if (lowerKey.includes(sensitive.toLowerCase())) {
        return true;
      }
    }
    return false;
  }

  /**
   * Compute integrity hash for event
   */
  private computeHash(event: AuditEvent): string {
    const { integrityHash: _, ...rest } = event;
    const content = JSON.stringify(rest);
    return createHash('sha256').update(content).digest('hex').slice(0, 16);
  }
}
