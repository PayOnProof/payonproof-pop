"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Building2,
  Check,
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  Share2,
  Wallet,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { PopHeader } from "@/components/pop-header";
import { GradientMesh } from "@/components/gradient-mesh";
import { CountrySelector } from "@/components/country-selector";
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
import { fetchAnchorCountries, fetchOperationalAnchors } from "@/lib/anchors-api";
import type { AnchorCatalogOption, AnchorCountry } from "@/lib/types";
import {
  createPaymentLink,
  type PaymentLink,
  type PaymentLinkNetwork,
} from "@/lib/payment-links-api";

const STORAGE_KEY = "pop_payment_link_management";

function PaymentLinksContent() {
  const { address, status, connect } = useWallet();
  const [network, setNetwork] = useState<PaymentLinkNetwork>("testnet");
  const [countries, setCountries] = useState<AnchorCountry[]>([]);
  const [anchors, setAnchors] = useState<AnchorCatalogOption[]>([]);
  const [destinationCountry, setDestinationCountry] = useState("");
  const [destinationAnchorId, setDestinationAnchorId] = useState("");
  const [amount, setAmount] = useState("");
  const [recipientLabel, setRecipientLabel] = useState("");
  const [description, setDescription] = useState("");
  const [expiresInHours, setExpiresInHours] = useState("72");
  const [created, setCreated] = useState<PaymentLink | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadingOptions(true);
    setError(null);
    Promise.all([
      fetchAnchorCountries(network),
      fetchOperationalAnchors({ network, type: "off-ramp" }),
    ])
      .then(([countryItems, anchorItems]) => {
        if (cancelled) return;
        setCountries(countryItems.filter((country) => country.offRampCount > 0));
        setAnchors(
          anchorItems.filter(
            (anchor) => anchor.sep.sep10 && anchor.sep.sep24 && anchor.operational
          )
        );
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Could not load anchors");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingOptions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [network]);

  useEffect(() => {
    if (!countries.length) return;
    if (!countries.some((country) => country.code === destinationCountry)) {
      setDestinationCountry(countries[0].code);
    }
  }, [countries, destinationCountry]);

  const availableAnchors = useMemo(() => {
    const matching = anchors
      .filter(
        (anchor) =>
          anchor.country === destinationCountry || anchor.country === "ZZ"
      )
      .sort((left, right) => {
        const leftExact = left.country === destinationCountry ? 0 : 1;
        const rightExact = right.country === destinationCountry ? 0 : 1;
        return leftExact - rightExact;
      });
    const unique = new Map<string, AnchorCatalogOption>();
    for (const anchor of matching) {
      const key = `${anchor.domain}:${anchor.currency}`;
      if (!unique.has(key)) unique.set(key, anchor);
    }
    return [...unique.values()];
  }, [anchors, destinationCountry]);

  useEffect(() => {
    if (!availableAnchors.some((anchor) => anchor.id === destinationAnchorId)) {
      setDestinationAnchorId(availableAnchors[0]?.id ?? "");
    }
  }, [availableAnchors, destinationAnchorId]);

  const selectedAnchor = availableAnchors.find(
    (anchor) => anchor.id === destinationAnchorId
  );
  const canCreate = Boolean(
    address &&
      selectedAnchor &&
      destinationCountry &&
      Number(amount) > 0 &&
      !loading
  );

  async function handleCreate() {
    if (!address || !selectedAnchor) return;
    setLoading(true);
    setError(null);
    try {
      const result = await createPaymentLink({
        network,
        recipientAccount: address,
        recipientLabel: recipientLabel.trim() || undefined,
        destinationCountry,
        destinationAnchorId: selectedAnchor.id,
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
        text: `Pay ${created.amount} ${created.assetCode} through ${created.destinationAnchorName}`,
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
          <p className="mb-2 text-sm font-semibold text-primary">Receive money</p>
          <h1 className="text-3xl font-bold text-foreground">Create an anchor payment link</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Choose where the payment should arrive. The payer completes the selected
            anchor flow, and POP verifies the final Stellar settlement.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <section className="border border-border bg-card p-5 sm:p-6">
            {status !== "connected" || !address ? (
              <div className="flex min-h-64 flex-col items-center justify-center text-center">
                <Wallet className="mb-4 h-8 w-8 text-primary" />
                <h2 className="text-lg font-semibold">Connect the request owner wallet</h2>
                <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                  This wallet identifies who created the request. Settlement is handled by
                  the destination anchor you select.
                </p>
                <Button className="mt-5 gap-2" onClick={() => void connect("freighter")}>
                  <Wallet className="h-4 w-4" /> Connect Freighter
                </Button>
              </div>
            ) : (
              <div className="space-y-5">
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

                <CountrySelector
                  countries={countries}
                  value={destinationCountry}
                  onValueChange={setDestinationCountry}
                  label="Receive in"
                />

                <div className="space-y-2">
                  <Label>Receiving anchor</Label>
                  <Select
                    value={destinationAnchorId}
                    onValueChange={setDestinationAnchorId}
                    disabled={loadingOptions || availableAnchors.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={loadingOptions ? "Loading anchors" : "Select anchor"} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableAnchors.map((anchor) => (
                        <SelectItem key={anchor.id} value={anchor.id}>
                          {anchor.name} · {anchor.currency}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!loadingOptions && availableAnchors.length === 0 && (
                    <p className="text-xs text-destructive">No operational off-ramp anchor is available.</p>
                  )}
                </div>

                {selectedAnchor && (
                  <div className="flex items-center justify-between border border-border bg-muted/20 p-3 text-sm">
                    <span className="flex items-center gap-2 font-medium">
                      <Building2 className="h-4 w-4 text-primary" /> {selectedAnchor.name}
                    </span>
                    <span className="text-xs uppercase text-muted-foreground">
                      {selectedAnchor.network} · {selectedAnchor.currency}
                    </span>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="amount">Requested transfer amount</Label>
                  <Input
                    id="amount"
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    step="0.01"
                    placeholder="50"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    The final amount received is shown to the payer after anchor fees and FX.
                  </p>
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
                <div className="mb-5 flex items-center gap-2 text-sm font-semibold text-success">
                  <Check className="h-4 w-4" /> Anchor request ready
                </div>
                <div className="mb-4 space-y-1 text-sm">
                  <p className="font-semibold">{created.destinationAnchorName}</p>
                  <p className="text-muted-foreground">
                    {created.destinationCountry} · {created.assetCode} · {created.network}
                  </p>
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
                <h2 className="font-semibold">Your anchor QR appears here</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  It opens the payment request with the destination anchor already selected.
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
