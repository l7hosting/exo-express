export const brandTheme = {
  colors: {
    orange: "#F36A0A",
    orange600: "#D85C05",
    navy: "#071A42",
    background: "#FFFFFF",
    backgroundSecondary: "#F4F6F8",
    text: "#071A42",
    muted: "#748494",
    line: "#e5ebef"
  }
} as const;

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

export type UserRole = (typeof ROLES)[number];

export const SHIPMENT_STATUSES = [
  "CREATED",
  "PICKUP_ASSIGNED",
  "PICKED_UP",
  "AT_DEPOT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "DELIVERY_FAILED",
  "RETURN_REQUESTED",
  "RETURNING",
  "RETURNED",
  "CANCELLED"
] as const;

export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export interface ShipmentListItem {
  id: string;
  trackingNumber: string;
  recipientName: string;
  recipientPhone: string;
  address: string;
  city: string;
  status: ShipmentStatus;
  codAmount: number | string;
  deliveryFee: number | string;
  returnFee: number | string;
  courierId: string | null;
  merchantId: string;
  zoneId: string;
  createdAt: string;
  merchant?: { id: string; businessName: string } | null;
  zone?: { id: string; name: string; city?: string } | null;
  courier?: { id: string; fullName: string; phone: string | null } | null;
}

export interface ShipmentEventItem {
  id: string;
  fromStatus: ShipmentStatus | null;
  toStatus: ShipmentStatus;
  note: string | null;
  createdAt: string;
  actor?: { id: string; fullName: string } | null;
}

export interface ShipmentDetail extends ShipmentListItem {
  events: ShipmentEventItem[];
}

export interface ShipmentListResponse {
  items: ShipmentListItem[];
  page: number;
  pageSize: number;
  total: number;
}

export interface MerchantListItem {
  id: string;
  businessName: string;
  contactName: string;
  phone: string;
  email: string | null;
  isActive: boolean;
  createdAt: string;
  _count?: { shipments: number };
}

export interface MerchantListResponse {
  items: MerchantListItem[];
  total: number;
}

export interface ZoneTariffItem {
  id: string;
  label: string;
  price: number | string;
  returnFee: number | string;
  isDefault: boolean;
  validFrom: string;
  validTo: string | null;
}

export interface ZoneListItem {
  id: string;
  name: string;
  city: string;
  deliveryFee: number | string;
  returnFee: number | string;
  isActive: boolean;
  tariffs?: ZoneTariffItem[];
}

export interface ZoneListResponse {
  items: ZoneListItem[];
  total: number;
}

export interface ZoneOption {
  id: string;
  name: string;
  city: string;
}

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
}

export interface LoginResponse {
  token: string;
  expiresAt: string;
  user: SessionUser;
}

export interface ApiErrorPayload {
  error: string;
  message: string;
  details?: unknown;
}

/* ------------------------------------------------------------------ */
/* Phase 2 — couriers, assignments, COD and settlements                */
/* ------------------------------------------------------------------ */

export const DELIVERY_OUTCOMES = [
  "DELIVERED",
  "RECIPIENT_UNAVAILABLE",
  "REFUSED",
  "INCORRECT_ADDRESS",
  "RESCHEDULED",
  "RETURNED"
] as const;

export type DeliveryOutcome = (typeof DELIVERY_OUTCOMES)[number];

export const ASSIGNMENT_STATUSES = ["ACTIVE", "REASSIGNED", "UNASSIGNED"] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const COD_STATUSES = ["COLLECTED", "REVERSED"] as const;
export type CodStatus = (typeof COD_STATUSES)[number];

export const COD_PAYMENT_METHODS = ["CASH", "CARD", "MOBILE_PAYMENT", "BANK_TRANSFER"] as const;
export type CodPaymentMethod = (typeof COD_PAYMENT_METHODS)[number];

export const SETTLEMENT_STATUSES = ["PENDING", "APPROVED", "PAID", "CANCELLED"] as const;
export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number];

export interface CourierListItem {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
  activeShipments: number;
  collectedCodEntries: number;
}

export interface CourierListResponse {
  items: CourierListItem[];
  total: number;
}

export interface AssignmentListItem {
  id: string;
  shipmentId: string;
  courierId: string;
  status: AssignmentStatus;
  note: string | null;
  assignedAt: string;
  endedAt: string | null;
  courier?: { id: string; fullName: string; phone: string | null } | null;
  assignedBy?: { id: string; fullName: string; role: string } | null;
  shipment?: {
    id: string;
    trackingNumber: string;
    recipientName: string;
    city: string;
    status: ShipmentStatus;
    zoneId: string;
    createdAt: string;
  } | null;
}

export interface AssignmentListResponse {
  items: AssignmentListItem[];
  page: number;
  pageSize: number;
  total: number;
}

