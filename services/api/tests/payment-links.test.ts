import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizePaymentAmount,
  normalizePaymentLinkNetwork,
} from "../api/payment-links.js";

test("accepts testnet as the only network for new payment links", () => {
  assert.equal(normalizePaymentLinkNetwork("testnet"), "testnet");
  assert.equal(normalizePaymentLinkNetwork("mainnet"), null);
  assert.equal(normalizePaymentLinkNetwork(undefined), null);
});

test("normalizes Stellar amounts without changing integer value", () => {
  assert.equal(normalizePaymentAmount("50"), "50");
  assert.equal(normalizePaymentAmount("500"), "500");
  assert.equal(normalizePaymentAmount("050.0000000"), "50");
  assert.equal(normalizePaymentAmount("49.9000000"), "49.9");
  assert.equal(normalizePaymentAmount("0.0000001"), "0.0000001");
});

test("rejects invalid Stellar amounts", () => {
  assert.equal(normalizePaymentAmount("0"), null);
  assert.equal(normalizePaymentAmount("-1"), null);
  assert.equal(normalizePaymentAmount("1.00000001"), null);
  assert.equal(normalizePaymentAmount("not-a-number"), null);
});
