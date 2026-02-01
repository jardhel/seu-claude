/**
 * Permission string format: action:resource[:path]
 * Examples: file:read, tool:execute:sandbox, file:write:/src/*
 */
export type Permission = string;

/**
 * Role definition
 */
export interface Role {
  name: string;
  permissions: Permission[];
  inherits?: string[];
  policies?: string[];
}

/**
 * Access policy for conditional access control
 */
export interface AccessPolicy {
  name: string;
  condition: (context?: Record<string, unknown>) => boolean;
}

/**
 * Role creation options
 */
export interface RoleOptions {
  inherits?: string[];
  policies?: string[];
}

/**
 * Permission explanation
 */
export interface PermissionExplanation {
  granted: boolean;
  reason: string;
  matchingRoles?: string[];
  matchingPermissions?: Permission[];
  failedPolicies?: string[];
}

/**
 * RBAC configuration
 */
export interface RBACConfig {
  roles: Record<string, { permissions: Permission[]; inherits: string[]; policies?: string[] }>;
  assignments: Record<string, string[]>;
  policies?: Record<string, unknown>;
}

/**
 * Internal role storage
 */
interface RoleInternal {
  permissions: Set<Permission>;
  inherits: string[];
  policies: string[];
}

/**
 * Validate permission format
 */
function validatePermission(permission: Permission): boolean {
  // Wildcard permission
  if (permission === '*') return true;

  // Allow simple single-word permissions (e.g., "perm1")
  if (/^[a-zA-Z0-9_-]+$/.test(permission)) return true;

  // Format: action:resource[:path]
  const parts = permission.split(':');
  if (parts.length < 2) return false;

  const action = parts[0];
  const resource = parts[1];

  // Action and resource should not be empty
  if (!action || !resource) return false;

  return true;
}

/**
 * Check if a permission matches another (with wildcard support)
 */
function permissionMatches(granted: Permission, requested: Permission): boolean {
  // Universal wildcard
  if (granted === '*') return true;

  // Simple permission match (single word)
  if (!granted.includes(':') && !requested.includes(':')) {
    return granted === requested;
  }

  // If one has colons and the other doesn't, they don't match (unless granted is *)
  if (!granted.includes(':') || !requested.includes(':')) {
    return false;
  }

  const grantedParts = granted.split(':');
  const requestedParts = requested.split(':');

  // Check action
  if (grantedParts[0] !== '*' && grantedParts[0] !== requestedParts[0]) {
    return false;
  }

  // Check resource
  if (grantedParts[1] !== '*' && grantedParts[1] !== requestedParts[1]) {
    return false;
  }

  // Check path if present
  if (grantedParts.length > 2 && requestedParts.length > 2) {
    return pathMatches(grantedParts.slice(2).join(':'), requestedParts.slice(2).join(':'));
  }

  // If granted has no path constraint, it matches
  if (grantedParts.length <= 2) {
    return true;
  }

  return false;
}

/**
 * Check if a path matches a pattern (with glob support)
 */
function pathMatches(pattern: string, path: string): boolean {
  // Exact match
  if (pattern === path) return true;

  // Wildcard match
  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1);
    return path.startsWith(prefix);
  }

  // Double wildcard (match any depth)
  if (pattern.includes('**')) {
    const [before, after] = pattern.split('**');
    return path.startsWith(before) && (after === '' || path.endsWith(after));
  }

  return false;
}

/**
 * RBAC - Role-Based Access Control
 *
 * Features:
 * - Hierarchical roles with inheritance
 * - Wildcard permissions
 * - Path-scoped permissions
 * - Custom access policies
 * - Configuration import/export
 */
export class RBAC {
  private roles: Map<string, RoleInternal> = new Map();
  private userRoles: Map<string, Set<string>> = new Map();
  private policies: Map<string, AccessPolicy> = new Map();

  constructor() {
    // Initialize with empty state
  }

  /**
   * Create a new role
   */
  createRole(name: string, permissions: Permission[] = [], options: RoleOptions = {}): void {
    // Validate permissions
    for (const perm of permissions) {
      if (!validatePermission(perm)) {
        throw new Error(`Invalid permission format: ${perm}`);
      }
    }

    this.roles.set(name, {
      permissions: new Set(permissions),
      inherits: options.inherits ?? [],
      policies: options.policies ?? [],
    });
  }

  /**
   * Check if a role exists
   */
  hasRole(name: string): boolean {
    return this.roles.has(name);
  }

