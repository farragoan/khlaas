# 05 — Roadmap & Value Creation

_khlaas Strategy Suite · April 2026_

---

## The Value Creation Framework

Every feature on the roadmap should be evaluated against three questions:

1. **Does it increase the K-factor?** (More users invite more users)
2. **Does it increase conversion to paid?** (MAU → paid subscriber)
3. **Does it increase switching costs?** (Users can't leave without losing something)

Features that answer "no" to all three are deferred. Features that answer "yes" to two or more are prioritized regardless of technical complexity.

---

## Current State Assessment (V1 — April 2026)

### What's shipped and working:
- ✅ OCR receipt scanning (Google AI / Gemma fallback)
- ✅ Real-time collaborative item selection (polling, ElectricSQL not yet live)
- ✅ Per-item ledger computation with fee distribution
- ✅ Clerk Auth (optional guest flow)
- ✅ Post-scan share sheet with QR code
- ✅ Currency & locale support
- ✅ Payments, tip, settlement detail
- ✅ Split edit mode (host can reopen)
- ✅ Netlify deployment

### What's missing before V1 is "launch-ready":
- ❌ Rate limiting (Upstash Redis) — **security blocker**
- ❌ Async OCR (currently times out on large receipts) — **reliability blocker**
- ❌ Manual item editing (OCR errors block UX) — **UX blocker**
- ❌ ElectricSQL real-time (currently 2s polling) — **experience gap**
- ❌ R2 image storage (currently base64 in body) — **scale blocker**

**Recommendation: Do not launch publicly until the three blockers above are resolved.** A bad first experience in the restaurant (OCR timeout, can't fix a wrong item) will kill word-of-mouth. Launch small and clean.

---

## Revised Roadmap (Value-Creation Prioritized)

### Phase 0: Pre-Launch Hardening (4–6 weeks)

**Goal:** Make the V1 experience bulletproof for 1,000 users.

| Feature | K-factor | Paid conv. | Switching cost | Priority |
|---|---|---|---|---|
| Rate limiting (Upstash) | — | — | — | P0: security |
| Async OCR (Background Functions) | ↑ (reliability) | ↑ | — | P0: reliability |
| Manual item edit (add/edit/delete) | ↑ (host confidence) | — | — | P0: UX |
| Retry logic on Google AI calls | ↑ | — | — | P0: reliability |
| ElectricSQL real-time | ↑ (wow moment) | — | — | P1 |
| R2 image storage | — | — | — | P1 (scale) |

---

### Phase 1: V1 Public Launch + Viral Optimization (Months 1–3)

**Goal:** Get to 10,000 MAU via organic virality. Optimize the share loop.

| Feature | Why | Value driver |
|---|---|---|
| "You saved X minutes" on settle screen | Shareworthy moment. Users screenshot and share. | K-factor ↑ |
| "Start your own split" guest CTA | Every guest becomes a potential host. | K-factor ↑↑ |
| Share card with bill summary (OG image) | WhatsApp-optimized share card → beautiful preview. | K-factor ↑ |
| Deep link per person ("Dhruv, you owe ₹304") | Personalized nudge → higher claim rate → host has better experience | K-factor ↑ |
| Expiry enforcement + tombstone page | Clean up abandoned tables. Drives urgency ("settle before it expires"). | UX |
| Arabic localization (RTL, UI copy) | Unlocks GCC market (brand-name resonance, no UX without this). | Market unlock ↑↑↑ |

**Arabic localization is non-negotiable for GCC.** Without it, the product name resonates but the product doesn't work for native Arabic speakers. This is the highest-leverage single investment for GCC growth.

---

### Phase 2: V2 — Account, History & The Debt Relationship (Months 3–9)

**Goal:** Convert casual users to sticky users. Build the moat.

This is where khlaas transitions from "app I used once" to "app I need."

| Feature | Why | Value driver |
|---|---|---|
| User accounts (Clerk, already scaffolded) | Required for history, running balances, groups | Switching cost ↑ |
| Bill history (last 12 months) | Gating point for Pro. Free users see 3 months. | Paid conv. ↑↑ |
| Running balance per contact | "You and Arjun owe each other $47" — the debt moat. | Switching cost ↑↑↑ |
| Cross-bill debt simplification | "Settle all your balances in one go" — Pro feature. | Paid conv. ↑ |
| Push notifications (web push) | "Arjun settled. Check your balance." → re-engagement | Retention ↑↑ |
| Monthly recap email | "Your April: 4 splits, ₹3,847 total" — shareable, Spotify Wrapped-style | K-factor ↑ |
| khlaas Pro launch (regional pricing) | Revenue. Gate history, groups, analytics. | Revenue ↑↑↑ |
| Export to CSV/PDF | Business travelers, freelancers → B2B adjacent use case | Paid conv. ↑ |

**The Pro launch moment:** Launch khlaas Pro after running balances are live — not before. The moment a user sees "You owe Arjun ₹847 across 3 bills" is the moment they understand why they'd pay for khlaas Pro. Without running balances, there is no answer to "what am I paying for?"

---

### Phase 3: V3 — Groups & Long-Running Relationships (Months 9–18)

**Goal:** Become the Splitwise replacement for users who know khlaas from restaurants.

| Feature | Why | Value driver |
|---|---|---|
| Named groups (flat, travel, team) | Splitwise core use case. Users with groups can't leave. | Switching cost ↑↑↑ |
| Group running balance | "The flat owes £340 in utilities this month" | Switching cost ↑↑↑ |
| Recurring split templates | "Every month: rent £800 → split 4 ways" | Retention ↑↑ |
| Group invite link | One-tap group join → new users land in a group context | K-factor ↑ |
| UPI settle integration (India) | Close the loop. Khlaas calculates, UPI pays. | Conversion ↑↑ |
| WhatsApp/Apple Pay settle intents (GCC/UK) | Same. Settle within the app ecosystem. | Conversion ↑↑ |
| B2B restaurant QR program | Revenue stream 2. Restaurants embed khlaas on bill. | Revenue ↑↑ |

**Payment integration is the endgame.** Every bill-splitting app that has integrated with real payment rails (Venmo, UPI, Apple Pay) has seen a step-change in engagement and retention. The settle button that actually moves money is 10× more satisfying than a ledger entry. For India, UPI integration is technically straightforward and transformative.

---

### Phase 4: V4 — Mobile App (Months 18–30)

**Goal:** Win the moments when a browser isn't open. Own the home screen.

The Expo/React Native app (already planned in RESEARCH.md) is not just about native UX — it is about **notification access and home screen real estate.**

A PWA on the home screen on iOS is still second-class (no push notifications before iOS 16.4, limited background). A native app gets:
- Push notifications (debt reminders, settle alerts) — critical for retention
- Camera access without browser permission dialogs — critical for OCR UX
- Lock screen widgets ("You owe 3 people a total of ₹1,204") — ambient reminder
- App Store/Play Store discovery — new acquisition channel

**V4 should launch after V3's group and running balance features are stable** — there's nothing to push-notify about in V1/V2 that justifies the native app investment.

---

## Feature Prioritization Matrix

```
                    HIGH VALUE CREATION
                           │
          [Arabic RTL]     │     [Running balances]
          [Guest → host    │     [Groups]
           CTA]            │     [UPI integration]
                           │
HIGH ─────────────────────────────────────────── LOW
EFFORT                     │                  EFFORT
          [ElectricSQL]    │     [Monthly recap email]
          [V4 native app]  │     [Settle card share]
                           │     ["Saved X minutes"]
                           │
                    LOW VALUE CREATION
```

**Top-right quadrant (high value, low effort) = ship immediately:**
- "Start your own split" guest CTA
- "Saved X minutes" on settle screen  
- Monthly recap email
- Share card OG image

**Top-left quadrant (high value, high effort) = plan carefully:**
- Arabic RTL localization
- Running balances (requires V2 accounts)
- Groups (requires V3 schema)
- UPI integration

---

## Metrics Framework

Track these metrics by cohort (week of first use), not in aggregate:

| Metric | Target | What it tells you |
|---|---|---|
| K-factor (invites / host) | > 1.0 | Is the viral loop working? |
| Guest → host rate (30-day) | > 30% | Are guests becoming power users? |
| 3-split retention rate | > 40% | Are users becoming habit-users? |
| V1 → V2 account creation rate | > 25% | Is history valuable enough to register? |
| Free → Pro conversion rate | > 15% | Is the paywall in the right place? |
| Monthly churn (Pro) | < 5% | Is the product valuable enough to keep paying for? |
| NPS (quarterly survey) | > 50 | Would users recommend? |

---

## Risk: The "Good Enough" Problem

The biggest strategic risk for khlaas is not competition — it is user inertia. "WhatsApp splitting" (someone calculates manually and posts in the group chat) is deeply habitual and "good enough" for most people. khlaas needs to be dramatically better at the table moment to displace a habit.

**Mitigation:** Ensure the time from "tap share link" to "everyone has claimed their items" is under 90 seconds for a 4-person table. This is the golden metric for V1. If it takes 5 minutes, habit wins. If it takes 90 seconds, khlaas wins.

Time the flow in real restaurants. Optimize ruthlessly. Every second of friction at the table is a reason someone defaults back to WhatsApp group calculation.
