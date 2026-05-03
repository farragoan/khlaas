# 03 — Monetization & Regional Pricing

_khlaas Strategy Suite · April 2026_

---

## The Three Approaches: Analysis

The three monetization approaches under consideration are evaluated below. The recommendation is to **sequence all three**, not choose one.

### Approach A: Freemium Subscription (Splitwise Model)

**Mechanism:** Free tier has all core features. A paid tier ("khlaas Pro") unlocks history, analytics, groups, or removes limits.

**Pros:**
- Proven model with demonstrated conversion rates (Splitwise ~10–15% paid)
- Predictable recurring revenue (SaaS economics)
- Aligns with V2/V3 roadmap (history + groups are natural paid features)

**Cons:**
- Requires large MAU base before meaningful ARR (dead valley period of 12–18 months)
- Hard to justify subscription in V1 (ephemeral splits have no history value)
- What do you gate? Getting this wrong either kills conversions or kills usage.

**Verdict:** Best long-term model. **Start here for V2.**

---

### Approach B: Pay-Per-Scan (Metered OCR)

**Mechanism:** Each receipt scan costs a small fee ($0.10–$0.50) or credits system. Free tier gets N scans/month.

**Pros:**
- Monetizes from day one without needing large user base
- Scales directly with value delivered (each scan is real utility)
- Low friction at low volumes — tourist, occasional users pay fairly

