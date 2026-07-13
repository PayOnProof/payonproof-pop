"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Search,
  Wallet,
} from "lucide-react";
import { PopHeader } from "@/components/pop-header";
import { GradientMesh } from "@/components/gradient-mesh";
import { CountrySelector } from "@/components/country-selector";
import { RouteCard } from "@/components/route-card";
import { TransactionExecution } from "@/components/transaction-execution";
import { ProofOfPaymentView } from "@/components/proof-of-payment";
import { Button } from "@/components/ui/button";
import { WalletProvider, useWallet } from "@/lib/wallet-context";
import { compareRoutes, fetchAnchorCountries } from "@/lib/anchors-api";
import type { AnchorCountry, RemittanceRoute, Transaction } from "@/lib/types";
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
  const [countries, setCountries] = useState<AnchorCountry[]>([]);
  const [originCountry, setOriginCountry] = useState("");
  const [routes, setRoutes] = useState<RemittanceRoute[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<RemittanceRoute | null>(null);
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [step, setStep] = useState<PaymentStep>("request");
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
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
    if (!link) return;
    fetchAnchorCountries(link.network)
      .then((items) => setCountries(items.filter((country) => country.onRampCount > 0)))
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load countries"));
  }, [link]);

  useEffect(() => {
    if (!countries.length) return;
    if (!countries.some((country) => country.code === originCountry)) {
      const preferred = countries.find((country) => country.code !== link?.destinationCountry);
      setOriginCountry((preferred ?? countries[0]).code);
    }
  }, [countries, link?.destinationCountry, originCountry]);

  const sortedRoutes = useMemo(
    () => [...routes].sort((a, b) => (b.recommended ? 1 : 0) - (a.recommended ? 1 : 0) || a.feePercentage - b.feePercentage),
    [routes]
  );

  async function findRoutes() {
    if (!link || !originCountry) return;
    setSearching(true);
    setError(null);
    try {
      const result = await compareRoutes({
        origin: originCountry,
        destination: link.destinationCountry,
        amount: Number(link.amount),
        network: link.network,
      });
      const matching = result.routes.filter(
        (route) =>
          route.available &&
          route.destinationAnchor.id === link.destinationAnchorId &&
          route.destinationCurrency === link.assetCode
      );
      setRoutes(matching);
      if (!matching.length) {
        setError(
          `No operational route from this country ends at ${link.destinationAnchorName}.`
        );
      }
    } catch (cause) {
      setRoutes([]);
      setError(cause instanceof Error ? cause.message : "Could not compare anchor routes");
    } finally {
      setSearching(false);
    }
  }

  function chooseRoute(route: RemittanceRoute) {
    setSelectedRoute(route);
    setStep("execute");
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

  const isLegacyDirectLink = !link.destinationAnchorId || !link.destinationCountry;

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
              {link.amount} {link.assetCode} through {link.destinationAnchorName}
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
        ) : link.status === "processing" && step === "request" ? (
          <section className="border border-border bg-card p-7 text-center sm:p-9">
            <Loader2 className="mx-auto mb-5 h-9 w-9 animate-spin text-primary" />
            <h1 className="text-2xl font-bold">Anchor payment in progress</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              The anchor flow has already started. POP will mark this request paid when
              the Stellar settlement is available.
            </p>
          </section>
        ) : link.status !== "pending" ? (
          <section className="border border-border bg-card p-8 text-center">
            <AlertCircle className="mx-auto mb-4 h-8 w-8 text-muted-foreground" />
            <h1 className="text-xl font-semibold">This link is {link.status}</h1>
            <Button asChild variant="outline" className="mt-5"><Link href="/">Return home</Link></Button>
          </section>
        ) : isLegacyDirectLink ? (
          <section className="border border-border bg-card p-8 text-center">
            <AlertCircle className="mx-auto mb-4 h-8 w-8 text-destructive" />
            <h1 className="text-xl font-semibold">Legacy link unavailable</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Create a new request and select a receiving anchor.
            </p>
          </section>
        ) : step === "execute" && selectedRoute ? (
          <TransactionExecution
            route={selectedRoute}
            amount={Number(link.amount)}
            paymentLinkSlug={link.slug}
            onBack={() => setStep("request")}
            onComplete={handleComplete}
          />
        ) : step === "proof" && transaction ? (
          <ProofOfPaymentView
            transaction={transaction}
            onNewTransfer={() => void load()}
          />
        ) : (
          <div className="space-y-6">
            <section className="border border-border bg-card">
              <div className="border-b border-border p-6 sm:p-7">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-primary">Anchor payment request</p>
                    <h1 className="mt-1 text-2xl font-bold">{link.recipientLabel || "Payment request"}</h1>
                  </div>
                  <span className="border border-primary/30 px-2 py-1 text-xs font-semibold uppercase text-primary">
                    {link.network}
                  </span>
                </div>
              </div>
              <div className="p-6 sm:p-7">
                <div className="mb-7 text-center">
                  <p className="text-sm text-muted-foreground">Requested transfer</p>
                  <p className="mt-2 text-4xl font-bold tabular-nums">{link.amount}</p>
                  <p className="mt-1 font-semibold text-primary">{link.assetCode}</p>
                </div>
                {link.description && (
                  <p className="mb-5 border border-border bg-muted/20 p-4 text-sm leading-6">{link.description}</p>
                )}
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Receiving anchor</dt>
                    <dd className="flex items-center gap-2 font-semibold"><Building2 className="h-4 w-4 text-primary" />{link.destinationAnchorName}</dd>
                  </div>
                  <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Destination</dt><dd>{link.destinationCountry}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Request owner</dt><dd className="font-mono">{shortAccount(link.recipientAccount)}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Expires</dt><dd>{link.expiresAt ? new Date(link.expiresAt).toLocaleString() : "No expiration"}</dd></div>
                </dl>
              </div>
            </section>

            <section className="border border-border bg-card p-6 sm:p-7">
              <h2 className="text-lg font-bold">Choose where you are paying from</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                POP will only show routes that finish at {link.destinationAnchorName}.
              </p>
              <div className="mt-5">
                <CountrySelector
                  countries={countries}
                  value={originCountry}
                  onValueChange={(value) => { setOriginCountry(value); setRoutes([]); }}
                  label="Pay from"
                />
              </div>
              <Button className="mt-4 w-full gap-2" disabled={!originCountry || searching} onClick={() => void findRoutes()}>
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Find anchor routes
              </Button>
              {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
            </section>

            {sortedRoutes.length > 0 && (
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-lg font-bold">Available routes</h2>
                  {status !== "connected" || !address ? (
                    <Button size="sm" className="gap-2" onClick={() => void connect("freighter")}>
                      <Wallet className="h-4 w-4" /> Connect Freighter
                    </Button>
                  ) : (
                    <span className="text-xs text-success">Freighter connected</span>
                  )}
                </div>
                <div className="space-y-4">
                  {sortedRoutes.map((route, index) => (
                    <RouteCard
                      key={route.id}
                      route={route}
                      onSelect={chooseRoute}
                      selectable={status === "connected" && Boolean(address)}
                      selectionHint="Connect Freighter to continue"
                      index={index}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default function PayLinkPage() {
  return <WalletProvider><PayLinkContent /></WalletProvider>;
}
