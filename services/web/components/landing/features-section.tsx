"use client";

import {
  Eye,
  Shield,
  Zap,
  DollarSign,
  Globe,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAnimateOnScroll } from "@/hooks/use-animate-on-scroll";

/* ───── Feature data ───── */
const FEATURES = [
  {
    icon: Eye,
    title: "Full Transparency",
    description:
      "See every fee, spread, and cost before you send. No hidden charges, no surprises.",
  },
  {
    icon: Shield,
    title: "Escrow Protection",
    description:
      "Optional programmatic escrow secures funds during transit with clear, automated rules.",
  },
  {
    icon: Zap,
    title: "Stellar Powered",
    description:
      "Built on Stellar for fast, low-cost cross-border settlements. Blockchain stays invisible to you.",
  },
  {
    icon: DollarSign,
    title: "Best Rate Finder",
    description:
      "Automatically compares anchors and routes to find the most cost-effective path for your money.",
  },
  {
    icon: Globe,
    title: "Americas Coverage",
    description:
      "Full support from the US and Canada through Central America to every major South American economy.",
  },
  {
    icon: FileText,
    title: "Proof of Payment",
    description:
      "Every transfer generates a verifiable, portable POP document backed by on-chain data.",
  },
];

export function FeaturesSection() {
  const { ref: featRef, isVisible: featVisible } =
    useAnimateOnScroll<HTMLDivElement>();

  return (
    <section
      id="features"
      className="relative overflow-x-hidden border-t border-border/30 px-5 py-16 sm:px-6 md:py-28 lg:py-36"
    >
      {/* Background */}
      <div
        className="pointer-events-none absolute inset-0 grid-pattern opacity-30"
        aria-hidden="true"
      />

      {/* ── Features ── */}
      <div ref={featRef} className="relative mx-auto max-w-6xl">
        <div
          className={cn(
            "mb-10 text-center transition-all duration-700 ease-pop sm:mb-16 md:mb-20",
            featVisible
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-8"
          )}
        >
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Why POP
          </p>
          <h2 className="text-balance text-2xl font-bold tracking-tight text-foreground sm:text-3xl md:text-4xl lg:text-5xl">
            Built for <span className="text-primary">trust</span> and{" "}
            <span className="text-primary">speed</span>
          </h2>
          <p className="mx-auto mt-5 max-w-lg text-pretty text-muted-foreground leading-relaxed">
            POP orchestrates anchors, routes, and verification so you can focus
            on sending money, not understanding infrastructure.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
          {FEATURES.map((feature, i) => (
            <div
              key={feature.title}
              className={cn(
                "group relative rounded-2xl border border-border/40 bg-card/30 backdrop-blur-sm p-7",
                "transition-all duration-500 ease-pop",
                "hover:border-primary/30 hover:bg-primary/[0.04] hover:-translate-y-2",
                "hover:shadow-[0_20px_50px_rgba(139,92,246,0.12)]",
                featVisible
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-10"
              )}
              style={{
                transitionDelay: featVisible ? `${i * 150}ms` : "0ms",
              }}
            >
              {/* Icon */}
              <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-all duration-300 ease-pop group-hover:bg-primary group-hover:text-primary-foreground group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-primary/25">
                <feature.icon className="h-5 w-5" />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-foreground">
                {feature.title}
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
