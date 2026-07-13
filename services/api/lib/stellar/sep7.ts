import { Keypair, Networks } from "@stellar/stellar-sdk";

const SEP7_SCHEME = "web+stellar:pay";
const SEP7_SIGNATURE_PREFIX = Buffer.concat([
  Buffer.alloc(35),
  Buffer.from([4]),
  Buffer.from("stellar.sep.7 - URI Scheme", "utf8"),
]);

function encodeParam(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

export function signSep7Uri(unsignedUri: string, secretKey: string): string {
  const keypair = Keypair.fromSecret(secretKey.trim());
  const payload = Buffer.concat([
    SEP7_SIGNATURE_PREFIX,
    Buffer.from(unsignedUri, "utf8"),
  ]);
  const signature = keypair.sign(payload).toString("base64");
  return `${unsignedUri}&signature=${encodeParam(signature)}`;
}

export function buildSep7PayUri(input: {
  destination: string;
  amount: string;
  assetCode: string;
  assetIssuer?: string;
  memo: string;
  message?: string;
  network: "mainnet" | "testnet";
  callbackUrl?: string;
  originDomain?: string;
  signingSecret?: string;
}): { uri: string; signed: boolean } {
  const params: Array<[string, string]> = [
    ["destination", input.destination],
    ["amount", input.amount],
  ];

  if (input.assetCode !== "XLM") {
    params.push(["asset_code", input.assetCode]);
    if (input.assetIssuer) params.push(["asset_issuer", input.assetIssuer]);
  }

  params.push(["memo", input.memo], ["memo_type", "MEMO_TEXT"]);
  if (input.callbackUrl) params.push(["callback", `url:${input.callbackUrl}`]);
  if (input.message) params.push(["msg", input.message.slice(0, 300)]);
  if (input.network === "testnet") {
    params.push(["network_passphrase", Networks.TESTNET]);
  }

  const canSign = Boolean(input.originDomain && input.signingSecret);
  if (canSign) params.push(["origin_domain", input.originDomain!]);

  const unsignedUri = `${SEP7_SCHEME}?${params
    .map(([key, value]) => `${key}=${encodeParam(value)}`)
    .join("&")}`;

  if (!canSign) return { uri: unsignedUri, signed: false };
  return {
    uri: signSep7Uri(unsignedUri, input.signingSecret!),
    signed: true,
  };
}

