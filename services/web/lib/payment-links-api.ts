import { apiUrl } from "./api";

export type PaymentLinkNetwork = "mainnet" | "testnet";
export type PaymentLinkStatus = "pending" | "paid" | "expired" | "cancelled" | "failed";

export interface PaymentLink {
  id: string;
  slug: string;
  network: PaymentLinkNetwork;
  recipientAccount: string;
  recipientLabel?: string;
  assetCode: string;
  assetIssuer?: string;
  amount: string;
  description?: string;
  status: PaymentLinkStatus;
  expiresAt?: string;
  paidAt?: string;
  payerAccount?: string;
  stellarTxHash?: string;
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
  paymentUrl: string;
  explorerUrl?: string;
  sep7Uri?: string;
  sep7Signed?: boolean;
}

async function readPayload<T>(response: Response, endpoint: string): Promise<T> {
  const raw = await response.text();
  try {
    return (raw ? JSON.parse(raw) : {}) as T;
  } catch {
    throw new Error(`API ${endpoint} returned an invalid response.`);
  }
}

async function request<T>(body: Record<string, unknown>): Promise<T> {
  const endpoint = apiUrl("/api/payment-links");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await readPayload<T & { error?: string }>(response, endpoint);
  if (!response.ok) throw new Error(payload.error || "Payment link request failed");
  return payload;
}

export async function createPaymentLink(input: {
  network: PaymentLinkNetwork;
  recipientAccount: string;
  recipientLabel?: string;
  assetCode: "XLM" | "USDC";
  amount: string;
  description?: string;
  expiresInHours: number;
}) {
  return request<{ paymentLink: PaymentLink; manageToken: string }>({
    action: "create",
    ...input,
  });
}

export async function fetchPaymentLink(slug: string): Promise<PaymentLink> {
  const endpoint = apiUrl(`/api/payment-links?slug=${encodeURIComponent(slug)}`);
  const response = await fetch(endpoint, { cache: "no-store" });
  const payload = await readPayload<{ paymentLink?: PaymentLink; error?: string }>(
    response,
    endpoint
  );
  if (!response.ok || !payload.paymentLink) {
    throw new Error(payload.error || "Payment link not found");
  }
  return payload.paymentLink;
}

export async function preparePaymentLink(input: {
  slug: string;
  payerAccount: string;
}) {
  return request<{
    paymentLink: PaymentLink;
    prepared: {
      transactionXdr: string;
      network: PaymentLinkNetwork;
      networkPassphrase: string;
      payerAccount: string;
    };
  }>({ action: "prepare", ...input });
}

export async function submitPaymentLink(input: { slug: string; signedXdr: string }) {
  return request<{ paymentLink: PaymentLink }>({ action: "submit", ...input });
}

export async function cancelPaymentLink(input: { slug: string; manageToken: string }) {
  return request<{ paymentLink: PaymentLink }>({ action: "cancel", ...input });
}