  /**
   * Delete a role
   */
  deleteRole(name: string): void {
    this.roles.delete(name);
    // Remove role from all user assignments
    for (const [_userId, roles] of this.userRoles) {
      roles.delete(name);
    }
  }

  /**
   * List all roles
   */
  listRoles(): string[] {
    return Array.from(this.roles.keys());
  }

  /**
   * Get permissions for a role (not including inherited)
   */
  getRolePermissions(name: string): Permission[] {
    const role = this.roles.get(name);
    return role ? Array.from(role.permissions) : [];
  }

  /**
   * Add permission to a role
   */
  addPermissionToRole(roleName: string, permission: Permission): void {
    const role = this.roles.get(roleName);
    if (role) {
      if (!validatePermission(permission)) {
        throw new Error(`Invalid permission format: ${permission}`);
      }
      role.permissions.add(permission);
    }
  }

  /**
   * Remove permission from a role
   */
  removePermissionFromRole(roleName: string, permission: Permission): void {
    const role = this.roles.get(roleName);
    if (role) {
      role.permissions.delete(permission);
    }
  }

  /**
   * Update role inheritance
   */
  updateRoleInheritance(roleName: string, inherits: string[]): void {
    const role = this.roles.get(roleName);
    if (!role) return;

    // Check for circular inheritance
    if (this.wouldCreateCircular(roleName, inherits)) {
      throw new Error('Circular inheritance detected');
    }

    role.inherits = inherits;
  }

  /**
   * Check if adding inheritance would create a cycle
   */
  private wouldCreateCircular(roleName: string, newInherits: string[]): boolean {
    const visited = new Set<string>();

    const checkCycle = (current: string): boolean => {
      if (current === roleName) return true;
      if (visited.has(current)) return false;
      visited.add(current);

      const role = this.roles.get(current);
      if (!role) return false;

      for (const parent of role.inherits) {
        if (checkCycle(parent)) return true;
      }
      return false;
    };

    for (const parent of newInherits) {
      if (checkCycle(parent)) return true;
    }
    return false;
  }

  /**
   * Assign a role to a user
   */
  assignRole(userId: string, role: string): void {
    if (!this.userRoles.has(userId)) {
      this.userRoles.set(userId, new Set());
    }
    this.userRoles.get(userId)!.add(role);
  }

  /**
   * Revoke a role from a user
   */
  revokeRole(userId: string, role: string): void {
    const roles = this.userRoles.get(userId);
    if (roles) {
      roles.delete(role);
    }
  }

  /**
   * Revoke all roles from a user
   */
  revokeAllRoles(userId: string): void {
    this.userRoles.set(userId, new Set());
  }

  /**
   * Get roles assigned to a user
   */
  getUserRoles(userId: string): string[] {
    const roles = this.userRoles.get(userId);
    return roles ? Array.from(roles) : [];
  }

  /**
   * Get all permissions for a role including inherited
   */
  private getAllRolePermissions(roleName: string, visited: Set<string> = new Set()): Set<Permission> {
    if (visited.has(roleName)) return new Set();
    visited.add(roleName);

    const role = this.roles.get(roleName);
    if (!role) return new Set();

    const allPerms = new Set(role.permissions);

    // Add inherited permissions
    for (const parent of role.inherits) {
      const parentPerms = this.getAllRolePermissions(parent, visited);
      for (const perm of parentPerms) {
        allPerms.add(perm);
      }
    }

    return allPerms;
  }

  /**
   * Get all policies for a role including inherited
   */
  private getAllRolePolicies(roleName: string, visited: Set<string> = new Set()): string[] {
    if (visited.has(roleName)) return [];
    visited.add(roleName);

    const role = this.roles.get(roleName);
    if (!role) return [];

    const allPolicies = [...role.policies];

    // Add inherited policies
    for (const parent of role.inherits) {
      allPolicies.push(...this.getAllRolePolicies(parent, visited));
    }

    return allPolicies;
  }