**Cons:**
- Kills viral mechanics. If the host pays per scan, they resent the people who don't pay. Group dynamics break.
- Users will avoid the scan and do it manually (defeating the product's core UX)
- Difficult to explain value proposition at point of payment ("why am I paying to split a bill?")
- Terrible for group network effects — hosts become reluctant to initiate

**Verdict:** Do NOT monetize at the scan level for consumers. OCR must be free or it kills the funnel. However, **metered OCR scans are a viable B2B pricing component** (see Approach C).

---

### Approach C: B2B — Restaurant/Venue Integration

**Mechanism:** Restaurants pay khlaas to provide a white-labeled or co-branded splitting experience. Integration options: QR code on bill → khlaas page, API integration with POS systems, or embedded widget.

**Pros:**
- Revenue without impacting consumer free tier
- Restaurant is motivated: faster table turns, better customer experience, no awkward "who's paying?" moment
- Can include advertising (restaurant promotes their app via khlaas post-split screen)
- Scalable in GCC where large restaurant groups (Emaar hospitality, etc.) operate many venues

**Cons:**
- Long enterprise sales cycles
- Requires account management, custom integrations, SLAs
- Not bootstrapper-friendly in early stages
- POS integrations are technically complex (each system is different)

**Verdict:** Strong V3 revenue multiplier. **Begin B2B pilots in year 2 with large chains only.**

---

## Recommended Monetization Sequence

```
V1 (months 1–6)          V2 (months 6–18)         V3 (months 18–36)
────────────────         ────────────────────────  ─────────────────────────
Free, all features       khlaas Pro subscription   B2B restaurant tier
Build MAU               Convert to paid            Multiply ARPU
No monetization yet     $1.49–$4.99/month          $50–$500/month per venue
                         regional pricing           + enterprise contracts
```

**Do not chase revenue in V1.** The OCR is cheap (free tier covers it). The cost of a user who splits 3 times and converts to V2 is worth more than $0.10 per scan. Optimize for conversion events, not per-scan extraction.

---

## What to Gate in khlaas Pro

Gating must not break the core flow — the collaborative restaurant split must always be free. Gate **the accumulation of value over time**, not the moment of use.

### Free Forever
- Unlimited bill splits (the core moment)
- OCR receipt scanning
- Real-time collaboration
- Shareable link / QR code
- Settle-up ledger (per-bill)
- Up to 3 months of history

### khlaas Pro (Paid)
- **Unlimited history** (free users see last 3 months only)
- **Groups** (free users can participate in groups but not create them)
- **Running balances** ("You and Arjun have settled $0 of your $147 total")
- **Export to CSV / PDF** (expense reports, for freelancers / business travel)
- **Bill analytics** (spending by category, by person, by venue)
- **Priority support**
- **Multi-currency per group** (free: one currency per bill)
- **Custom tip defaults** (saved preferences)
- **No branding** (remove "Split with khlaas" from share cards — pro users get clean exports)

> **Why this gating works:** Every feature behind Pro is a V2/V3 feature — khlaas isn't removing something from V1, it's selling the future. Users upgrade when they realize they want to keep their history. This creates natural upgrade moments.

---

## Regional Pricing Strategy

Price is not a product decision — it is a market signal. The same product can be priced very differently across markets because willingness-to-pay and purchasing power differ by 5–10×.

### Pricing Framework

Use **Purchasing Power Parity (PPP)-adjusted pricing**, anchored to Splitwise Pro as a ceiling in developed markets and 40–60% below in emerging markets.

| Market | Monthly (Pro) | Annual (Pro) | Rationale |
|---|---|---|---|
| **UAE / GCC** | $4.99 | $39.99 | Highest ARPU opportunity. Expat-heavy. Brand resonance. Treat as premium market. |
| **UK / Ireland** | $3.99 | $31.99 | Match Splitwise. Undercut by positioning (web, per-item, modern UX). |
| **Singapore** | SGD 4.99 (~$3.70) | SGD 39.99 | Strong digital economy. High willingness-to-pay for utility apps. |
| **Malaysia** | MYR 9.99 (~$2.10) | MYR 79.99 | Mid-tier. Match local streaming service benchmarks (Netflix MY ~$10/mo). |
| **India (Tier 1)** | ₹149 (~$1.80) | ₹999 (~$12) | Critical: price at YouTube Premium India / Spotify India level. ₹99 is "impulse", ₹149 is "considered". |
| **India (Tier 2/3)** | ₹99 (~$1.20) | ₹699 (~$8.40) | Use geo-IP + payment method to segment. UPI users get Tier 2 pricing. |
| **Thailand** | THB 69 (~$2.00) | THB 549 | Similar to Malaysia tier. |
| **Saudi Arabia** | SAR 19.99 (~$5.33) | SAR 149.99 | Premium market, Vision 2030 digital adoption tailwind. |

> **Implementation note:** Use Stripe's built-in regional pricing (or Lemon Squeezy for simpler tax handling). Detect market from billing address, not IP. Offer annual at ~33% discount to push LTV.

### India Pricing: Special Considerations

India is the highest-volume, lowest-ARPU market. The correct India strategy is:

1. **Never charge in dollars.** Indian users abandon checkouts with foreign currency pricing at a 60–70% higher rate than INR pricing.
2. **Accept UPI.** Razorpay or Cashfree for Indian payments — Stripe support for UPI is still unreliable. UPI penetration in Tier 1 cities is >85%.
3. **Family plan:** ₹249/month for up to 5 family members sharing one Pro subscription. Indian consumers think in family units.
4. **Annual heavily discounted:** ₹699/year (vs ₹149×12 = ₹1,788) — 60% discount. Indian consumers strongly prefer annual commitments when deeply discounted. Reduces churn.
5. **Student pricing:** ₹49/month with student email verification. Students are the highest-propensity viral spreaders — getting a college hostel onto khlaas creates 50+ users from one convert.

### GCC Pricing: Special Considerations

1. **No VAT complexity (UAE, Bahrain).** Saudi Arabia has 15% VAT — include it in displayed price.
2. **Arabic localization is mandatory before monetizing GCC.** A user who sees an English-only checkout will not pay. khlaas needs RTL layout, Arabic UI copy, and Arabic-language support before charging GCC users.
3. **Google Play Billing / Apple In-App Purchases** are the dominant payment rails in GCC — Stripe adoption is lower. Consider whether the mobile app (V4) launches before or alongside monetization in this market.
4. **Premium positioning is viable:** GCC users pay for food delivery apps, streaming, and cloud storage without friction. khlaas Pro at $4.99/month is not a stretch for a UAE professional.

---

## Revenue Projections by Region

Assuming Y2 (2027) with 300K MAU and 15% paid conversion (45K paid users):

| Region | Paid users | Monthly ARPU | Monthly revenue |
|---|---|---|---|
| India | 25,000 | $1.50 | $37,500 |
| GCC | 8,000 | $4.50 | $36,000 |
| SEA | 7,000 | $2.50 | $17,500 |
| UK | 5,000 | $3.99 | $19,950 |
| **Total** | **45,000** | **~$2.45 blended** | **~$111,000/mo → $1.33M ARR** |

Y3 B2B addition (50 restaurant venue contracts at avg $200/month): **+$120K ARR → $1.45M total ARR**

---

## Anti-Patterns to Avoid

**Do not add ads.** Bill-splitting is a trust-sensitive social interaction. A banner ad during "who owes what" destroys the premium perception and signal that money is being extracted from the social moment. Splitwise added ads and their reviews tanked.

**Do not gate the core split.** The collaborative table moment must be free forever. Any paywall before settling kills virality.

**Do not gate "invite friends."** The invite link is your primary distribution channel. Never put Pro behind a paywall for the person receiving the link.

**Do not launch paid tier in V1.** With no history, no groups, and no running balances, there is nothing to sell that users will pay for. Build the value first.
