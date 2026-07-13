import { createHash, randomBytes } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Memo,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { applyCors, handleCorsPreflight } from "../lib/cors.js";
import { readJsonBody } from "../lib/http.js";
import {
  createPaymentLink,
  getPaymentLink,
  updatePaymentLink,
  type PaymentLinkNetwork,
  type PaymentLinkRecord,
} from "../lib/repositories/payment-links.js";
import { buildSep7PayUri } from "../lib/stellar/sep7.js";

const TESTNET_USDC_ISSUER =
  "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
const MAINNET_USDC_ISSUER =
  "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNetwork(value: unknown): PaymentLinkNetwork | null {
  return value === "mainnet" || value === "testnet" ? value : null;
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

function networkPassphrase(network: PaymentLinkNetwork): string {
  return network === "mainnet" ? Networks.PUBLIC : Networks.TESTNET;
}

function horizonServer(network: PaymentLinkNetwork) {
  const configured = process.env.STELLAR_HORIZON_URL?.trim();
  const url =
    network === "mainnet" && configured
      ? configured
      : network === "mainnet"
        ? "https://horizon.stellar.org"
        : "https://horizon-testnet.stellar.org";
  return new Horizon.Server(url);
}

function knownIssuer(network: PaymentLinkNetwork, assetCode: string): string | undefined {
  if (assetCode !== "USDC") return undefined;
  return network === "mainnet" ? MAINNET_USDC_ISSUER : TESTNET_USDC_ISSUER;
}

function sep7OriginDomain(): string {
  const explicit = process.env.SEP7_ORIGIN_DOMAIN?.trim();
  if (explicit) return explicit.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  const webOrigin = process.env.WEB_ORIGIN?.trim();
  if (!webOrigin) return "";
  try {
    return new URL(webOrigin).hostname;
  } catch {
    return "";
  }
}

function sep7SigningSecret(): string {
  return (
    process.env.SEP7_URI_SIGNING_SECRET?.trim() ||
    process.env.SEP10_CLIENT_DOMAIN_SIGNING_SECRET?.trim() ||
    ""
  );
}

function sep7CallbackUrl(slug: string): string {
  const base =
    process.env.SEP7_CALLBACK_BASE_URL?.trim() ||
    process.env.SEP24_CALLBACK_BASE_URL?.trim() ||
    "";
  if (!base) return "";
  const url = new URL(`${base.replace(/\/+$/, "")}/api/payment-links`);
  url.searchParams.set("action", "sep7-callback");
  url.searchParams.set("slug", slug);
  return url.toString();
}

function resolveAsset(input: {
  network: PaymentLinkNetwork;
  assetCode: string;
  assetIssuer?: string;
}): { asset: Asset; assetIssuer?: string } {
  if (input.assetCode === "XLM") return { asset: Asset.native() };
  const assetIssuer = input.assetIssuer || knownIssuer(input.network, input.assetCode);
  if (!assetIssuer || !isPublicKey(assetIssuer)) {
    throw new Error(`A valid issuer is required for ${input.assetCode}.`);
  }
  return { asset: new Asset(input.assetCode, assetIssuer), assetIssuer };
}

function hasAssetTrustline(
  account: Horizon.AccountResponse,
  assetCode: string,
  assetIssuer: string
): boolean {
  return account.balances.some((balance) => {
    if (balance.asset_type === "native") return false;
    return (
      "asset_code" in balance &&
      "asset_issuer" in balance &&
      balance.asset_code === assetCode &&
      balance.asset_issuer === assetIssuer
    );
  });
}