  /**
   * Check if a user has a permission
   */
  hasPermission(userId: string, permission: Permission, context?: Record<string, unknown>): boolean {
    const userRoles = this.getUserRoles(userId);

    for (const roleName of userRoles) {
      const permissions = this.getAllRolePermissions(roleName);
      const policies = this.getAllRolePolicies(roleName);

      // Check if any permission matches
      for (const perm of permissions) {
        if (permissionMatches(perm, permission)) {
          // Check policies
          if (this.evaluatePolicies(policies, context)) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * Evaluate policies
   */
  private evaluatePolicies(policyNames: string[], context?: Record<string, unknown>): boolean {
    for (const policyName of policyNames) {
      const policy = this.policies.get(policyName);
      if (policy && !policy.condition(context)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Check if a user can access a tool
   */
  canAccessTool(userId: string, tool: string, context?: Record<string, unknown>): boolean {
    // Build the permission to check
    let permission = `tool:execute:${tool}`;
    if (context?.path) {
      permission += `:${context.path}`;
    }

    // Also check for wildcard tool permissions
    return (
      this.hasPermission(userId, permission, context) ||
      this.hasPermission(userId, 'tool:execute:*', context) ||
      this.hasPermission(userId, '*', context)
    );
  }

  /**
   * Add an access policy
   */
  addPolicy(policy: AccessPolicy): void {
    this.policies.set(policy.name, policy);
  }

  /**
   * Get effective permissions for a user
   */
  getEffectivePermissions(userId: string): Permission[] {
    const allPerms = new Set<Permission>();
    const userRoles = this.getUserRoles(userId);

    for (const roleName of userRoles) {
      const permissions = this.getAllRolePermissions(roleName);
      for (const perm of permissions) {
        allPerms.add(perm);
      }
    }

    return Array.from(allPerms);
  }

  /**
   * Explain why a permission is granted or denied
   */
  explainPermission(userId: string, permission: Permission): PermissionExplanation {
    const userRoles = this.getUserRoles(userId);
    const matchingRoles: string[] = [];
    const matchingPermissions: Permission[] = [];
    const failedPolicies: string[] = [];

    for (const roleName of userRoles) {
      const permissions = this.getAllRolePermissions(roleName);
      const policies = this.getAllRolePolicies(roleName);

      for (const perm of permissions) {
        if (permissionMatches(perm, permission)) {
          matchingRoles.push(roleName);
          matchingPermissions.push(perm);

          // Check policies
          for (const policyName of policies) {
            const policy = this.policies.get(policyName);
            if (policy && !policy.condition()) {
              failedPolicies.push(policyName);
            }
          }
        }
      }
    }

    if (matchingRoles.length > 0 && failedPolicies.length === 0) {
      return {
        granted: true,
        reason: `Permission granted via role: ${matchingRoles.join(', ')}`,
        matchingRoles,
        matchingPermissions,
      };
    }

    if (failedPolicies.length > 0) {
      return {
        granted: false,
        reason: `Permission denied by policies: ${failedPolicies.join(', ')}`,
        matchingRoles,
        matchingPermissions,
        failedPolicies,
      };
    }

    return {
      granted: false,
      reason: 'No matching permission found',
    };
  }

  /**
   * Export configuration
   */
  exportConfig(): RBACConfig {
    const roles: RBACConfig['roles'] = {};
    for (const [name, role] of this.roles) {
      roles[name] = {
        permissions: Array.from(role.permissions),
        inherits: role.inherits,
        policies: role.policies.length > 0 ? role.policies : undefined,
      };
    }

    const assignments: RBACConfig['assignments'] = {};
    for (const [userId, roles] of this.userRoles) {
      if (roles.size > 0) {
        assignments[userId] = Array.from(roles);
      }
    }

    return { roles, assignments };
  }

  /**
   * Import configuration
   */
  importConfig(config: RBACConfig): void {
    // Clear existing state
    this.roles.clear();
    this.userRoles.clear();

    // Import roles
    for (const [name, roleConfig] of Object.entries(config.roles)) {
      this.roles.set(name, {
        permissions: new Set(roleConfig.permissions),
        inherits: roleConfig.inherits,
        policies: roleConfig.policies ?? [],
      });
    }

    // Import assignments
    for (const [userId, roles] of Object.entries(config.assignments)) {
      this.userRoles.set(userId, new Set(roles));
    }
  }

  /**
   * Built-in role templates
   */
  static builtinRoles = {
    /**
     * Read-only role - can only read files and run analysis tools
     */
    readonly: (): Role => ({
      name: 'readonly',
      permissions: [
        'file:read',
        'tool:execute:analyze_dependency',
        'tool:execute:find_symbol',
        'tool:execute:validate_code',
      ],
    }),

    /**
     * Developer role - can read, write, and execute tools
     */
    developer: (): Role => ({
      name: 'developer',
      permissions: ['file:read', 'file:write', 'file:create', 'tool:execute:*'],
    }),

    /**
     * Admin role - full access
     */
    admin: (): Role => ({
      name: 'admin',
      permissions: ['*'],
    }),
  };
}
