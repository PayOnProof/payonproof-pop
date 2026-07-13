import { getSupabaseAdmin } from "../supabase.js";

export type PaymentLinkNetwork = "mainnet" | "testnet";
export type PaymentLinkStatus =
  | "pending"
  | "processing"
  | "paid"
  | "expired"
  | "cancelled"
  | "failed";

export interface PaymentLinkRecord {
  id: string;
  slug: string;
  network: PaymentLinkNetwork;
  recipientAccount: string;
  recipientLabel?: string;
  destinationCountry: string;
  destinationAnchorId: string;
  destinationAnchorName: string;
  assetCode: string;
  assetIssuer?: string;
  amount: string;
  description?: string;
  status: PaymentLinkStatus;
  expiresAt?: string;
  paidAt?: string;
  payerAccount?: string;
  stellarTxHash?: string;
  anchorTransactionId?: string;
  anchorStatusRef?: string;
  manageTokenHash: string;
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
}

interface PaymentLinkRow {
  id: string;
  slug: string;
  network: PaymentLinkNetwork;
  recipient_account: string;
  recipient_label: string | null;
  destination_country: string | null;
  destination_anchor_id: string | null;
  destination_anchor_name: string | null;
  asset_code: string;
  asset_issuer: string | null;
  amount: number | string;
  description: string | null;
  status: PaymentLinkStatus;
  expires_at: string | null;
  paid_at: string | null;
  payer_account: string | null;
  stellar_tx_hash: string | null;
  anchor_transaction_id: string | null;
  anchor_status_ref: string | null;
  manage_token_hash: string;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
}

const SELECT_FIELDS =
  "id,slug,network,recipient_account,recipient_label,destination_country,destination_anchor_id,destination_anchor_name,asset_code,asset_issuer,amount,description,status,expires_at,paid_at,payer_account,stellar_tx_hash,anchor_transaction_id,anchor_status_ref,manage_token_hash,failure_reason,created_at,updated_at";

function mapRow(row: PaymentLinkRow): PaymentLinkRecord {
  return {
    id: row.id,
    slug: row.slug,
    network: row.network,
    recipientAccount: row.recipient_account,
    recipientLabel: row.recipient_label ?? undefined,
    destinationCountry: row.destination_country ?? "",
    destinationAnchorId: row.destination_anchor_id ?? "",
    destinationAnchorName: row.destination_anchor_name ?? "",
    assetCode: row.asset_code,
    assetIssuer: row.asset_issuer ?? undefined,
    amount: String(row.amount),
    description: row.description ?? undefined,
    status: row.status,
    expiresAt: row.expires_at ?? undefined,
    paidAt: row.paid_at ?? undefined,
    payerAccount: row.payer_account ?? undefined,
    stellarTxHash: row.stellar_tx_hash ?? undefined,
    anchorTransactionId: row.anchor_transaction_id ?? undefined,
    anchorStatusRef: row.anchor_status_ref ?? undefined,
    manageTokenHash: row.manage_token_hash,
    failureReason: row.failure_reason ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function databaseError(action: string, error: { message?: string; code?: string }) {
  const missingTable = error.code === "42P01" || error.code === "PGRST205";
  const detail = missingTable
    ? " Apply services/api/sql/005_payment_links.sql to Supabase."
    : "";
  return new Error(`${action} failed: ${error.message ?? "database error"}.${detail}`);
}

export async function createPaymentLink(input: {
  slug: string;
  network: PaymentLinkNetwork;
  recipientAccount: string;
  recipientLabel?: string;
  destinationCountry: string;
  destinationAnchorId: string;
  destinationAnchorName: string;
  assetCode: string;
  assetIssuer?: string;
  amount: string;
  description?: string;
  expiresAt?: string;
  manageTokenHash: string;
}): Promise<PaymentLinkRecord> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("payment_links")
    .insert({
      slug: input.slug,
      network: input.network,
      recipient_account: input.recipientAccount,
      recipient_label: input.recipientLabel ?? null,
      destination_country: input.destinationCountry,
      destination_anchor_id: input.destinationAnchorId,
      destination_anchor_name: input.destinationAnchorName,
      asset_code: input.assetCode,
      asset_issuer: input.assetIssuer ?? null,
      amount: input.amount,
      description: input.description ?? null,
      expires_at: input.expiresAt ?? null,
      manage_token_hash: input.manageTokenHash,
    })
    .select(SELECT_FIELDS)
    .single();

  if (error || !data) throw databaseError("payment_links insert", error ?? {});
  return mapRow(data as PaymentLinkRow);
}

export async function getPaymentLink(slug: string): Promise<PaymentLinkRecord | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("payment_links")
    .select(SELECT_FIELDS)
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw databaseError("payment_links lookup", error);
  return data ? mapRow(data as PaymentLinkRow) : null;
}

export async function updatePaymentLink(
  slug: string,
  values: Partial<{
    status: PaymentLinkStatus;
    paidAt: string;
    payerAccount: string;
    stellarTxHash: string;
    anchorTransactionId: string;
    anchorStatusRef: string;
    failureReason: string | null;
  }>
): Promise<PaymentLinkRecord> {
  const supabase = getSupabaseAdmin();
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (values.status !== undefined) payload.status = values.status;
  if (values.paidAt !== undefined) payload.paid_at = values.paidAt;
  if (values.payerAccount !== undefined) payload.payer_account = values.payerAccount;
  if (values.stellarTxHash !== undefined) payload.stellar_tx_hash = values.stellarTxHash;
  if (values.anchorTransactionId !== undefined) {
    payload.anchor_transaction_id = values.anchorTransactionId;
  }
  if (values.anchorStatusRef !== undefined) payload.anchor_status_ref = values.anchorStatusRef;
  if (values.failureReason !== undefined) payload.failure_reason = values.failureReason;

  const { data, error } = await supabase
    .from("payment_links")
    .update(payload)
    .eq("slug", slug)
    .select(SELECT_FIELDS)
    .single();

  if (error || !data) throw databaseError("payment_links update", error ?? {});
  return mapRow(data as PaymentLinkRow);
}

export async function startPaymentLink(input: {
  slug: string;
  anchorTransactionId: string;
  anchorStatusRef: string;
  payerAccount: string;
}): Promise<PaymentLinkRecord> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("payment_links")
    .update({
      status: "processing",
      anchor_transaction_id: input.anchorTransactionId,
      anchor_status_ref: input.anchorStatusRef,
      payer_account: input.payerAccount,
      updated_at: new Date().toISOString(),
    })
    .eq("slug", input.slug)
    .eq("status", "pending")
    .select(SELECT_FIELDS)
    .maybeSingle();

  if (error) throw databaseError("payment_links start", error);
  if (!data) throw new Error("Payment link is no longer available.");
  return mapRow(data as PaymentLinkRow);
}
