declare module 'tmp' {
  export interface DirOptions {
    unsafeCleanup?: boolean;
    prefix?: string;
    postfix?: string;
    template?: string;
    dir?: string;
    mode?: number;
    keep?: boolean;
  }

  export interface DirResult {
    name: string;
    removeCallback: () => void;
  }

  export function dirSync(options?: DirOptions): DirResult;
}
