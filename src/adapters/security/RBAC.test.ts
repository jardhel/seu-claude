import { describe, it, expect, beforeEach } from 'vitest';
import { RBAC, AccessPolicy } from './RBAC.js';

describe('RBAC', () => {
  let rbac: RBAC;

  beforeEach(() => {
    rbac = new RBAC();
  });

  describe('role management', () => {
    it('creates roles with default permissions', () => {
      rbac.createRole('admin');
      expect(rbac.hasRole('admin')).toBe(true);
    });

    it('creates roles with specified permissions', () => {
      rbac.createRole('editor', ['file:read', 'file:write']);
      expect(rbac.hasRole('editor')).toBe(true);
      expect(rbac.getRolePermissions('editor')).toContain('file:read');
      expect(rbac.getRolePermissions('editor')).toContain('file:write');
    });

    it('deletes roles', () => {
      rbac.createRole('temp');
      expect(rbac.hasRole('temp')).toBe(true);
      rbac.deleteRole('temp');
      expect(rbac.hasRole('temp')).toBe(false);
    });

    it('lists all roles', () => {
      rbac.createRole('role1');
      rbac.createRole('role2');
      const roles = rbac.listRoles();
      expect(roles).toContain('role1');
      expect(roles).toContain('role2');
    });

    it('updates role permissions', () => {
      rbac.createRole('developer', ['file:read']);
      rbac.addPermissionToRole('developer', 'file:write');
      expect(rbac.getRolePermissions('developer')).toContain('file:write');

      rbac.removePermissionFromRole('developer', 'file:read');
      expect(rbac.getRolePermissions('developer')).not.toContain('file:read');
    });
  });

  describe('permission management', () => {
    it('supports hierarchical permissions', () => {
      rbac.createRole('admin', ['*']); // Wildcard - all permissions
      rbac.assignRole('user1', 'admin');

      expect(rbac.hasPermission('user1', 'file:read')).toBe(true);
      expect(rbac.hasPermission('user1', 'tool:execute')).toBe(true);
    });

    it('supports resource-scoped permissions', () => {
      rbac.createRole('developer', ['file:read:/src/*', 'file:write:/src/*']);
      rbac.assignRole('user1', 'developer');

      expect(rbac.hasPermission('user1', 'file:read:/src/index.ts')).toBe(true);
      expect(rbac.hasPermission('user1', 'file:read:/etc/passwd')).toBe(false);
    });

    it('validates permission format', () => {
      // Empty or malformed permissions should throw
      expect(() => rbac.createRole('test', [''])).toThrow();
      expect(() => rbac.createRole('test', [':invalid'])).toThrow();
      expect(() => rbac.createRole('test', ['invalid:'])).toThrow();
      // Valid formats should not throw
      expect(() => rbac.createRole('test1', ['file:read'])).not.toThrow();
      expect(() => rbac.createRole('test2', ['simple_permission'])).not.toThrow();
    });
  });

  describe('user-role assignment', () => {
    beforeEach(() => {
      rbac.createRole('viewer', ['file:read']);
      rbac.createRole('editor', ['file:read', 'file:write']);
      rbac.createRole('admin', ['*']);
    });

    it('assigns roles to users', () => {
      rbac.assignRole('user1', 'viewer');
      expect(rbac.getUserRoles('user1')).toContain('viewer');
    });

    it('assigns multiple roles to users', () => {
      rbac.assignRole('user1', 'viewer');
      rbac.assignRole('user1', 'editor');
      const roles = rbac.getUserRoles('user1');
      expect(roles).toContain('viewer');
      expect(roles).toContain('editor');
    });

    it('revokes roles from users', () => {
      rbac.assignRole('user1', 'viewer');
      rbac.assignRole('user1', 'editor');
      rbac.revokeRole('user1', 'viewer');
      expect(rbac.getUserRoles('user1')).not.toContain('viewer');
      expect(rbac.getUserRoles('user1')).toContain('editor');
    });

    it('revokes all roles from users', () => {
      rbac.assignRole('user1', 'viewer');
      rbac.assignRole('user1', 'editor');
      rbac.revokeAllRoles('user1');
      expect(rbac.getUserRoles('user1')).toHaveLength(0);
    });
  });

  describe('permission inheritance', () => {
    it('inherits permissions from parent roles', () => {
      rbac.createRole('base', ['file:read']);
      rbac.createRole('extended', ['file:write'], { inherits: ['base'] });
      rbac.assignRole('user1', 'extended');

      expect(rbac.hasPermission('user1', 'file:read')).toBe(true);
      expect(rbac.hasPermission('user1', 'file:write')).toBe(true);
    });

    it('supports multi-level inheritance', () => {
      rbac.createRole('level1', ['perm1']);
      rbac.createRole('level2', ['perm2'], { inherits: ['level1'] });
      rbac.createRole('level3', ['perm3'], { inherits: ['level2'] });
      rbac.assignRole('user1', 'level3');

      expect(rbac.hasPermission('user1', 'perm1')).toBe(true);
      expect(rbac.hasPermission('user1', 'perm2')).toBe(true);
      expect(rbac.hasPermission('user1', 'perm3')).toBe(true);
    });

    it('detects circular inheritance', () => {
      rbac.createRole('a', ['perm1']);
      rbac.createRole('b', ['perm2'], { inherits: ['a'] });
      expect(() => rbac.updateRoleInheritance('a', ['b'])).toThrow('Circular');
    });
  });

  describe('tool access control', () => {
    beforeEach(() => {
      rbac.createRole('read-only', ['tool:execute:analyze_dependency', 'tool:execute:find_symbol']);
      rbac.createRole('developer', ['tool:execute:*']);
      rbac.createRole('admin', ['*']);
    });

    it('allows tool access based on permissions', () => {
      rbac.assignRole('user1', 'read-only');

      expect(rbac.canAccessTool('user1', 'analyze_dependency')).toBe(true);
      expect(rbac.canAccessTool('user1', 'execute_sandbox')).toBe(false);
    });

    it('supports wildcard tool permissions', () => {
      rbac.assignRole('user1', 'developer');

      expect(rbac.canAccessTool('user1', 'analyze_dependency')).toBe(true);
      expect(rbac.canAccessTool('user1', 'execute_sandbox')).toBe(true);
      expect(rbac.canAccessTool('user1', 'any_tool')).toBe(true);
    });

    it('restricts tool execution based on resource paths', () => {
      rbac.createRole('limited', [
        'tool:execute:validate_code:/src/*',
        'tool:execute:validate_code:/tests/*',
      ]);
      rbac.assignRole('user1', 'limited');

      expect(rbac.canAccessTool('user1', 'validate_code', { path: '/src/index.ts' })).toBe(true);
      expect(rbac.canAccessTool('user1', 'validate_code', { path: '/etc/passwd' })).toBe(false);
    });
  });

  describe('access policies', () => {
    it('creates custom access policies', () => {
      const policy: AccessPolicy = {
        name: 'working-hours',
        condition: () => {
          const hour = new Date().getHours();
          return hour >= 9 && hour < 17;
        },
      };

      rbac.addPolicy(policy);
      rbac.createRole('contractor', ['file:*'], { policies: ['working-hours'] });
    });

    it('evaluates policies during permission check', () => {
      const alwaysDeny: AccessPolicy = {
        name: 'always-deny',
        condition: () => false,
      };

      rbac.addPolicy(alwaysDeny);
      rbac.createRole('restricted', ['file:read'], { policies: ['always-deny'] });
      rbac.assignRole('user1', 'restricted');

      expect(rbac.hasPermission('user1', 'file:read')).toBe(false);
    });

    it('supports context-based policies', () => {
      const ipPolicy: AccessPolicy = {
        name: 'ip-whitelist',
        condition: (context) => {
          const allowedIps = ['192.168.1.1', '10.0.0.1'];
          const ip = (context?.ip as string) ?? '';
          return allowedIps.includes(ip);
        },
      };

      rbac.addPolicy(ipPolicy);
      rbac.createRole('internal', ['*'], { policies: ['ip-whitelist'] });
      rbac.assignRole('user1', 'internal');

      expect(rbac.hasPermission('user1', 'file:read', { ip: '192.168.1.1' })).toBe(true);
      expect(rbac.hasPermission('user1', 'file:read', { ip: '1.2.3.4' })).toBe(false);
    });
  });

  describe('built-in roles', () => {
    it('provides readonly role', () => {
      const readonlyRole = RBAC.builtinRoles.readonly();
      expect(readonlyRole.permissions).toContain('file:read');
      expect(readonlyRole.permissions).not.toContain('file:write');
      expect(readonlyRole.permissions).not.toContain('tool:execute:execute_sandbox');
    });

    it('provides developer role', () => {
      const devRole = RBAC.builtinRoles.developer();
      expect(devRole.permissions).toContain('file:read');
      expect(devRole.permissions).toContain('file:write');
      expect(devRole.permissions).toContain('tool:execute:*');
    });

    it('provides admin role', () => {
      const adminRole = RBAC.builtinRoles.admin();
      expect(adminRole.permissions).toContain('*');
    });
  });

  describe('serialization', () => {
    it('exports configuration to JSON', () => {
      rbac.createRole('test', ['file:read']);
      rbac.assignRole('user1', 'test');

      const config = rbac.exportConfig();
      expect(config.roles).toBeDefined();
      expect(config.assignments).toBeDefined();
    });

    it('imports configuration from JSON', () => {
      const config = {
        roles: {
          imported: { permissions: ['file:read', 'file:write'], inherits: [] },
        },
        assignments: {
          user1: ['imported'],
        },
      };

      rbac.importConfig(config);
      expect(rbac.hasRole('imported')).toBe(true);
      expect(rbac.hasPermission('user1', 'file:read')).toBe(true);
    });
  });

  describe('permission audit', () => {
    it('explains why permission is granted or denied', () => {
      rbac.createRole('developer', ['file:read', 'file:write']);
      rbac.assignRole('user1', 'developer');

      const explanation = rbac.explainPermission('user1', 'file:read');
      expect(explanation.granted).toBe(true);
      expect(explanation.reason).toContain('developer');

      const deniedExplanation = rbac.explainPermission('user1', 'file:delete');
      expect(deniedExplanation.granted).toBe(false);
    });

    it('lists effective permissions for user', () => {
      rbac.createRole('base', ['perm1', 'perm2']);
      rbac.createRole('extra', ['perm3'], { inherits: ['base'] });
      rbac.assignRole('user1', 'extra');

      const perms = rbac.getEffectivePermissions('user1');
      expect(perms).toContain('perm1');
      expect(perms).toContain('perm2');
      expect(perms).toContain('perm3');
    });
  });
});
