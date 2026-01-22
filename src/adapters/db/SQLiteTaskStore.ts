import Database from 'better-sqlite3';
import { ITaskStore } from '../../core/interfaces/ITaskStore';
import { Task } from '../../core/entities/Task';

export class SQLiteTaskStore implements ITaskStore {
  private db: Database.Database;

  constructor(dbPath: string = ':memory:') {
    this.db = new Database(dbPath);
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
  }

  async save(task: Task): Promise<void> {
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
  }

  async get(id: string): Promise<Task | null> {
    const row = this.db.prepare('SELECT id, parentId, label, status, context FROM tasks WHERE id = ?').get(id) as any;
    return row ? this.rowToTask(row) : null;
  }

  async getChildren(parentId: string): Promise<Task[]> {
    const rows = this.db.prepare('SELECT id, parentId, label, status, context FROM tasks WHERE parentId = ?').all(parentId) as any[];
    return rows.map(row => this.rowToTask(row));
  }

  async getAll(): Promise<Task[]> {
    const rows = this.db.prepare('SELECT id, parentId, label, status, context FROM tasks').all() as any[];
    return rows.map(row => this.rowToTask(row));
  }

  async getRoots(): Promise<Task[]> {
    const rows = this.db.prepare('SELECT id, parentId, label, status, context FROM tasks WHERE parentId IS NULL').all() as any[];
    return rows.map(row => this.rowToTask(row));
  }

  async delete(id: string): Promise<void> {
    this.db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
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
