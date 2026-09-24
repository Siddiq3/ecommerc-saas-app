/**
 * Permission-based authorization. Roles expand to permissions so V1.1 staff accounts
 * can land without re-auditing every route.
 */
export const PERMISSIONS = Object.freeze([
  'business:read', 'business:write',
  'product:read', 'product:write', 'product:delete',
  'category:read', 'category:write',
  'inventory:read', 'inventory:write',
  'order:read', 'order:write', 'order:cancel',
  'payment:read', 'payment:verify',
  'customer:read',
  'coupon:read', 'coupon:write',
  'settings:read', 'settings:write',
  'analytics:read',
  'upload:write',
  'member:read', 'member:write',
  'audit:read',
  'domain:read', 'domain:write',
]);

export const ROLES = Object.freeze(['owner', 'manager', 'staff']);

export const ROLE_PERMISSIONS = Object.freeze({
  owner: [...PERMISSIONS],
  manager: [
    'business:read', 'product:read', 'product:write', 'product:delete',
    'category:read', 'category:write', 'inventory:read', 'inventory:write',
    'order:read', 'order:write', 'order:cancel', 'payment:read', 'payment:verify',
    'customer:read', 'coupon:read', 'coupon:write', 'settings:read',
    'analytics:read', 'upload:write',
  ],
  staff: [
    'business:read', 'product:read', 'category:read', 'inventory:read',
    'inventory:write', 'order:read', 'order:write', 'payment:read', 'customer:read',
  ],
});

export const permissionsForRole = (role) => ROLE_PERMISSIONS[role] ?? [];
export const hasPermission = (permissions, required) => Array.isArray(permissions) && permissions.includes(required);

/**
 * What a membership may actually do.
 *
 * A membership stores the permissions its role had *when it was created*. That snapshot goes
 * stale the day a role gains a permission: every existing owner would be refused the new
 * feature until someone rewrote their row. The role is the definition, so for a role we
 * know, the role decides — an owner is always granted everything an owner is, today. The
 * stored list is the fallback for a role this code does not recognise, so nothing that
 * worked before is refused.
 *
 * Read-time derivation rather than a backfill: there is nothing to run at deploy, nothing
 * to forget, and removing a permission from a role takes effect on the next request instead
 * of whenever a script reaches the row.
 */
export const effectivePermissions = (membership) =>
  ROLE_PERMISSIONS[membership?.role] ? [...ROLE_PERMISSIONS[membership.role]] : [...(membership?.permissions ?? [])];