function publicLink(link: PaymentLinkRecord) {
  const { manageTokenHash: _manageTokenHash, ...safe } = link;
  const baseUrl =
    process.env.PAYMENT_LINK_BASE_URL?.trim() ||
    process.env.WEB_ORIGIN?.trim() ||
    "http://localhost:3000";
  const sep7 = buildSep7PayUri({
    destination: link.recipientAccount,
    amount: normalizePaymentAmount(link.amount) ?? link.amount,
    assetCode: link.assetCode,
    assetIssuer: link.assetIssuer,
    memo: `POP:${link.slug}`.slice(0, 28),
    message: link.description || `Pay ${link.amount} ${link.assetCode} with POP`,
    network: link.network,
    callbackUrl: sep7CallbackUrl(link.slug) || undefined,
    originDomain: sep7OriginDomain() || undefined,
    signingSecret: sep7SigningSecret() || undefined,
  });
  return {
    ...safe,
    paymentUrl: `${baseUrl.replace(/\/+$/, "")}/pay/${link.slug}`,
    explorerUrl: link.stellarTxHash
      ? link.network === "mainnet"
        ? `https://stellar.expert/explorer/public/tx/${link.stellarTxHash}`
        : `https://stellar.expert/explorer/testnet/tx/${link.stellarTxHash}`
      : undefined,
    sep7Uri: sep7.uri,
    sep7Signed: sep7.signed,
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

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function memoForSlug(slug: string) {
  return Memo.text(`POP:${slug}`.slice(0, 28));
}

async function handleCreate(body: Record<string, unknown>, res: VercelResponse) {
  const network = asNetwork(body.network);
  const recipientAccount = asString(body.recipientAccount);
  const assetCode = asString(body.assetCode).toUpperCase();
  const amount = normalizePaymentAmount(body.amount);
  const recipientLabel = asString(body.recipientLabel).slice(0, 80);
  const description = asString(body.description).slice(0, 240);
  const expiresInHours = Number(body.expiresInHours ?? 72);

  if (!network) return res.status(400).json({ error: "network must be mainnet or testnet" });
  if (!isPublicKey(recipientAccount)) {
    return res.status(400).json({ error: "recipientAccount is not a valid Stellar account" });
  }
  if (!/^[A-Z0-9]{1,12}$/.test(assetCode)) {
    return res.status(400).json({ error: "assetCode is invalid" });
  }
  if (!amount) return res.status(400).json({ error: "amount is invalid" });
  if (!Number.isFinite(expiresInHours) || expiresInHours < 1 || expiresInHours > 2160) {
    return res.status(400).json({ error: "expiresInHours must be between 1 and 2160" });
  }

  const resolved = resolveAsset({
    network,
    assetCode,
    assetIssuer: asString(body.assetIssuer) || undefined,
  });
  const recipient = await horizonServer(network).loadAccount(recipientAccount);
  if (
    resolved.assetIssuer &&
    !hasAssetTrustline(recipient, assetCode, resolved.assetIssuer)
  ) {
    return res.status(400).json({
      error: `${recipientAccount} needs a ${assetCode} trustline before it can receive this payment.`,
    });
  }
  const slug = randomBytes(9).toString("base64url").toLowerCase();
  const manageToken = randomBytes(24).toString("base64url");
  const created = await createPaymentLink({
    slug,
    network,
    recipientAccount,
    recipientLabel: recipientLabel || undefined,
    assetCode,
    assetIssuer: resolved.assetIssuer,
    amount,
    description: description || undefined,
    expiresAt: new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString(),
    manageTokenHash: hashToken(manageToken),
  });

  return res.status(201).json({ paymentLink: publicLink(created), manageToken });
}

async function handlePrepare(body: Record<string, unknown>, res: VercelResponse) {
  const slug = asString(body.slug).toLowerCase();
  const payerAccount = asString(body.payerAccount);
  if (!slug || !isPublicKey(payerAccount)) {
    return res.status(400).json({ error: "slug and a valid payerAccount are required" });
  }

  const found = await getPaymentLink(slug);
  if (!found) return res.status(404).json({ error: "Payment link not found" });
  const link = await expireIfNeeded(found);
  if (link.status !== "pending") {
    return res.status(409).json({ error: `Payment link is ${link.status}`, paymentLink: publicLink(link) });
  }
  if (payerAccount === link.recipientAccount) {
    return res.status(400).json({ error: "Payer and recipient accounts must be different" });
  }

  const server = horizonServer(link.network);
  const [source, recipient] = await Promise.all([
    server.loadAccount(payerAccount),
    server.loadAccount(link.recipientAccount),
  ]);
  const { asset } = resolveAsset({
    network: link.network,
    assetCode: link.assetCode,
    assetIssuer: link.assetIssuer,
  });
  if (
    link.assetIssuer &&
    !hasAssetTrustline(recipient, link.assetCode, link.assetIssuer)
  ) {
    return res.status(409).json({
      error: `Recipient no longer has the required ${link.assetCode} trustline.`,
    });
  }
  const fee = await server.fetchBaseFee().catch(() => Number(BASE_FEE));
  const transaction = new TransactionBuilder(source, {
    fee: String(fee),
    networkPassphrase: networkPassphrase(link.network),
  })
    .addMemo(memoForSlug(link.slug))
    .addOperation(
      Operation.payment({
        destination: link.recipientAccount,
        asset,
        amount: normalizePaymentAmount(link.amount)!,
      })
    )
    .setTimeout(300)
    .build();

  return res.status(200).json({
    paymentLink: publicLink(link),
    prepared: {
      transactionXdr: transaction.toXDR(),
      network: link.network,
      networkPassphrase: networkPassphrase(link.network),
      payerAccount,
    },
  });
}

function validateSignedPayment(link: PaymentLinkRecord, signedXdr: string) {
  const transaction = TransactionBuilder.fromXDR(
    signedXdr,
    networkPassphrase(link.network)
  );
  if (!("source" in transaction)) {
    throw new Error("Fee-bump transactions are not accepted for payment links.");
  }
  if (!("operations" in transaction) || transaction.operations.length !== 1) {
    throw new Error("Signed transaction must contain exactly one payment operation.");
  }
  const operation = transaction.operations[0];
  let destination: string;
  let amount: string;
  let asset: Asset;
  if (operation.type === "payment") {
    destination = operation.destination;
    amount = operation.amount;
    asset = operation.asset;
  } else if (operation.type === "pathPaymentStrictReceive") {
    destination = operation.destination;
    amount = operation.destAmount;
    asset = operation.destAsset;
  } else {
    throw new Error(
      "Signed transaction must be a payment or an exact-output path payment."
    );
  }
  if (destination !== link.recipientAccount) {
    throw new Error("Signed transaction destination does not match this payment link.");
  }
  if (
    normalizePaymentAmount(amount) !==
    normalizePaymentAmount(link.amount)
  ) {
    throw new Error("Signed transaction amount does not match this payment link.");
  }
  if (link.assetCode === "XLM") {
    if (!asset.isNative()) throw new Error("Signed transaction asset does not match XLM.");
  } else if (
    asset.code !== link.assetCode ||
    asset.issuer !== link.assetIssuer
  ) {
    throw new Error("Signed transaction asset does not match this payment link.");
  }
  return transaction;
}

async function handleSubmit(body: Record<string, unknown>, res: VercelResponse) {
  const slug = asString(body.slug).toLowerCase();
  const signedXdr = asString(body.signedXdr);
  if (!slug || !signedXdr) return res.status(400).json({ error: "slug and signedXdr are required" });

  const found = await getPaymentLink(slug);
  if (!found) return res.status(404).json({ error: "Payment link not found" });
  const link = await expireIfNeeded(found);
  if (link.status === "paid") return res.status(200).json({ paymentLink: publicLink(link) });
  if (link.status !== "pending") return res.status(409).json({ error: `Payment link is ${link.status}` });

  const transaction = validateSignedPayment(link, signedXdr);
  const submitted = await horizonServer(link.network).submitTransaction(transaction);
  if (!submitted.successful) throw new Error("Horizon did not mark the transaction successful.");

  const paid = await updatePaymentLink(link.slug, {
    status: "paid",
    paidAt: new Date().toISOString(),
    payerAccount: transaction.source,
    stellarTxHash: submitted.hash,
    failureReason: null,
  });
  return res.status(200).json({ paymentLink: publicLink(paid) });
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

function readSep7CallbackXdr(req: VercelRequest): string {
  if (typeof req.body === "string") {
    return new URLSearchParams(req.body).get("xdr")?.trim() ?? "";
  }
  if (req.body && typeof req.body === "object") {
    return asString((req.body as Record<string, unknown>).xdr);
  }
  return "";
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
      return res.status(200).json({ paymentLink: publicLink(await expireIfNeeded(found)) });
    }

    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    if (asString(req.query.action) === "sep7-callback") {
      const slug = asString(req.query.slug).toLowerCase();
      const signedXdr = readSep7CallbackXdr(req);
      if (!slug || !signedXdr) {
        return res.status(400).json({ error: "SEP-7 callback requires slug and xdr" });
      }
      return await handleSubmit({ slug, signedXdr }, res);
    }
    const parsed = readJsonBody(req);
    if (!parsed.ok) return res.status(400).json({ error: "Invalid JSON body" });
    const action = asString(parsed.value.action) || "create";
    if (action === "create") return await handleCreate(parsed.value, res);
    if (action === "prepare") return await handlePrepare(parsed.value, res);
    if (action === "submit") return await handleSubmit(parsed.value, res);
    if (action === "cancel") return await handleCancel(parsed.value, res);
    return res.status(400).json({ error: "Unknown payment link action" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected payment link error";
    const horizonStatus =
      typeof error === "object" && error && "response" in error
        ? Number((error as { response?: { status?: number } }).response?.status)
        : 0;
    return res.status(horizonStatus >= 400 && horizonStatus < 500 ? 400 : 502).json({ error: message });
  }
}
