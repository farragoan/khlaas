# 04 — Customer Acquisition Strategy

_khlaas Strategy Suite · April 2026_

---

## The Fundamental CAC Insight

khlaas has a structural advantage that most consumer apps don't: **every use of the product generates a viral event.** When a host scans a receipt and shares the link, every person at the table who receives that link is a potential new user. This is a **built-in K-factor mechanism.**

The CAC target is $0. Not "low." Zero. Paid acquisition does not work for a bootstrapped split app — the ARPU is too low and the payback period too long. Every growth strategy below costs founder time, not money.

---

## The Viral Mechanics Audit

### Current Viral Loop (V1)

```
Host scans receipt
    │
    ▼
Host shares link (QR code / WhatsApp message)
    │
    ▼
Guest opens link → sees khlaas UX → claims their items
    │
    ▼
Guest is now a khlaas user (experienced the product)
    │
    ▼
Next time guest hosts a dinner → opens khlaas (not Splitwise)
```

**K-factor estimate:** If avg group size = 4 (1 host + 3 guests), and 30% of guests go on to host their own split within 30 days, K ≈ 0.9. This is below 1 (not self-sustaining virality) but close enough that improving it slightly (better onboarding, better share UX) tips it above 1.

**To reach K > 1, you need only one of:**
- Avg group size > 3.4 guests who convert to hosts (or)
- Guest → host conversion > 33% (or)
- One guest hosts two subsequent splits

### Viral Loop Enhancements

**Enhancement 1: "Settle with khlaas" on the share card**
The share card (already built: post-scan share sheet with QR code) should say **"khlaas — split the bill, not the friendship"** in a memorable tagline. Every WhatsApp forward of this card is an organic impression.

**Enhancement 2: Settle screen attribution**
When a guest opens a share link, the first screen says "Arjun used khlaas to split this bill with you." This names a real mutual friend — highest possible trust signal. No ad can match this.

**Enhancement 3: "You saved X minutes" on the settle screen**
After settling, show: "This bill would have taken 8 minutes to split manually. It took khlaas 23 seconds." This creates a shareable boast moment and reinforces product value.

**Enhancement 4: "Start your own split" CTA after claiming items**
Every guest who has claimed their items sees a prominent CTA: "Next time you're the host — tap here." This is a one-tap registration into the V2 waitlist / account creation. If 20% of guests tap this, host-conversion rises significantly.

---

## Channel Strategy by Phase

### Phase 1 (Months 1–6): Zero-cost seeding

**Target:** 10,000 MAU

**Tactic 1: Personal seeding in restaurants**
Founders eat out in groups. Every dinner is a demo. Every person at the table is a user. Target 10 dinners/month, avg 4 people → 40 first-time users/month from founder use alone.

**Tactic 2: University / hostel seeding (India priority)**
Indian college students split bills constantly. A single WhatsApp group in a college hostel floor with 40 students, if one student introduces khlaas, can generate 40 MAU. Target top engineering colleges (IITs, NITs, BITS) and business schools (IIMs). Send personal emails to college food-culture communities, food bloggers in college groups. Cost: $0.

**Tactic 3: Dubai expat communities (GCC priority)**
Dubai has dense expat community WhatsApp groups organized by nationality (Indian expats, Pakistani expats, Filipino expats, UK expats). These groups share dining recommendations and bill-splitting is a constant topic. One post by a community member in a 500-person group = 500 impressions. Find the moderators of 20 such groups. Cost: $0.

**Tactic 4: Reddit / Discord seeding**
Communities: r/india, r/mumbai, r/bangalore, r/dubai, r/saudiexpats, r/frugal, r/personalfinance_india. Post a genuine "I built this" post, not an ad. These communities respond well to bootstrapped founders. Example: "I got tired of calculating everyone's share at dinner so I built khlaas." 

**Tactic 5: Product Hunt launch**
A well-executed Product Hunt launch (real-time bill splitting demo GIF, clear differentiation from Splitwise) can generate 5,000–15,000 visitors in 48 hours. Schedule for when V1 is polished with the QR share flow working.

---

### Phase 2 (Months 6–18): Community and content

**Target:** 100,000 MAU

**Tactic 6: WhatsApp Group strategy (India)**
WhatsApp is the dominant social layer in India. A single WhatsApp forward from a trusted friend has more conversion power than any Meta ad. Build a "Refer and earn" mechanic: "Invite a friend → you both get 1 month of khlaas Pro free (when Pro launches)." This turns every user into a WhatsApp broadcaster.

