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
