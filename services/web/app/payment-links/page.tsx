"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  Check,
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  Search,
  Share2,
  Timer,
  TrendingDown,
  Wallet,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { PopHeader } from "@/components/pop-header";
import { GradientMesh } from "@/components/gradient-mesh";
import { CountrySelector } from "@/components/country-selector";
import { RouteCard } from "@/components/route-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { WalletProvider, useWallet } from "@/lib/wallet-context";
import { compareRoutes, fetchAnchorCountries } from "@/lib/anchors-api";
import type { AnchorCountry, RemittanceRoute } from "@/lib/types";
import {
  createPaymentLink,
  type PaymentLink,
  type PaymentLinkNetwork,
} from "@/lib/payment-links-api";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "pop_payment_link_management";

function PaymentLinksContent() {
  const { address, status, connect } = useWallet();
  const [network, setNetwork] = useState<PaymentLinkNetwork>("testnet");
  const [countries, setCountries] = useState<AnchorCountry[]>([]);
  const [originCountry, setOriginCountry] = useState("");
  const [destinationCountry, setDestinationCountry] = useState("");
  const [amount, setAmount] = useState("");
  const [routes, setRoutes] = useState<RemittanceRoute[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<RemittanceRoute | null>(null);
  const [sortBy, setSortBy] = useState<"recommended" | "cheapest" | "fastest">(
    "recommended"
  );
  const [recipientLabel, setRecipientLabel] = useState("");
  const [description, setDescription] = useState("");
  const [expiresInHours, setExpiresInHours] = useState("72");
  const [created, setCreated] = useState<PaymentLink | null>(null);
  const [loadingCountries, setLoadingCountries] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noRouteReason, setNoRouteReason] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadingCountries(true);
    setError(null);
    fetchAnchorCountries(network)
      .then((items) => {
        if (!cancelled) setCountries(items);
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Could not load countries");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingCountries(false);
      });
    return () => {
      cancelled = true;
    };
  }, [network]);

  const originCountries = useMemo(
    () => countries.filter((country) => country.onRampCount > 0),
    [countries]
  );
  const destinationCountries = useMemo(
    () => countries.filter((country) => country.offRampCount > 0),
    [countries]
  );

  useEffect(() => {
    if (
      originCountries.length > 0 &&
      !originCountries.some((country) => country.code === originCountry)
    ) {
      setOriginCountry(originCountries[0].code);
    }
  }, [originCountries, originCountry]);

  useEffect(() => {
    if (
      destinationCountries.length > 0 &&
      !destinationCountries.some((country) => country.code === destinationCountry)
    ) {
      const different = destinationCountries.find(
        (country) => country.code !== originCountry
      );
      setDestinationCountry((different ?? destinationCountries[0]).code);
    }
  }, [destinationCountries, destinationCountry, originCountry]);

  const sortedRoutes = useMemo(() => {
    return [...routes].sort((left, right) => {
      if (sortBy === "cheapest") return left.feePercentage - right.feePercentage;
      if (sortBy === "fastest") return left.estimatedMinutes - right.estimatedMinutes;
      if (left.recommended) return -1;
      if (right.recommended) return 1;
      return left.feePercentage - right.feePercentage;
    });
  }, [routes, sortBy]);

  function resetComparison() {
    setRoutes([]);
    setSelectedRoute(null);
    setCreated(null);
    setNoRouteReason(null);
  }

  async function handleCompare() {
    if (!originCountry || !destinationCountry || Number(amount) <= 0) return;
    setComparing(true);
    setError(null);
    setNoRouteReason(null);
    setSelectedRoute(null);
    try {
      const result = await compareRoutes({
        origin: originCountry,
        destination: destinationCountry,
        amount: Number(amount),
        network,
      });
      setRoutes(result.routes);
      setNoRouteReason(result.noRouteReason ?? null);
    } catch (cause) {
      setRoutes([]);
      setError(cause instanceof Error ? cause.message : "Could not compare routes");
    } finally {
      setComparing(false);
    }
  }

  async function handleCreate() {
    if (!address || !selectedRoute) return;
    setCreating(true);
    setError(null);
    try {
      const result = await createPaymentLink({
        network,
        recipientAccount: address,
        recipientLabel: recipientLabel.trim() || undefined,
        originCountry: selectedRoute.originCountry,
        originAnchorId: selectedRoute.originAnchor.id,
        destinationCountry: selectedRoute.destinationCountry,
        destinationAnchorId: selectedRoute.destinationAnchor.id,
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
      setCreating(false);
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
      const originCurrency =
        created.routeSnapshot?.originCurrency ?? created.assetCode;
      await navigator.share({
        title: "POP payment request",
        text: `Pay ${created.amount} ${originCurrency} using the selected POP route`,
        url: created.paymentUrl,
      });
      return;
    }
    await copyLink();
  }

  const sortOptions = [
    { value: "recommended", label: "Best", icon: BarChart3 },
    { value: "cheapest", label: "Cheapest", icon: TrendingDown },
    { value: "fastest", label: "Fastest", icon: Timer },
  ] as const;

  return (
    <div className="relative min-h-screen bg-background">
      <GradientMesh />
      <PopHeader variant="app" />
      <main className="relative z-10 mx-auto max-w-5xl px-4 pb-16 pt-24 sm:px-6">
        <div className="mb-8">
          <p className="mb-2 text-sm font-semibold text-primary">Receive money</p>
          <h1 className="text-3xl font-bold text-foreground">Compare and create a payment link</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Compare operational anchor routes before requesting payment. Fees, rate,
            settlement time, risks, and the final received amount come from POP&apos;s
            live route engine.
          </p>
        </div>

        <section className="border border-border bg-card p-5 sm:p-6">
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label>Network</Label>
              <Select
                value={network}
                onValueChange={(value) => {
                  setNetwork(value as PaymentLinkNetwork);
                  resetComparison();
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="testnet">Testnet</SelectItem>
                  <SelectItem value="mainnet">Mainnet</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <CountrySelector
              countries={originCountries}
              value={originCountry}
              onValueChange={(value) => {
                setOriginCountry(value);
                resetComparison();
              }}
              label="Payer sends from"
            />

            <CountrySelector
              countries={destinationCountries}
              value={destinationCountry}
              onValueChange={(value) => {
                setDestinationCountry(value);
                resetComparison();
              }}
              label="Recipient receives in"
            />

            <div className="space-y-2">
              <Label htmlFor="amount">Amount payer sends</Label>
              <Input
                id="amount"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                placeholder="50"
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value);
                  resetComparison();
                }}
              />
            </div>
          </div>
          <Button
            className="mt-5 w-full gap-2 sm:w-auto"
            disabled={
              loadingCountries ||
              comparing ||
              !originCountry ||
              !destinationCountry ||
              Number(amount) <= 0
            }
            onClick={() => void handleCompare()}
          >
            {comparing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Compare anchor routes
          </Button>
          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        </section>

        {routes.length > 0 && !created && (
          <section className="mt-8">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-2xl font-bold">{routes.length} routes available</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Select the route that will be fixed in the payment request.
                </p>
              </div>
              <div className="flex border border-border bg-muted/20 p-1">
                {sortOptions.map((option) => {
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setSortBy(option.value)}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-2 text-xs font-semibold",
                        sortBy === option.value
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" /> {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-4">
              {sortedRoutes.map((route, index) => {
                const isSelected = selectedRoute?.id === route.id;
                return (
                  <div
                    key={route.id}
                    aria-current={isSelected ? "true" : undefined}
                    className={cn(
                      isSelected && "outline outline-2 outline-offset-2 outline-primary"
                    )}
                  >
                    <RouteCard
                      route={route}
                      onSelect={setSelectedRoute}
                      selectable={route.available}
                      selectionHint="Route is not execution-ready"
                      index={index}
                    />
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {routes.length === 0 && noRouteReason && (
          <div className="mt-8 border border-border bg-card p-8 text-center">
            <p className="font-semibold">No operational routes found</p>
            <p className="mt-2 text-sm text-muted-foreground">{noRouteReason}</p>
          </div>
        )}

        {selectedRoute && !created && (
          <section className="mt-8 grid gap-6 border border-primary/30 bg-card p-5 sm:p-6 lg:grid-cols-[1fr_320px]">
            <div>
              <p className="text-xs font-bold uppercase text-primary">Selected route</p>
              <h2 className="mt-2 text-xl font-bold">
                {selectedRoute.originAnchor.name} {"->"} {selectedRoute.destinationAnchor.name}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                The payer sends {amount} {selectedRoute.originCurrency}; the current quote
                delivers {selectedRoute.receivedAmount.toLocaleString()} {selectedRoute.destinationCurrency}{" "}
                after {selectedRoute.feePercentage}% estimated total fees.
              </p>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
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
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="description">Payment note</Label>
                  <Textarea
                    id="description"
                    maxLength={240}
                    placeholder="Invoice, order, or reason for payment"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col justify-center border-t border-border pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
              {status !== "connected" || !address ? (
                <>
                  <Wallet className="mb-3 h-7 w-7 text-primary" />
                  <p className="font-semibold">Identify the request owner</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Connect Freighter to associate this request with your Stellar account.
                  </p>
                  <Button className="mt-4 gap-2" onClick={() => void connect("freighter")}>
                    <Wallet className="h-4 w-4" /> Connect Freighter
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">Request owner</p>
                  <p className="mt-1 break-all font-mono text-xs">{address}</p>
                  <Button
                    className="mt-5 w-full gap-2"
                    disabled={creating}
                    onClick={() => void handleCreate()}
                  >
                    {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                    Create payment link
                  </Button>
                </>
              )}
            </div>
          </section>
        )}

        {created && (
          <section className="mt-8 grid gap-6 border border-border bg-card p-5 sm:p-6 md:grid-cols-[260px_1fr]">
            <div className="bg-white p-5">
              <QRCodeSVG value={created.paymentUrl} size={220} level="M" className="h-auto w-full" />
            </div>
            <div className="flex flex-col justify-center">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-success">
                <Check className="h-4 w-4" /> Payment route ready
              </div>
              <h2 className="text-xl font-bold">
                {created.originAnchorName} {"->"} {created.destinationAnchorName}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {created.originCountry} {created.routeSnapshot?.originCurrency ?? created.assetCode}
                {" -> "}
                {created.destinationCountry} {created.routeSnapshot?.destinationCurrency ?? created.assetCode}
                {" / "}{created.network}
              </p>
              {created.routeSnapshot && (
                <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 border-y border-border py-4 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Estimated fee</dt>
                    <dd className="mt-1 font-semibold">
                      {created.routeSnapshot.feePercentage}% ({created.routeSnapshot.feeAmount.toFixed(2)} {created.routeSnapshot.originCurrency})
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Rate</dt>
                    <dd className="mt-1 font-semibold tabular-nums">
                      {created.routeSnapshot.exchangeRate} {created.routeSnapshot.destinationCurrency}/{created.routeSnapshot.originCurrency}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Estimated time</dt>
                    <dd className="mt-1 font-semibold">{created.routeSnapshot.estimatedTime}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Recipient gets</dt>
                    <dd className="mt-1 font-semibold tabular-nums">
                      {created.routeSnapshot.receivedAmount.toLocaleString()} {created.routeSnapshot.destinationCurrency}
                    </dd>
                  </div>
                </dl>
              )}
              <p className="mt-4 break-all text-xs leading-5 text-muted-foreground">{created.paymentUrl}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button variant="outline" className="gap-2" onClick={() => void copyLink()}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
                <Button variant="outline" className="gap-2" onClick={() => void shareLink()}>
                  <Share2 className="h-4 w-4" /> Share
                </Button>
                <Button asChild className="gap-2">
                  <Link href={`/pay/${created.slug}`}>
                    Open link <ExternalLink className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default function PaymentLinksPage() {
  return <WalletProvider><PaymentLinksContent /></WalletProvider>;
}