**Tactic 7: Instagram/TikTok / Reels content**
Content theme: "The awkward bill moment" — the universal experience of 6 people staring at a restaurant bill. Create short videos showing the before/after. This genre of content (awkward social situations → tech solution) performs well organically. Target creators in India (10K–100K followers in food/lifestyle) with affiliate partnerships: "Use my code FOODIE10 for 2 months Pro free."

**Tactic 8: Restaurant partnerships (early B2B seeding, free)**
Approach 5–10 popular restaurants in Dubai / Bangalore and offer to display a "Split with khlaas" QR code on their bill presenter (the folder the check comes in). Free for the restaurant — they get a tech-forward image, khlaas gets placement at the point of maximum relevance. Do not charge for this in Phase 2 — this is distribution, not revenue.

**Tactic 9: App Store optimization (V4 Expo launch)**
When the React Native app launches (V4), App Store and Play Store organic discovery becomes available. Optimize for keywords: "bill splitting," "restaurant bill split," "split bill friends," "divide bill app." These keywords have high intent and lower competition than "expense sharing."

**Tactic 10: Travel blogger / influencer seeding**
Travel bloggers constantly write about splitting costs in groups. A "how I split bills with my travel group" post with a khlaas mention is highly credible, often ranks on Google, and is evergreen. Reach out to 20 travel bloggers in India, UAE, and UK with a free Pro account and a simple ask: "Mention us if you use it and love it."

---

### Phase 3 (Months 18–36): SEO and paid experiments

**Target:** 500,000+ MAU

**Tactic 11: SEO content strategy**
Target long-tail queries:
- "how to split bill at restaurant app" (high intent)
- "splitwise alternative" (conquest)
- "split bill without account" (differentiator)
- "restaurant bill split calculator" (tool intent)
- "تقسيم الفاتورة" (Arabic: "bill splitting") — very low competition, high relevance for GCC

Build 20–30 landing pages optimized for these queries. Each page is 500 words + a demo embed. Cost: writing time only.

**Tactic 12: Micro-influencer paid pilots ($500–$2K/month)**
Only test paid influencer spend after organic channels are working. If a channel is working organically, paid amplification of the same channel (boosted posts, sponsored versions of organic-style content) has positive ROI. Never buy banner ads or display.

---

## Retention Strategy

Acquisition without retention is a leaky bucket. Key retention levers:

### Retention Lever 1: The First 3 Splits
Users who complete 3 bill splits are 4× more likely to return than users who complete 1. Design onboarding to manufacture a second and third split quickly:
- After first split: "Save your group for next time" (prompt to create V2 account)
- After second split: Show running balance ("You and Maya have split 2 bills — you owe her ₹204 total")
- After third split: Unlock khlaas Pro 1-month free trial

### Retention Lever 2: Push Notifications / WhatsApp Reminders
"Arjun settled his share from Friday's dinner — tap to check your balance." This reminder brings users back into the app at a high-intent moment. Requires V2 accounts. Plan web push (service worker) + optional WhatsApp Business API notifications.

### Retention Lever 3: Monthly "Your splits" recap
Monthly email: "In April, you split 4 bills totaling ₹3,847. Your most-split-with friend is Arjun (₹1,204)." This is the Spotify Wrapped pattern — shareable, ego-flattering, and it surfaces the product's value. Build this for V2.

### Retention Lever 4: Debt shame (the Splitwise secret weapon)
The running balance feature ("You owe Arjun ₹847 across 3 bills") creates psychological pull to open the app and settle. This is not manipulation — it is genuine utility. But it works because money has emotional weight. Build running balances as early in V2 as possible.

---

## CAC/LTV Model

| User Type | CAC | Paid conversion | Monthly ARPU | LTV (18-month) | LTV/CAC |
|---|---|---|---|---|---|
| India organic | $0 | 12% | $1.50 | $3.24 | ∞ |
| GCC organic | $0 | 20% | $4.50 | $16.20 | ∞ |
| UK organic | $0 | 15% | $3.99 | $10.77 | ∞ |
| India influencer-paid | $0.30 | 12% | $1.50 | $3.24 | 10.8× |
| GCC influencer-paid | $0.80 | 20% | $4.50 | $16.20 | 20.3× |

> Even at modest conversion rates, organic CAC gives infinite LTV/CAC. The influencer channel in GCC (high ARPU, moderate CAC) is the best paid experiment when you're ready.
