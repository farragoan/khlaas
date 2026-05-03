# 02 — Competitive Landscape & Positioning

_khlaas Strategy Suite · April 2026_

---

## Competitor Map

### Dimension 1: Depth of Split (How smart is the split?)

```
Low ─────────────────────────────────────────────── High
(everyone pays equally)               (per-item, exact split)

Tricount    Splitwise    Settle Up    Tab         khlaas
  │             │            │          │            │
  ▼             ▼            ▼          ▼            ▼
Manual      Receipt       Per-item   Per-item    Per-item OCR
equal       scanning      (native,   (native,    (web PWA,
split       total-only    manual)    manual)     auto-extracted)
```

**khlaas is alone in the top-right quadrant on web.** Tab is per-item but native-only (iOS/Android, no web, requires account). Settle Up is native-only and requires sequential selection (only one person claims at a time — not collaborative).

### Dimension 2: Collaboration (Can multiple people interact simultaneously?)

| App | Real-time collab | No account needed | Web-based |
|---|---|---|---|
| **khlaas** | ✅ | ✅ (V1) | ✅ |
| Splitwise | ❌ | ❌ | ✅ |
| Tricount | ❌ | ✅ | ✅ |
| Tab | ✅ | ❌ | ❌ |
| Settle Up | ❌ | ❌ | ❌ |
| Kittysplit | ❌ | ✅ | ✅ |

**khlaas is the only app with all three.** This is the differentiating triangle — real-time, accountless, web-native per-item splitting.

---

## Full Competitive Profiles

### Splitwise

- **Users:** ~50M registered, est. 8–12M MAU
- **Revenue:** ~$40–60M ARR (est.) from Splitwise Pro at $3.99/month or $39.99/year
- **Paid tier value prop:** Receipt scanning (total-only, not per-item), currency conversion, no ads, payment integrations
- **Moat:** Network effects — debt ledgers are bilateral. If you owe Alex $47, you and Alex both need Splitwise. Leaving costs both of you.
- **Weakness:** Product has stagnated. UI is cluttered. Per-item OCR is not in roadmap. No real-time collaboration. Largely ignores GCC/India markets.
- **Threat to khlaas:** If they ship per-item OCR and real-time collab within 18 months, khlaas's V1 differentiators disappear. However, their engineering culture is slow-moving and debt-ledger-focused.

### Tricount

- **Users:** ~10M downloads, popular in France/Europe
- **Moat:** Simplicity, no account needed, clean UX
- **Weakness:** No OCR, no per-item, no real-time. Manual entry only. Weak in Asia/GCC.
- **Threat:** Low — they compete on a different dimension (simplicity for longer trips, not restaurant moments).

### Tab

- **Users:** ~500K, iOS-first, US-focused
- **Moat:** Excellent per-item UX on native iOS. Integrates with Venmo/Apple Pay.
- **Weakness:** No Android, no web, requires account, US-only payments, not expanding.
- **Threat:** Moderate — if they go cross-platform, they could compete on features. Currently not.

### Settle Up

- **Users:** ~5M, popular in Eastern Europe, Czech-origin
- **Moat:** Long-running groups, offline-first, multi-currency
- **Weakness:** Sequential item claim (not collaborative), native only, no OCR for per-item
- **Threat:** Low — different primary use case (travel groups over months, not restaurant moments)

### Local/Regional Competitors

| Region | App | Risk |
|---|---|---|
| India | Paytm Split, PhonePe Groups | Payment super-apps could bolt on splitting — HIGH risk if UPI integration is gating |
| GCC | No dedicated local player | Low risk, open field |
| SEA | GrabPay groups, GoPay | Same super-app risk as India — MEDIUM |
| UK | Monzo bill splitting | Bank-native but account-required and total-only — LOW feature risk |

---

## khlaas's Moat Analysis

### Current Moat (V1): Weak but Defensible Short-Term

The per-item OCR + real-time web collaboration combination is genuinely differentiated. However, it is **replicable** — any funded competitor with 3–6 months of engineering time can rebuild this. This moat lasts 12–24 months, not 5 years.

**Verdict:** V1's moat is a window, not a wall.

### Future Moat (V2/V3): Where Real Defensibility Lives

The path to a durable moat follows Splitwise's playbook but in the restaurant moment:

**Step 1 (V1):** Win the "table moment" — be the app people open when the bill arrives. This is about UX speed, reliability, and the viral share link. No moat yet, just distribution.

**Step 2 (V2):** Convert "table moments" into "debt relationships." When user A and user B split three times, they have a running balance. Now leaving khlaas means losing history. **This is the moat switch.**

**Step 3 (V3):** Lock in groups. When a flat of 4 people creates a khlaas group for monthly expenses, all 4 are captive. Removing yourself from the group means the group needs to find a new app — and they won't.

**The moat is not the OCR. The moat is the running balance and the group.**

### Positioning Statement

> khlaas is the bill-splitting layer for the restaurant moment — the only app where everyone at the table claims their items simultaneously, in real-time, without creating an account. After dinner, khlaas becomes your split-money relationship manager.

---

## Strategic Threat Assessment

| Threat | Probability | Impact | Mitigation |
|---|---|---|---|
| Splitwise ships per-item OCR | Medium (18–24 months) | High on V1 | Accelerate V2/V3 lock-in before this happens |
| Tab goes cross-platform | Low | Medium | Not their strategic direction |
| Paytm/PhonePe build restaurant split | Medium | Very High for India | Win India quickly; build UPI settle integration |
| Google launches restaurant split in Google Pay | Low | Very High | Lobby for differentiation; ensure khlaas is on Android PWA |
| Funding gap forces feature freeze | High (bootstrapped) | High | Prioritize features that drive paid conversion, not just MAU |
