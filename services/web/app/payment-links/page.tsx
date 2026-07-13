"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Copy, ExternalLink, Link2, Loader2, Share2, Wallet } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { PopHeader } from "@/components/pop-header";
import { GradientMesh } from "@/components/gradient-mesh";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { WalletProvider, useWallet } from "@/lib/wallet-context";
import {
  createPaymentLink,
  type PaymentLink,
  type PaymentLinkNetwork,
} from "@/lib/payment-links-api";

const STORAGE_KEY = "pop_payment_link_management";

function PaymentLinksContent() {
  const { address, status, connect } = useWallet();
  const [network, setNetwork] = useState<PaymentLinkNetwork>("testnet");
  const [assetCode, setAssetCode] = useState<"XLM" | "USDC">("USDC");
  const [amount, setAmount] = useState("");
  const [recipientLabel, setRecipientLabel] = useState("");
  const [description, setDescription] = useState("");
  const [expiresInHours, setExpiresInHours] = useState("72");
  const [created, setCreated] = useState<PaymentLink | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const canCreate = useMemo(
    () => Boolean(address && Number(amount) > 0 && !loading),
    [address, amount, loading]
  );

  useEffect(() => {
    setError(null);
  }, [network, assetCode, amount]);

  async function handleCreate() {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      const result = await createPaymentLink({
        network,
        recipientAccount: address,
        recipientLabel: recipientLabel.trim() || undefined,
        assetCode,
        amount,
        description: description.trim() || undefined,
        expiresInHours: Number(expiresInHours),
      });
      localStorage.setItem(
        `${STORAGE_KEY}:${result.paymentLink.slug}`,
        result.manageToken
      );
      setCreated(result.paymentLink);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create payment link");
    } finally {
      setLoading(false);
    }
  }

  async function copyLink() {
    if (!created) return;
    await navigator.clipboard.writeText(created.paymentUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  async function shareLink() {
    if (!created) return;
    if (navigator.share) {
      await navigator.share({
        title: "POP payment request",
        text: `Pay ${created.amount} ${created.assetCode} with POP`,
        url: created.paymentUrl,
      });
      return;
    }
    await copyLink();
  }

  return (
    <div className="relative min-h-screen bg-background">
      <GradientMesh />
      <PopHeader variant="app" />
      <main className="relative z-10 mx-auto max-w-5xl px-4 pb-16 pt-24 sm:px-6">
        <div className="mb-8">
          <p className="mb-2 text-sm font-semibold text-primary">Payment requests</p>
          <h1 className="text-3xl font-bold text-foreground">Create a payment link</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Request a fixed Stellar payment. The payer signs in Freighter and POP verifies the
            final transaction on-chain.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <section className="border border-border bg-card p-5 sm:p-6">
            {status !== "connected" || !address ? (
              <div className="flex min-h-64 flex-col items-center justify-center text-center">
                <Wallet className="mb-4 h-8 w-8 text-primary" />
                <h2 className="text-lg font-semibold">Connect the receiving wallet</h2>
                <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                  The connected Stellar account becomes the recipient. POP never receives the funds.
                </p>
                <Button className="mt-5 gap-2" onClick={() => void connect("freighter")}>
                  <Wallet className="h-4 w-4" /> Connect Freighter
                </Button>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Network</Label>
                    <Select value={network} onValueChange={(value) => setNetwork(value as PaymentLinkNetwork)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="testnet">Testnet</SelectItem>
                        <SelectItem value="mainnet">Mainnet</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Asset</Label>
                    <Select value={assetCode} onValueChange={(value) => setAssetCode(value as "XLM" | "USDC")}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USDC">USDC</SelectItem>
                        <SelectItem value="XLM">XLM</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="amount">Amount</Label>
                  <Input
                    id="amount"
                    type="number"
                    inputMode="decimal"
                    min="0.0000001"
                    step="0.0000001"
                    placeholder="50"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="label">Recipient name</Label>
                  <Input
                    id="label"
                    maxLength={80}
                    placeholder="Business or person name"
                    value={recipientLabel}
                    onChange={(event) => setRecipientLabel(event.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Payment note</Label>
                  <Textarea
                    id="description"
                    maxLength={240}
                    placeholder="Invoice, order, or reason for payment"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Expires</Label>
                  <Select value={expiresInHours} onValueChange={setExpiresInHours}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="24">In 24 hours</SelectItem>
                      <SelectItem value="72">In 3 days</SelectItem>
                      <SelectItem value="168">In 7 days</SelectItem>
                      <SelectItem value="720">In 30 days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                  Receiving account: <span className="break-all font-mono text-foreground">{address}</span>
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button className="w-full gap-2" disabled={!canCreate} onClick={() => void handleCreate()}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                  Create payment link
                </Button>
              </div>
            )}
          </section>

          <aside className="border border-border bg-card p-5">
            {created ? (
              <div>
                <div className="mb-5 flex justify-center bg-white p-5">
                  <QRCodeSVG value={created.paymentUrl} size={220} level="M" />
                </div>
                <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-success">
                  <Check className="h-4 w-4" /> Link ready
                </div>
                <p className="break-all text-xs leading-5 text-muted-foreground">{created.paymentUrl}</p>
                <div className="mt-5 grid grid-cols-2 gap-2">
                  <Button variant="outline" className="gap-2" onClick={() => void copyLink()}>
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                  <Button variant="outline" className="gap-2" onClick={() => void shareLink()}>
                    <Share2 className="h-4 w-4" /> Share
                  </Button>
                </div>
                <Button asChild className="mt-2 w-full gap-2">
                  <Link href={`/pay/${created.slug}`}>
                    Open link <ExternalLink className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="flex min-h-72 flex-col items-center justify-center text-center">
                <Link2 className="mb-4 h-8 w-8 text-muted-foreground" />
                <h2 className="font-semibold">Your QR appears here</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Create a request to copy, share, or scan the payment link.
                </p>
              </div>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}

export default function PaymentLinksPage() {
  return <WalletProvider><PaymentLinksContent /></WalletProvider>;
}

