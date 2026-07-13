import { createHash, randomBytes } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Keypair } from "@stellar/stellar-sdk";
import { applyCors, handleCorsPreflight } from "../lib/cors.js";
import { readJsonBody } from "../lib/http.js";
import {
  createPaymentLink,
  getPaymentLink,
  updatePaymentLink,
  type PaymentLinkNetwork,
  type PaymentLinkRecord,
} from "../lib/repositories/payment-links.js";
import { compareRoutesWithAnchors } from "../lib/remittances/compare/service.js";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizePaymentLinkNetwork(value: unknown): PaymentLinkNetwork | null {
  return value === "testnet" ? value : null;
}

function isPublicKey(value: string): boolean {
  try {
    Keypair.fromPublicKey(value);
    return true;
  } catch {
    return false;
  }
}

export function normalizePaymentAmount(value: unknown): string | null {
  const raw = typeof value === "number" ? String(value) : asString(value);
  if (!/^\d+(?:\.\d{1,7})?$/.test(raw)) return null;
  const numeric = Number(raw);
  if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 1_000_000_000) {
    return null;
  }
  const [wholeRaw, fractionRaw = ""] = raw.split(".");
  const whole = wholeRaw.replace(/^0+(?=\d)/, "");
  const fraction = fractionRaw.replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

function publicLink(link: PaymentLinkRecord) {
  const {
    manageTokenHash: _manageTokenHash,
    anchorStatusRef: _anchorStatusRef,
    ...safe
  } = link;
  const baseUrl =
    process.env.PAYMENT_LINK_BASE_URL?.trim() ||
    process.env.WEB_ORIGIN?.trim() ||
    "http://localhost:3000";
  return {
    ...safe,
    paymentUrl: `${baseUrl.replace(/\/+$/, "")}/pay/${link.slug}`,
    explorerUrl: link.stellarTxHash
      ? link.network === "mainnet"
        ? `https://stellar.expert/explorer/public/tx/${link.stellarTxHash}`
        : `https://stellar.expert/explorer/testnet/tx/${link.stellarTxHash}`
      : undefined,
  };
}

async function expireIfNeeded(link: PaymentLinkRecord): Promise<PaymentLinkRecord> {
  if (
    link.status === "pending" &&
    link.expiresAt &&
    new Date(link.expiresAt).getTime() <= Date.now()
  ) {
    return updatePaymentLink(link.slug, { status: "expired" });
  }
  return link;
}

