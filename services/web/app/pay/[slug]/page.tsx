"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Wallet,
} from "lucide-react";
import { PopHeader } from "@/components/pop-header";
import { GradientMesh } from "@/components/gradient-mesh";
import { RouteCard } from "@/components/route-card";
import { TransactionExecution } from "@/components/transaction-execution";
import { ProofOfPaymentView } from "@/components/proof-of-payment";
import { Button } from "@/components/ui/button";
import { WalletProvider, useWallet } from "@/lib/wallet-context";
import { compareRoutes } from "@/lib/anchors-api";
import type { RemittanceRoute, Transaction } from "@/lib/types";
import { fetchPaymentLink, type PaymentLink } from "@/lib/payment-links-api";

type PaymentStep = "request" | "execute" | "proof";

function shortAccount(account: string) {
  return `${account.slice(0, 8)}...${account.slice(-8)}`;
}

function PayLinkContent() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const { address, status, connect } = useWallet();
  const [link, setLink] = useState<PaymentLink | null>(null);
  const [liveRoute, setLiveRoute] = useState<RemittanceRoute | null>(null);
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [step, setStep] = useState<PaymentStep>("request");
  const [loading, setLoading] = useState(true);
  const [loadingRoute, setLoadingRoute] = useState(false);
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
    if (!link || (link.status !== "pending" && link.status !== "processing")) return;
    const timer = window.setInterval(() => void load(true), 10000);
    return () => window.clearInterval(timer);
  }, [link, load]);

  useEffect(() => {
    if (
      !link ||
      link.status !== "pending" ||
      !link.originCountry ||
      !link.originAnchorId ||
      !link.destinationCountry ||
      !link.destinationAnchorId
    ) {
      return;
    }

    let cancelled = false;
    setLoadingRoute(true);
    compareRoutes({
      origin: link.originCountry,
      destination: link.destinationCountry,
      amount: Number(link.amount),
      network: link.network,
    })
      .then((result) => {
        if (cancelled) return;
        const route = result.routes.find(
          (candidate) =>
            candidate.available &&
            candidate.originAnchor.id === link.originAnchorId &&
            candidate.destinationAnchor.id === link.destinationAnchorId
        );
        setLiveRoute(route ?? null);
        if (!route) {
          setError("The selected anchor route is not currently execution-ready.");
        }
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Could not refresh route quote");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingRoute(false);
      });

    return () => {
      cancelled = true;
    };
  }, [link]);

  function chooseRoute(route: RemittanceRoute) {
    setStep("execute");
    setLiveRoute(route);
  }

  function handleComplete(value: Transaction) {
    setTransaction(value);
    setStep("proof");
  }

  if (loading) {
    return (
      <div className="relative min-h-screen bg-background">
        <GradientMesh />
        <PopHeader variant="app" />
        <main className="relative z-10 flex min-h-screen items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </main>
      </div>
    );
  }

  if (!link) {
    return (
      <div className="relative min-h-screen bg-background">
        <PopHeader variant="app" />
        <main className="mx-auto max-w-lg px-4 pt-32 text-center">
          <AlertCircle className="mx-auto mb-4 h-8 w-8 text-destructive" />
          <h1 className="text-xl font-semibold">Payment link unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        </main>
      </div>
    );
  }

  const isLegacyLink =
    !link.originAnchorId ||
    !link.originCountry ||
    !link.destinationAnchorId ||
    !link.destinationCountry;

  return (
    <div className="relative min-h-screen bg-background">
      <GradientMesh />
      <PopHeader variant="app" />
      <main className="relative z-10 mx-auto max-w-3xl px-4 pb-16 pt-24 sm:px-6">
        {link.status === "paid" ? (
          <section className="border border-border bg-card p-7 text-center sm:p-9">
            <CheckCircle2 className="mx-auto mb-5 h-10 w-10 text-success" />
            <p className="text-sm font-semibold text-success">Verified through Stellar anchors</p>
            <h1 className="mt-2 text-3xl font-bold">Payment complete</h1>
            <p className="mt-3 text-muted-foreground">
              {link.amount} {link.assetCode} through {link.originAnchorName} {"->"} {link.destinationAnchorName}
            </p>
            {link.stellarTxHash && (
              <div className="mt-6 border border-border bg-muted/20 p-4 text-left">
                <p className="text-xs text-muted-foreground">Stellar transaction hash</p>
                <p className="mt-1 break-all font-mono text-xs">{link.stellarTxHash}</p>
              </div>
            )}
            {link.explorerUrl && (
              <Button asChild variant="outline" className="mt-5 gap-2">
                <a href={link.explorerUrl} target="_blank" rel="noreferrer">
                  View on Stellar Explorer <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            )}
          </section>
        ) : step === "execute" &&
          liveRoute &&
          (link.status === "pending" || link.status === "processing") ? (
          <TransactionExecution
            route={liveRoute}
            amount={Number(link.amount)}
            paymentLinkSlug={link.slug}
            onBack={() => setStep("request")}
            onComplete={handleComplete}
          />
        ) : step === "proof" && transaction ? (
          <ProofOfPaymentView transaction={transaction} onNewTransfer={() => void load()} />
        ) : link.status === "processing" ? (
          <section className="border border-border bg-card p-7 text-center sm:p-9">
            <Loader2 className="mx-auto mb-5 h-9 w-9 animate-spin text-primary" />
            <h1 className="text-2xl font-bold">Anchor payment in progress</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              POP is checking the destination anchor and will verify the final Stellar settlement.
            </p>
          </section>
        ) : link.status !== "pending" ? (
          <section className="border border-border bg-card p-8 text-center">
            <AlertCircle className="mx-auto mb-4 h-8 w-8 text-muted-foreground" />
            <h1 className="text-xl font-semibold">This link is {link.status}</h1>
            <Button asChild variant="outline" className="mt-5"><Link href="/">Return home</Link></Button>
          </section>
        ) : isLegacyLink ? (
          <section className="border border-border bg-card p-8 text-center">
            <AlertCircle className="mx-auto mb-4 h-8 w-8 text-destructive" />
            <h1 className="text-xl font-semibold">Legacy link unavailable</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Create a new request and select a complete anchor route.
            </p>
          </section>
        ) : (
          <div className="space-y-6">
            <section className="border border-border bg-card">
              <div className="border-b border-border p-6 sm:p-7">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-primary">POP payment request</p>
                    <h1 className="mt-1 text-2xl font-bold">{link.recipientLabel || "Payment request"}</h1>
                  </div>
                  <span className="border border-primary/30 px-2 py-1 text-xs font-semibold uppercase text-primary">
                    {link.network}
                  </span>
                </div>
              </div>
              <div className="p-6 sm:p-7">
                <div className="mb-7 text-center">
                  <p className="text-sm text-muted-foreground">Payer sends</p>
                  <p className="mt-2 text-4xl font-bold tabular-nums">{link.amount}</p>
                  <p className="mt-1 font-semibold text-primary">
                    {link.routeSnapshot?.originCurrency || link.assetCode}
                  </p>
                </div>
                {link.description && (
                  <p className="mb-5 border border-border bg-muted/20 p-4 text-sm leading-6">{link.description}</p>
                )}
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Route</dt><dd className="text-right font-semibold">{link.originAnchorName} {"->"} {link.destinationAnchorName}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Corridor</dt><dd>{link.originCountry} {"->"} {link.destinationCountry}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Request owner</dt><dd className="font-mono">{shortAccount(link.recipientAccount)}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Expires</dt><dd>{link.expiresAt ? new Date(link.expiresAt).toLocaleString() : "No expiration"}</dd></div>
                </dl>
              </div>
            </section>

            <section>
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-lg font-bold">Selected anchor route</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    POP refreshes the quote before execution. Review the live fees and final amount.
                  </p>
                </div>
                {status !== "connected" || !address ? (
                  <Button size="sm" className="gap-2" onClick={() => void connect("freighter")}>
                    <Wallet className="h-4 w-4" /> Connect Freighter
                  </Button>
                ) : (
                  <span className="text-xs text-success">Freighter connected</span>
                )}
              </div>

              {loadingRoute ? (
                <div className="flex min-h-40 items-center justify-center border border-border bg-card">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : liveRoute ? (
                <RouteCard
                  route={liveRoute}
                  onSelect={chooseRoute}
                  selectable={status === "connected" && Boolean(address)}
                  selectionHint="Connect Freighter to continue"
                />
              ) : (
                <div className="border border-destructive/30 bg-card p-6 text-center">
                  <AlertCircle className="mx-auto mb-3 h-7 w-7 text-destructive" />
                  <p className="font-semibold">Selected route is currently unavailable</p>
                  <p className="mt-2 text-sm text-muted-foreground">{error}</p>
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

export default function PayLinkPage() {
  return <WalletProvider><PayLinkContent /></WalletProvider>;
}
