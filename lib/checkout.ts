// Payment methods staff can record at checkout (Booking.checkoutMethod).
export const CHECKOUT_METHODS = ["CASH", "CARD", "HICAPS", "VOUCHER", "OTHER"] as const;
export type CheckoutMethod = (typeof CHECKOUT_METHODS)[number];

export const CHECKOUT_LABEL: Record<CheckoutMethod, string> = {
  CASH: "Cash",
  CARD: "Card",
  HICAPS: "HICAPS",
  VOUCHER: "Voucher",
  OTHER: "Other",
};