async function refreshProcessingLink(link: PaymentLinkRecord): Promise<PaymentLinkRecord> {
  if (
    link.status !== "processing" ||
    !link.anchorTransactionId ||
    !link.anchorStatusRef
  ) {
    return link;
  }

  const apiBaseUrl =
    process.env.SEP24_CALLBACK_BASE_URL?.trim() ||
    process.env.API_BASE_URL?.trim() ||
    "http://localhost:3001";

  try {
    await fetch(`${apiBaseUrl.replace(/\/+$/, "")}/api/execute-transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phase: "status",
        transactionId: link.anchorTransactionId,
        statusRef: link.anchorStatusRef,
      }),
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    // The public link remains readable while an anchor or status endpoint is unavailable.
  }

  return (await getPaymentLink(link.slug)) ?? link;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function handleCreate(body: Record<string, unknown>, res: VercelResponse) {
  const network = normalizePaymentLinkNetwork(body.network);
  const recipientAccount = asString(body.recipientAccount);
  const recipientLabel = asString(body.recipientLabel).slice(0, 80);
  const originCountry = asString(body.originCountry).toUpperCase();
  const originAnchorId = asString(body.originAnchorId);
  const destinationCountry = asString(body.destinationCountry).toUpperCase();
  const destinationAnchorId = asString(body.destinationAnchorId);
  const amount = normalizePaymentAmount(body.amount);
  const description = asString(body.description).slice(0, 240);
  const expiresInHours = Number(body.expiresInHours ?? 72);

  if (!network) return res.status(400).json({ error: "network must be testnet" });
  if (!isPublicKey(recipientAccount)) {
    return res.status(400).json({ error: "recipientAccount is not a valid Stellar account" });
  }
  if (!/^[A-Z]{2}$/.test(originCountry) || !/^[A-Z]{2}$/.test(destinationCountry)) {
    return res.status(400).json({
      error: "originCountry and destinationCountry must be ISO country codes",
    });
  }
  if (!originAnchorId) {
    return res.status(400).json({ error: "originAnchorId is required" });
  }
  if (!destinationAnchorId) {
    return res.status(400).json({ error: "destinationAnchorId is required" });
  }
  if (!amount) return res.status(400).json({ error: "amount is invalid" });
  if (!Number.isFinite(expiresInHours) || expiresInHours < 1 || expiresInHours > 2160) {
    return res.status(400).json({ error: "expiresInHours must be between 1 and 2160" });
  }

  const comparison = await compareRoutesWithAnchors({
    origin: originCountry,
    destination: destinationCountry,
    amount: Number(amount),
    network,
  });
  const selectedRoute = comparison.routes.find(
    (route) =>
      route.available &&
      route.originAnchor.id === originAnchorId &&
      route.destinationAnchor.id === destinationAnchorId
  );
  if (!selectedRoute) {
    return res.status(400).json({
      error: "Selected anchor route is no longer operational for this corridor and amount.",
    });
  }

  const slug = randomBytes(9).toString("base64url").toLowerCase();
  const manageToken = randomBytes(24).toString("base64url");
  const quotedAt = new Date().toISOString();
  const created = await createPaymentLink({
    slug,
    network,
    recipientAccount,
    recipientLabel: recipientLabel || undefined,
    originCountry,
    originAnchorId: selectedRoute.originAnchor.id,
    originAnchorName: selectedRoute.originAnchor.name,
    destinationCountry,
    destinationAnchorId: selectedRoute.destinationAnchor.id,
    destinationAnchorName: selectedRoute.destinationAnchor.name,
    assetCode: selectedRoute.destinationCurrency,
    amount,
    description: description || undefined,
    expiresAt: new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString(),
    routeSnapshot: selectedRoute,
    quotedAt,
    manageTokenHash: hashToken(manageToken),
  });

  return res.status(201).json({ paymentLink: publicLink(created), manageToken });
}

async function handleCancel(body: Record<string, unknown>, res: VercelResponse) {
  const slug = asString(body.slug).toLowerCase();
  const manageToken = asString(body.manageToken);
  const link = slug ? await getPaymentLink(slug) : null;
  if (!link) return res.status(404).json({ error: "Payment link not found" });
  if (!manageToken || hashToken(manageToken) !== link.manageTokenHash) {
    return res.status(403).json({ error: "Invalid management token" });
  }
  if (link.status !== "pending") {
    return res.status(409).json({ error: `Payment link is ${link.status}` });
  }
  const cancelled = await updatePaymentLink(slug, { status: "cancelled" });
  return res.status(200).json({ paymentLink: publicLink(cancelled) });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const methods = ["GET", "POST", "OPTIONS"];
  if (handleCorsPreflight(req, res, methods)) return;
  applyCors(req, res, methods);

  try {
    if (req.method === "GET") {
      const slug = asString(req.query.slug).toLowerCase();
      if (!slug) return res.status(400).json({ error: "slug is required" });
      const found = await getPaymentLink(slug);
      if (!found) return res.status(404).json({ error: "Payment link not found" });
      const current = await expireIfNeeded(found);
      const refreshed = await refreshProcessingLink(current);
      return res.status(200).json({ paymentLink: publicLink(refreshed) });
    }

    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    const parsed = readJsonBody(req);
    if (!parsed.ok) return res.status(400).json({ error: "Invalid JSON body" });
    const action = asString(parsed.value.action) || "create";
    if (action === "create") return await handleCreate(parsed.value, res);
    if (action === "cancel") return await handleCancel(parsed.value, res);
    return res.status(400).json({ error: "Unknown payment link action" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected payment link error";
    return res.status(502).json({ error: message });
  }
}
