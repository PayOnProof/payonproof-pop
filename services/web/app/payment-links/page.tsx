"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowDownUp,
  ArrowLeft,
  BarChart3,
  Check,
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  Search,
  Share2,
  Sparkles,
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
type PaymentLinkStep = "search" | "routes" | "details" | "ready";

function PaymentLinksContent() {
  const { address, status, connect } = useWallet();
  const [step, setStep] = useState<PaymentLinkStep>("search");
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
      (!destinationCountries.some((country) => country.code === destinationCountry) ||
        destinationCountry === originCountry)
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
    setError(null);
    setStep("search");
  }

  function handleSwapCountries() {
    const nextOrigin = destinationCountry;
    const nextDestination = originCountry;
    setOriginCountry(nextOrigin);
    setDestinationCountry(nextDestination);
    setRoutes([]);
    setSelectedRoute(null);
    setNoRouteReason(null);
  }

  function handleSelectRoute(route: RemittanceRoute) {
    if (!route.available) return;
    setSelectedRoute(route);
    setError(null);
    setStep("details");
  }

  async function handleCompare() {
    if (
      !originCountry ||
      !destinationCountry ||
      originCountry === destinationCountry ||
      Number(amount) <= 0
    ) return;
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
      setStep("routes");
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
      setStep("ready");
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

  const originName = countries.find((country) => country.code === originCountry)?.name;
  const destinationName = countries.find(
    (country) => country.code === destinationCountry
  )?.name;
  const amountValue = Number(amount);

  return (
    <div className="relative min-h-screen bg-background">
      <GradientMesh />
      <PopHeader variant="app" />
      <main className="relative z-10 mx-auto max-w-5xl px-4 pb-16 pt-20 sm:px-6 sm:pb-20 sm:pt-24">
        {step === "search" && (
          <div className="mx-auto max-w-md animate-fade-in-up">
            <div className="mb-8 flex flex-col items-center text-center">
              <div className="relative mb-6">
                <div className="absolute -inset-4 rounded-full bg-primary/10 blur-2xl" />
                <Image
                  src="/isotipo.png"
                  alt="POP"
                  width={72}
                  height={72}
                  className="relative rounded-2xl"
                  priority
                />
              </div>
              <h1 className="text-balance text-2xl font-bold tracking-tight text-foreground sm:text-3xl md:text-4xl">
                Get Paid Globally
              </h1>
              <p className="mt-3 max-w-sm text-pretty text-sm leading-relaxed text-muted-foreground">
                Compare anchor routes, choose the best option, and share one payment link.
              </p>
            </div>

            <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-primary/5">
              <div className="flex items-center gap-3 border-b border-border bg-muted/20 px-6 py-5">
                <div className="relative">
                  <div className="absolute -inset-1 rounded-xl bg-primary/20 blur-md" />
                  <Image
                    src="/isotipo.png"
                    alt="POP"
                    width={32}
                    height={32}
                    className="relative rounded-lg"
                  />
                </div>
                <div>
                  <h2 className="text-lg font-bold tracking-tight text-foreground">
                    Receive Money
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Compare routes before creating your request
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-5 p-6">
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Network
                  </span>
                  <div className="grid grid-cols-2 rounded-xl border border-border bg-muted/20 p-1">
                    {(["testnet", "mainnet"] as PaymentLinkNetwork[]).map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => {
                          if (network === option) return;
                          setNetwork(option);
                          resetComparison();
                        }}
                        className={cn(
                          "rounded-lg px-3 py-2.5 text-xs font-semibold capitalize transition-all duration-200",
                          network === option
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                        )}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>

                <CountrySelector
                  countries={originCountries}
                  value={originCountry}
                  onValueChange={(value) => {
                    setOriginCountry(value);
                    setError(null);
                  }}
                  label="Payer sends from"
                  exclude={destinationCountry}
                />

                <div className="-my-1 flex justify-center">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleSwapCountries}
                    className={cn(
                      "h-10 w-10 rounded-full border-border bg-transparent text-muted-foreground",
                      "transition-all duration-300 hover:rotate-180 hover:border-primary/50",
                      "hover:text-primary hover:shadow-lg hover:shadow-primary/10 active:scale-90"
                    )}
                    aria-label="Swap payer and recipient countries"
                  >
                    <ArrowDownUp className="h-4 w-4" />
                  </Button>
                </div>

                <CountrySelector
                  countries={destinationCountries}
                  value={destinationCountry}
                  onValueChange={(value) => {
                    setDestinationCountry(value);
                    setError(null);
                  }}
                  label="You receive in"
                  exclude={originCountry}
                />

                <div className="flex flex-col gap-2">
                  <Label
                    htmlFor="amount"
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    Payer sends
                  </Label>
                  <div className="relative">
                    <Input
                      id="amount"
                      type="number"
                      inputMode="decimal"
                      min="0.01"
                      step="0.01"
                      placeholder="0.00"
                      value={amount}
                      onChange={(event) => {
                        setAmount(event.target.value);
                        setError(null);
                      }}
                      className={cn(
                        "h-14 rounded-xl border-border bg-muted/40 pl-5 pr-20 text-right text-2xl font-bold tabular-nums text-foreground sm:h-16 sm:text-3xl",
                        "transition-all duration-200 hover:border-primary/30 hover:bg-muted/60",
                        "focus:border-primary/50 focus:ring-2 focus:ring-primary/30"
                      )}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
                      Varies
                    </span>
                  </div>
                  {amountValue > 0 && (
                    <p className="text-right text-xs text-muted-foreground">
                      You&apos;ll compare routes for{" "}
                      <span className="font-medium text-foreground">
                        {amountValue.toLocaleString()} (asset resolved per route)
                      </span>
                    </p>
                  )}
                </div>

                <Button
                  onClick={() => void handleCompare()}
                  disabled={
                    loadingCountries ||
                    comparing ||
                    !originCountry ||
                    !destinationCountry ||
                    originCountry === destinationCountry ||
                    amountValue <= 0
                  }
                  className={cn(
                    "mt-2 h-12 w-full rounded-xl bg-primary text-sm font-bold text-primary-foreground sm:h-14 sm:text-base",
                    "transition-all duration-200 hover:scale-[1.02] hover:shadow-xl hover:shadow-primary/30",
                    "active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40",
                    "disabled:hover:scale-100 disabled:hover:shadow-none"
                  )}
                  size="lg"
                >
                  {comparing ? (
                    <span className="flex items-center gap-3">
                      <Loader2 className="h-5 w-5 animate-spin" /> Finding best routes...
                    </span>
                  ) : (
                    <span className="flex items-center gap-3">
                      <Search className="h-5 w-5" /> Compare Routes
                    </span>
                  )}
                </Button>

                <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
                  <Sparkles className="h-3 w-3 text-primary/60" />
                  <span>Real-time routes from Stellar anchors</span>
                </div>
                {error && <p className="text-center text-xs text-destructive">{error}</p>}
              </div>
            </section>
          </div>
        )}

        {step === "routes" && (
          <div className="animate-fade-in-up">
            <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <Button
                  variant="ghost"
                  onClick={resetComparison}
                  className="mb-2 gap-1.5 bg-transparent px-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
                  size="sm"
                >
                  <ArrowLeft className="h-4 w-4" /> New request
                </Button>
                <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  {routes.length} routes found
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    {amountValue.toLocaleString()}
                  </span>{" "}
                  from {originName} to {destinationName}
                </p>
                <p className="mt-1 text-xs capitalize text-muted-foreground">
                  {network} routes only
                </p>
              </div>

              <div className="flex w-fit rounded-xl border border-border bg-muted/20 p-1">
                {sortOptions.map((option) => {
                  const Icon = option.icon;
                  const active = sortBy === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setSortBy(option.value)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all duration-200",
                        active
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {routes.length > 0 ? (
              <div className="flex flex-col gap-4">
                {sortedRoutes.map((route, index) => (
                  <RouteCard
                    key={route.id}
                    route={route}
                    onSelect={handleSelectRoute}
                    selectable={route.available}
                    selectionHint="Route is not execution-ready"
                    index={index}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-20 text-center">
                <Search className="h-8 w-8 text-muted-foreground" />
                <p className="font-semibold">No operational routes found</p>
                <p className="max-w-md text-sm text-muted-foreground">
                  {noRouteReason ?? "Try another corridor, amount, or network."}
                </p>
              </div>
            )}
          </div>
        )}

        {step === "details" && selectedRoute && (
          <div className="mx-auto max-w-xl animate-fade-in-up">
            <Button
              variant="ghost"
              onClick={() => {
                setSelectedRoute(null);
                setError(null);
                setStep("routes");
              }}
              className="mb-3 gap-1.5 bg-transparent px-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
              size="sm"
            >
              <ArrowLeft className="h-4 w-4" /> Back to routes
            </Button>

            <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-primary/5">
              <div className="flex items-center gap-3 border-b border-border bg-muted/20 px-6 py-5">
                <div className="relative">
                  <div className="absolute -inset-1 rounded-xl bg-primary/20 blur-md" />
                  <Image src="/isotipo.png" alt="POP" width={32} height={32} className="relative rounded-lg" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg font-bold tracking-tight text-foreground">
                    Create Payment Link
                  </h1>
                  <p className="truncate text-xs text-muted-foreground">
                    {selectedRoute.originAnchor.name} {"->"} {selectedRoute.destinationAnchor.name}
                  </p>
                </div>
              </div>

              <dl className="grid grid-cols-3 border-b border-border bg-primary/[0.03] px-6 py-5 text-center">
                <div>
                  <dt className="text-[10px] font-semibold uppercase text-muted-foreground">Payer sends</dt>
                  <dd className="mt-1 text-lg font-bold tabular-nums">
                    {amountValue.toLocaleString()} <span className="text-xs text-muted-foreground">{selectedRoute.originCurrency}</span>
                  </dd>
                </div>
                <div className="border-x border-border px-2">
                  <dt className="text-[10px] font-semibold uppercase text-muted-foreground">Fee</dt>
                  <dd className="mt-1 text-lg font-bold tabular-nums">{selectedRoute.feePercentage}%</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-semibold uppercase text-muted-foreground">You get</dt>
                  <dd className="mt-1 text-lg font-bold tabular-nums text-primary">
                    {selectedRoute.receivedAmount.toLocaleString()} <span className="text-xs text-muted-foreground">{selectedRoute.destinationCurrency}</span>
                  </dd>
                </div>
              </dl>

              <div className="flex flex-col gap-5 p-6">
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="label">Recipient name</Label>
                    <Input
                      id="label"
                      maxLength={80}
                      placeholder="Business or person name"
                      value={recipientLabel}
                      onChange={(event) => setRecipientLabel(event.target.value)}
                      className="h-11 rounded-xl border-border bg-muted/40"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>Expires</Label>
                    <Select value={expiresInHours} onValueChange={setExpiresInHours}>
                      <SelectTrigger className="h-11 rounded-xl border-border bg-muted/40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="24">In 24 hours</SelectItem>
                        <SelectItem value="72">In 3 days</SelectItem>
                        <SelectItem value="168">In 7 days</SelectItem>
                        <SelectItem value="720">In 30 days</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="description">Payment note</Label>
                  <Textarea
                    id="description"
                    maxLength={240}
                    placeholder="Invoice, order, or reason for payment"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    className="min-h-24 rounded-xl border-border bg-muted/40"
                  />
                </div>

                {status === "connected" && address && (
                  <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase text-muted-foreground">Request owner</p>
                    <p className="mt-1 break-all font-mono text-xs text-foreground">{address}</p>
                  </div>
                )}

                {status !== "connected" || !address ? (
                  <Button
                    className="h-12 w-full rounded-xl gap-2 font-bold sm:h-14"
                    onClick={() => void connect("freighter")}
                  >
                    <Wallet className="h-5 w-5" /> Connect Freighter
                  </Button>
                ) : (
                  <Button
                    className="h-12 w-full rounded-xl gap-2 font-bold sm:h-14"
                    disabled={creating}
                    onClick={() => void handleCreate()}
                  >
                    {creating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Link2 className="h-5 w-5" />}
                    Create Payment Link
                  </Button>
                )}
                {error && <p className="text-center text-xs text-destructive">{error}</p>}
              </div>
            </section>
          </div>
        )}

        {step === "ready" && created && (
          <div className="mx-auto max-w-2xl animate-fade-in-up">
            <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-primary/5">
              <div className="flex items-center gap-3 border-b border-border bg-muted/20 px-6 py-5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-success/10 text-success">
                  <Check className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-lg font-bold tracking-tight text-foreground">Payment Link Ready</h1>
                  <p className="text-xs text-muted-foreground">Share the link or let the payer scan the QR</p>
                </div>
              </div>

              <div className="grid gap-6 p-6 md:grid-cols-[220px_1fr]">
                <div className="bg-white p-4">
                  <QRCodeSVG value={created.paymentUrl} size={220} level="M" className="h-auto w-full" />
                </div>
                <div className="flex min-w-0 flex-col justify-center">
                  <h2 className="text-lg font-bold">
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
                        <dt className="text-xs text-muted-foreground">Recipient gets</dt>
                        <dd className="mt-1 font-semibold tabular-nums">
                          {created.routeSnapshot.receivedAmount.toLocaleString()} {created.routeSnapshot.destinationCurrency}
                        </dd>
                      </div>
                    </dl>
                  )}
                  <p className="mt-4 break-all text-xs leading-5 text-muted-foreground">{created.paymentUrl}</p>
                  <div className="mt-5 grid grid-cols-3 gap-2">
                    <Button variant="outline" className="gap-2" onClick={() => void copyLink()}>
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      <span className="hidden sm:inline">{copied ? "Copied" : "Copy"}</span>
                    </Button>
                    <Button variant="outline" className="gap-2" onClick={() => void shareLink()}>
                      <Share2 className="h-4 w-4" /> <span className="hidden sm:inline">Share</span>
                    </Button>
                    <Button asChild className="gap-2">
                      <Link href={`/pay/${created.slug}`}>
                        Open <ExternalLink className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

export default function PaymentLinksPage() {
  return <WalletProvider><PaymentLinksContent /></WalletProvider>;
}
