export const ROLES = [
  "SUPER_ADMIN",
  "ADMIN",
  "OPERATIONS",
  "DISPATCHER",
  "DEPOT_AGENT",
  "COURIER",
  "MERCHANT",
  "ACCOUNTANT",
  "SUPPORT"
] as const;

export type Role = (typeof ROLES)[number];

export type Permission =
  | "shipment:read"
  | "shipment:write"
  | "shipment:transition"
  | "shipment:assign"
  | "merchant:read"
  | "merchant:write"
  | "zone:read"
  | "zone:write"
  | "tariff:write"
  | "user:manage"
  | "courier:read"
  | "courier:manage"
  | "assignment:read"
  | "assignment:write"
  | "cod:read"
  | "cod:write"
  | "cod:reverse"
  | "settlement:read"
  | "settlement:write"
  | "settlement:approve"
  | "settlement:pay"
  | "audit:read";

const PERMISSIONS: Record<Role, Permission[]> = {
  SUPER_ADMIN: [
    "shipment:read", "shipment:write", "shipment:transition", "shipment:assign",
    "merchant:read", "merchant:write", "zone:read", "zone:write", "tariff:write",
    "user:manage", "courier:read", "courier:manage", "assignment:read", "assignment:write",
    "cod:read", "cod:write", "cod:reverse",
    "settlement:read", "settlement:write", "settlement:approve", "settlement:pay",
    "audit:read"
  ],
  ADMIN: [
    "shipment:read", "shipment:write", "shipment:transition", "shipment:assign",
    "merchant:read", "merchant:write", "zone:read", "zone:write", "tariff:write",
    "user:manage", "courier:read", "courier:manage", "assignment:read", "assignment:write",
    "cod:read", "cod:write", "cod:reverse",
    "settlement:read", "settlement:write", "settlement:approve", "settlement:pay",
    "audit:read"
  ],
  OPERATIONS: [
    "shipment:read", "shipment:write", "shipment:transition", "shipment:assign",
    "merchant:read", "zone:read", "courier:read", "assignment:read", "assignment:write",
    "cod:read", "settlement:read"
  ],
  DISPATCHER: [
    "shipment:read", "shipment:transition", "shipment:assign",
    "merchant:read", "zone:read", "courier:read", "assignment:read", "assignment:write"
  ],
  DEPOT_AGENT: ["shipment:read", "shipment:transition", "zone:read"],
  COURIER: ["shipment:read", "shipment:transition", "cod:write", "cod:read"],
  MERCHANT: ["shipment:read", "settlement:read"],
  ACCOUNTANT: [
    "shipment:read", "merchant:read", "cod:read", "cod:reverse",
    "settlement:read", "settlement:write", "settlement:approve", "settlement:pay"
  ],
  SUPPORT: ["shipment:read", "merchant:read", "zone:read", "courier:read"]
};

export function permissionsFor(role: Role): Permission[] {
  return PERMISSIONS[role] ?? [];
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return permissionsFor(role).includes(permission);
}
