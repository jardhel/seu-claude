import Database from 'better-sqlite3';
import { existsSync, unlinkSync, renameSync } from 'fs';
import { ITaskStore } from '../../core/interfaces/ITaskStore.js';
import { Task } from '../../core/entities/Task.js';

export class SQLiteTaskStore implements ITaskStore {
  private db: Database.Database;
  private dbPath: string;

  constructor(dbPath: string = ':memory:') {
    this.dbPath = dbPath;
    this.db = this.openDatabase(dbPath);
    this.initializeSchema();
  }

  private openDatabase(dbPath: string): Database.Database {
    try {
      const db = new Database(dbPath);
      // Test write capability immediately
      if (dbPath !== ':memory:') {
        this.testWriteCapability(db);
      }
      return db;
    } catch (error: any) {
      // Handle readonly database or locked database
      if (error.message?.includes('readonly') || error.code === 'SQLITE_READONLY') {
        return this.handleReadonlyDatabase(dbPath, error);
      }
      throw error;
    }
  }

  private testWriteCapability(db: Database.Database): void {
    try {
      db.exec('CREATE TABLE IF NOT EXISTS _write_test (id INTEGER)');
      db.exec('DROP TABLE IF EXISTS _write_test');
    } catch (error: any) {
      if (error.message?.includes('readonly') || error.code === 'SQLITE_READONLY') {
        throw error;
      }
      // Other errors during test are non-fatal
    }
  }

  private handleReadonlyDatabase(dbPath: string, originalError: Error): Database.Database {
    if (dbPath === ':memory:') {
      throw originalError;
    }

    // Try to recover by backing up and recreating
    const backupPath = `${dbPath}.readonly-backup-${Date.now()}`;

    try {
      if (existsSync(dbPath)) {
        renameSync(dbPath, backupPath);
        console.warn(`[seu-claude] Database was readonly, backed up to: ${backupPath}`);
      }

      // Remove any stale lock files
      const walPath = `${dbPath}-wal`;
      const shmPath = `${dbPath}-shm`;
      if (existsSync(walPath)) unlinkSync(walPath);
      if (existsSync(shmPath)) unlinkSync(shmPath);

      // Create fresh database
      const db = new Database(dbPath);
      console.warn('[seu-claude] Created fresh database after readonly recovery');
      return db;
    } catch (recoveryError: any) {
      // Recovery failed, throw with helpful message
      throw new Error(
        `Database is readonly and recovery failed. ` +
        `Original: ${originalError.message}. ` +
        `Recovery: ${recoveryError.message}. ` +
        `Try: rm -rf ${dbPath}* and restart.`
      );
    }
  }

  private initializeSchema(): void {
    try {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS tasks (
          id TEXT PRIMARY KEY,
          parentId TEXT,
          label TEXT NOT NULL,
          status TEXT NOT NULL,
          context TEXT NOT NULL DEFAULT '{}',
          createdAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
          updatedAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
        )
      `);
      // Index for efficient parent-child queries
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_parentId ON tasks(parentId)`);
    } catch (error: any) {
      if (error.message?.includes('readonly')) {
        // If schema init fails due to readonly, try recovery
        this.db.close();
        this.db = this.handleReadonlyDatabase(this.dbPath, error);
        this.initializeSchema();
      } else {
        throw error;
      }
    }
  }

  async save(task: Task): Promise<void> {
    await this.executeWrite(() => {
      const stmt = this.db.prepare(`
        INSERT INTO tasks (id, parentId, label, status, context, updatedAt)
        VALUES (?, ?, ?, ?, ?, strftime('%s', 'now'))
        ON CONFLICT(id) DO UPDATE SET
          parentId = excluded.parentId,
          label = excluded.label,
          status = excluded.status,
          context = excluded.context,
          updatedAt = strftime('%s', 'now')
      `);
      stmt.run(task.id, task.parentId || null, task.label, task.status, JSON.stringify(task.context));
    });
  }

  private async executeWrite<T>(operation: () => T): Promise<T> {
    try {
      return operation();
    } catch (error: any) {
      if (error.message?.includes('readonly') || error.code === 'SQLITE_READONLY') {
        // Attempt recovery
        this.db.close();
        this.db = this.handleReadonlyDatabase(this.dbPath, error);
        this.initializeSchema();
        // Retry the operation
        return operation();
      }
      throw error;
    }
  }

  async get(id: string): Promise<Task | null> {
    const row = this.db
      .prepare('SELECT id, parentId, label, status, context FROM tasks WHERE id = ?')
      .get(id) as any;
    return row ? this.rowToTask(row) : null;
  }

  async getChildren(parentId: string): Promise<Task[]> {
    const rows = this.db
      .prepare('SELECT id, parentId, label, status, context FROM tasks WHERE parentId = ?')
      .all(parentId) as any[];
    return rows.map(row => this.rowToTask(row));
  }

  async getAll(): Promise<Task[]> {
    const rows = this.db
      .prepare('SELECT id, parentId, label, status, context FROM tasks')
      .all() as any[];
    return rows.map(row => this.rowToTask(row));
  }

  async getRoots(): Promise<Task[]> {
    const rows = this.db
      .prepare('SELECT id, parentId, label, status, context FROM tasks WHERE parentId IS NULL')
      .all() as any[];
    return rows.map(row => this.rowToTask(row));
  }

  async delete(id: string): Promise<void> {
    await this.executeWrite(() => {
      this.db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    });
  }

  async clearAll(): Promise<void> {
    await this.executeWrite(() => {
      this.db.prepare('DELETE FROM tasks').run();
    });
  }

  close(): void {
    this.db.close();
  }

  private rowToTask(row: any): Task {
    return {
      id: row.id,
      parentId: row.parentId || undefined,
      label: row.label,
      status: row.status,
      context: JSON.parse(row.context),
    };
  }
}
