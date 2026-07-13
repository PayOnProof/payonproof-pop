import assert from "node:assert/strict";
import test from "node:test";
import { normalizePaymentAmount } from "../api/payment-links.js";
import { signSep7Uri } from "../lib/stellar/sep7.js";

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

test("signs SEP-7 requests using the canonical payload", () => {
  const uri =
    "web+stellar:pay?destination=GCALNQQBXAPZ2WIRSDDBMSTAKCUH5SG6U76YBFLQLIXJTF7FE5AX7AOO&amount=120.1234567&memo=skdjfasf&memo_type=MEMO_TEXT&msg=pay%20me%20with%20lumens&origin_domain=someDomain.com";
  const signed = signSep7Uri(
    uri,
    "SBPOVRVKTTV7W3IOX2FJPSMPCJ5L2WU2YKTP3HCLYPXNI5MDIGREVNYC"
  );
  assert.equal(
    new URLSearchParams(signed.split("?")[1]).get("signature"),
    "tbsLtlK/fouvRWk2UWFP47yHYeI1g1NEC/fEQvuXG6V8P+beLxplYbOVtTk1g94Wp97cHZ3pVJy/tZNYobl3Cw=="
  );
});
