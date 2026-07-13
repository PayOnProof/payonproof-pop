"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, LockKeyhole, QrCode, Smartphone, Wallet } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { PopHeader } from "@/components/pop-header";
import { GradientMesh } from "@/components/gradient-mesh";
import { Button } from "@/components/ui/button";
import { WalletProvider, useWallet } from "@/lib/wallet-context";
import { ensureFreighterNetwork, signFreighterTransaction } from "@/lib/wallet";
import {
  fetchPaymentLink,
  preparePaymentLink,
  submitPaymentLink,
  type PaymentLink,
} from "@/lib/payment-links-api";

function shortAccount(account: string) {
  return `${account.slice(0, 8)}...${account.slice(-8)}`;
}

function PayLinkContent() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const { address, status, connect } = useWallet();
  const [link, setLink] = useState<PaymentLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [showWalletQr, setShowWalletQr] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const value = await fetchPaymentLink(slug);
      setLink(value);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load payment link");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [slug]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (link?.status !== "pending") return;
    const timer = window.setInterval(() => void load(true), 10000);
    return () => window.clearInterval(timer);
  }, [link?.status, load]);

  async function pay() {
    if (!link || !address) return;
    setPaying(true);
    setError(null);
    try {
      await ensureFreighterNetwork(link.network);
      const { prepared } = await preparePaymentLink({ slug: link.slug, payerAccount: address });
      const signedXdr = await signFreighterTransaction({
        transactionXdr: prepared.transactionXdr,
        networkPassphrase: prepared.networkPassphrase,
        address,
      });
      const result = await submitPaymentLink({ slug: link.slug, signedXdr });
      setLink(result.paymentLink);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Payment failed");
    } finally {
      setPaying(false);
    }
  }

  return (
    <div className="relative min-h-screen bg-background">
      <GradientMesh />
      <PopHeader variant="app" />
      <main className="relative z-10 mx-auto flex min-h-screen max-w-xl items-center px-4 pb-12 pt-24 sm:px-6">
        <section className="w-full border border-border bg-card">
          {loading ? (
            <div className="flex min-h-96 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
          ) : !link ? (
            <div className="p-8 text-center">
              <AlertCircle className="mx-auto mb-4 h-8 w-8 text-destructive" />
              <h1 className="text-xl font-semibold">Payment link unavailable</h1>
              <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            </div>
          ) : link.status === "paid" ? (
            <div className="p-7 text-center sm:p-9">
              <CheckCircle2 className="mx-auto mb-5 h-10 w-10 text-success" />
              <p className="text-sm font-semibold text-success">Verified on Stellar</p>
              <h1 className="mt-2 text-3xl font-bold">Payment complete</h1>
              <p className="mt-3 text-muted-foreground">{link.amount} {link.assetCode}</p>
              {link.stellarTxHash && (
                <div className="mt-6 border border-border bg-muted/20 p-4 text-left">
                  <p className="text-xs text-muted-foreground">Transaction hash</p>
                  <p className="mt-1 break-all font-mono text-xs">{link.stellarTxHash}</p>
                </div>
              )}
              {link.explorerUrl && (
                <Button asChild variant="outline" className="mt-5 gap-2">
                  <a href={link.explorerUrl} target="_blank" rel="noreferrer">View on Stellar Explorer <ExternalLink className="h-4 w-4" /></a>
                </Button>
              )}
            </div>
          ) : link.status !== "pending" ? (
            <div className="p-8 text-center">
              <AlertCircle className="mx-auto mb-4 h-8 w-8 text-muted-foreground" />
              <h1 className="text-xl font-semibold">This link is {link.status}</h1>
              <Button asChild variant="outline" className="mt-5"><Link href="/">Return home</Link></Button>
            </div>
          ) : (
            <>
              <div className="border-b border-border p-6 sm:p-7">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-primary">POP payment request</p>
                    <h1 className="mt-1 text-xl font-bold">{link.recipientLabel || "Stellar payment"}</h1>
                  </div>
                  <span className="border border-primary/30 px-2 py-1 text-xs font-semibold uppercase text-primary">{link.network}</span>
                </div>
              </div>
              <div className="p-6 sm:p-7">
                <div className="mb-7 text-center">
                  <p className="text-sm text-muted-foreground">Amount due</p>
                  <p className="mt-2 text-4xl font-bold tabular-nums">{link.amount}</p>
                  <p className="mt-1 font-semibold text-primary">{link.assetCode}</p>
                </div>
                {link.description && <p className="mb-5 border border-border bg-muted/20 p-4 text-sm leading-6">{link.description}</p>}
                <dl className="mb-6 space-y-3 text-sm">
                  <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Recipient</dt><dd className="font-mono">{shortAccount(link.recipientAccount)}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Expires</dt><dd>{link.expiresAt ? new Date(link.expiresAt).toLocaleString() : "No expiration"}</dd></div>
                </dl>
                {status !== "connected" || !address ? (
                  <Button className="w-full gap-2" onClick={() => void connect("freighter")}><Wallet className="h-4 w-4" /> Connect Freighter</Button>
                ) : (
                  <Button className="w-full gap-2" disabled={paying} onClick={() => void pay()}>
                    {paying ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
                    {paying ? "Confirming payment..." : `Pay ${link.amount} ${link.assetCode}`}
                  </Button>
                )}
                {link.sep7Uri && (
                  <div className="mt-3 space-y-2">
                    <Button asChild variant="outline" className="w-full gap-2">
                      <a href={link.sep7Uri}>
                        <Smartphone className="h-4 w-4" /> Open in another wallet
                      </a>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full gap-2 text-muted-foreground"
                      onClick={() => setShowWalletQr((value) => !value)}
                    >
                      <QrCode className="h-4 w-4" />
                      {showWalletQr ? "Hide wallet QR" : "Scan with another wallet"}
                    </Button>
                    {showWalletQr && (
                      <div className="border border-border bg-white p-5">
                        <QRCodeSVG
                          value={link.sep7Uri}
                          size={240}
                          level="M"
                          className="mx-auto h-auto w-full max-w-60"
                        />
                      </div>
                    )}
                  </div>
                )}
                {error && <p className="mt-4 text-center text-sm text-destructive">{error}</p>}
                <p className="mt-5 text-center text-xs leading-5 text-muted-foreground">Freighter shows the exact destination and amount before you sign. POP verifies the submitted transaction on Stellar.</p>
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}

export default function PayLinkPage() {
  return <WalletProvider><PayLinkContent /></WalletProvider>;
}