export interface EligibleShipmentItem {
  id: string;
  trackingNumber: string;
  recipientName: string;
  city: string;
  status: ShipmentStatus;
  codAmount: number | string;
  deliveryFee: number | string;
  createdAt: string;
  zone?: { id: string; name: string } | null;
  merchant?: { id: string; businessName: string } | null;
}

export interface EligibleShipmentResponse {
  items: EligibleShipmentItem[];
  total: number;
  maxPerCourier: number;
}

export interface CodCollectionItem {
  id: string;
  shipmentId: string;
  courierId: string;
  amount: number | string;
  paymentMethod: CodPaymentMethod;
  reference: string;
  status: CodStatus;
  collectedAt: string;
  reversedAt: string | null;
  reversalNote: string | null;
  courier?: { id: string; fullName: string } | null;
  shipment?: {
    id: string;
    trackingNumber: string;
    recipientName: string;
    codAmount: number | string;
    status: ShipmentStatus;
    merchant?: { id: string; businessName: string } | null;
  } | null;
}

export interface CodListResponse {
  items: CodCollectionItem[];
  page: number;
  pageSize: number;
  total: number;
  collectedTotal: string;
}

export interface CodTransactionItem {
  id: string;
  type: "COLLECTION" | "REVERSAL" | "CORRECTION";
  amount: number | string;
  note: string | null;
  createdAt: string;
  actor?: { id: string; fullName: string; role: string } | null;
}

/** History of a single COD collection: the collection and its transactions. */
export interface CodTransactionHistory {
  collection: CodCollectionItem;
  transactions: CodTransactionItem[];
}

export interface CodReconciliation {
  deliveredShipments: number;
  expectedCodTotal: string;
  collectedTotal: string;
  reversedTotal: string;
  collections: number;
  reversals: number;
  outstandingTotal: string;
  uncollectedDelivered: {
    id: string;
    trackingNumber: string;
    recipientName?: string;
    codAmount: string;
    merchant?: string;
    collectionStatus: string | null;
  }[];
}

export interface MerchantBalance {
  merchantId: string;
  businessName: string;
  isActive?: boolean;
  collected: string;
  outstanding: string;
  pendingSettlement?: string;
}

export interface SettlementListItem {
  id: string;
  reference: string;
  merchantId: string;
  status: SettlementStatus;
  grossCod: number | string;
  deliveryFees: number | string;
  returnFees: number | string;
  adjustments: number | string;
  netPayable: number | string;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
  approvedAt: string | null;
  paidAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  merchant?: { id: string; businessName: string } | null;
  createdBy?: { id: string; fullName: string } | null;
  approvedBy?: { id: string; fullName: string } | null;
  paidBy?: { id: string; fullName: string } | null;
  _count?: { items: number };
}

export interface SettlementListResponse {
  items: SettlementListItem[];
  page: number;
  pageSize: number;
  total: number;
}

export interface SettleableShipmentItem {
  id: string;
  trackingNumber: string;
  recipientName: string;
  codAmount: string;
  deliveryFee: string;
  returnFee: string;
  collectedAt: string | null;
  reference: string | null;
}

export interface SettleableShipmentResponse {
  items: SettleableShipmentItem[];
  total: number;
  preview: {
    grossCod: string;
    deliveryFees: string;
    returnFees: string;
    netPayable: string;
  };
}

export interface DashboardKpis {
  generatedAt: string;
  shipments: {
    total: number;
    awaitingAssignment: number;
    inDelivery: number;
    delivered: number;
    returned: number;
    deliveryFailed: number;
  };
  couriers: { active: number };
  cod: {
    expectedTotal: string;
    collectedTotal: string;
    reversedTotal: string;
    awaitingReconciliationTotal: string;
    uncollectedShipments: number;
  };
  settlements: {
    pending: number;
    pendingNetPayable: string;
  };
}

/**
 * Settlement formula — single source of truth.
 *
 *   netPayable = grossCod - deliveryFees - returnFees + adjustments
 *
 * - `grossCod`     : sum of the COD actually collected on the settled shipments.
 * - `deliveryFees` : sum of the delivery fee snapshotted on each shipment.
 * - `returnFees`   : sum of the return fees charged on the settled shipments.
 * - `adjustments`  : manual correction entered when the settlement is created.
 *
 * The API implements it in `apps/api/src/lib/settlements.ts` and applies it identically to the
 * settlement preview and to the stored settlement, so the preview always equals the result.
 */
export const SETTLEMENT_FORMULA = "netPayable = grossCod - deliveryFees - returnFees + adjustments" as const;

/** Valid settlement state transitions. */
export const SETTLEMENT_TRANSITIONS: Record<SettlementStatus, SettlementStatus[]> = {
  PENDING: ["APPROVED", "CANCELLED"],
  APPROVED: ["PAID", "CANCELLED"],
  PAID: [],
  CANCELLED: []
};
