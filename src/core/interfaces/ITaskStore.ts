import { Task } from '../entities/Task';

export interface ITaskStore {
  /** Save or update a task */
  save(task: Task): Promise<void>;

  /** Get a task by ID */
  get(id: string): Promise<Task | null>;

  /** Get all child tasks of a parent */
  getChildren(parentId: string): Promise<Task[]>;

  /** Get all tasks in the store */
  getAll(): Promise<Task[]>;

  /** Get all root tasks (tasks with no parent) */
  getRoots(): Promise<Task[]>;

  /** Delete a task by ID */
  delete(id: string): Promise<void>;

  /** Close the database connection */
  close(): void;
}
