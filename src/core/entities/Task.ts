export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';
export interface Task {
  id: string;
  parentId?: string;
  label: string;
  status: TaskStatus;
  context: Record<string, any>;
}
