export type ShipmentStatus =
  | "CREATED"
  | "PICKUP_ASSIGNED"
  | "PICKED_UP"
  | "AT_DEPOT"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "DELIVERY_FAILED"
  | "RETURN_REQUESTED"
  | "RETURNING"
  | "RETURNED"
  | "CANCELLED";

export type DeliveryOutcome =
  | "DELIVERED"
  | "RECIPIENT_UNAVAILABLE"
  | "REFUSED"
  | "INCORRECT_ADDRESS"
  | "RESCHEDULED"
  | "RETURNED";

export type CodPaymentMethod = "CASH" | "CARD" | "MOBILE_PAYMENT" | "BANK_TRANSFER";

export interface Mission {
  id: string;
  trackingNumber: string;
  recipientName: string;
  recipientPhone: string;
  address: string;
  city: string;
  status: ShipmentStatus;
  codAmount: string | number;
  deliveryFee: string | number;
  returnFee?: string | number;
  notes?: string | null;
  deliveryOutcome?: DeliveryOutcome | null;
  merchant?: { id: string; businessName: string } | null;
  zone?: { id: string; name: string; city?: string } | null;
  codCollection?: {
    id: string;
    status: "COLLECTED" | "REVERSED";
    amount: string | number;
    reference: string;
    collectedAt: string;
  } | null;
  proofOfDelivery?: { id: string; type: string; createdAt: string } | null;
}

export interface MissionListResponse {
  items: Mission[];
  total: number;
  totals: { codTotal: string; deliveryFeesTotal: string };
}

export interface ShipmentEvent {
  id: string;
  fromStatus: ShipmentStatus | null;
  toStatus: ShipmentStatus;
  note: string | null;
  createdAt: string;
  actor?: { id: string; fullName: string } | null;
}

export interface MissionDetail extends Mission {
  events: ShipmentEvent[];
}

export const STATUS_LABEL: Record<ShipmentStatus, string> = {
  CREATED: "À affecter",
  PICKUP_ASSIGNED: "Ramassage assigné",
  PICKED_UP: "Collecté",
  AT_DEPOT: "Au dépôt",
  OUT_FOR_DELIVERY: "En livraison",
  DELIVERED: "Livré",
  DELIVERY_FAILED: "Échec de livraison",
  RETURN_REQUESTED: "Retour demandé",
  RETURNING: "En retour",
  RETURNED: "Retourné",
  CANCELLED: "Annulé"
};

export const STATUS_STYLE: Record<ShipmentStatus, { bg: string; fg: string }> = {
  CREATED: { bg: "#EEF2F9", fg: "#475467" },
  PICKUP_ASSIGNED: { bg: "#E8EEFD", fg: "#1D4ED8" },
  PICKED_UP: { bg: "#E8EEFD", fg: "#1D4ED8" },
  AT_DEPOT: { bg: "#F0EBFB", fg: "#6941C6" },
  OUT_FOR_DELIVERY: { bg: "#FFF1E6", fg: "#D85C05" },
  DELIVERED: { bg: "#E6F4EC", fg: "#1F9254" },
  DELIVERY_FAILED: { bg: "#FEECEB", fg: "#B42318" },
  RETURN_REQUESTED: { bg: "#FFF4E5", fg: "#B54708" },
  RETURNING: { bg: "#E4F4F8", fg: "#0E7490" },
  RETURNED: { bg: "#E4F4F8", fg: "#0E7490" },
  CANCELLED: { bg: "#EEF2F9", fg: "#475467" }
};

export const OUTCOME_LABEL: Record<DeliveryOutcome, string> = {
  DELIVERED: "Livré au destinataire",
  RECIPIENT_UNAVAILABLE: "Destinataire absent",
  REFUSED: "Destinataire a refusé",
  INCORRECT_ADDRESS: "Adresse incorrecte",
  RESCHEDULED: "Livraison reprogrammée",
  RETURNED: "Retour à l'expéditeur"
};

export const PAYMENT_METHOD_LABEL: Record<CodPaymentMethod, string> = {
  CASH: "Espèces",
  CARD: "Carte bancaire",
  MOBILE_PAYMENT: "Paiement mobile",
  BANK_TRANSFER: "Virement bancaire"
};

/**
 * Status transitions the API accepts, mirrored from the server-side graph.
 * The server remains the authority: an unknown transition is rejected with 400.
 */
export const NEXT_STATUS: Partial<Record<ShipmentStatus, ShipmentStatus[]>> = {
  PICKUP_ASSIGNED: ["PICKED_UP"],
  PICKED_UP: ["AT_DEPOT", "DELIVERY_FAILED"],
  AT_DEPOT: ["OUT_FOR_DELIVERY", "DELIVERY_FAILED"],
  OUT_FOR_DELIVERY: ["DELIVERED", "DELIVERY_FAILED"],
  DELIVERY_FAILED: ["RETURN_REQUESTED", "OUT_FOR_DELIVERY"]
};

export const FAILURE_OUTCOMES: DeliveryOutcome[] = [
  "RECIPIENT_UNAVAILABLE",
  "REFUSED",
  "INCORRECT_ADDRESS",
  "RESCHEDULED"
];
