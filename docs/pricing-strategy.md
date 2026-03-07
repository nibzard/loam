# Pricing Strategy And Unit Economics

Research date: March 7, 2026

This document reflects the stricter pricing rule:

- `loam` should not allow any normal plan shape where variable cost can exceed subscription revenue
- videos should default to `private`
- external sharing should be explicit
- public / guest usage needs both a `soft per-video cap` and a `hard workspace cap`

Related background:

- [Deployment Cost Research](/home/niko/lawn/docs/deployment-costs.md)

## Executive Summary

`loam` should position itself as:

- the flat-price async video workspace for teams
- built for screen recordings, walkthroughs, bug reports, and video feedback
- private by default
- open source, hosted, fast, and simple
- not a per-user recorder
- not an AI workplace suite
- not a polished creator editing studio

## Hard Truth

If you want to guarantee that variable costs never exceed subscription revenue, then this is **not** safe:

- `Pro $49/mo`
- `1TB storage`
- truly unlimited internal playback
- large public sharing allowance

Why:

- raw storage costs money
- Mux hosted video storage costs money
- every delivered minute costs money
- if internal playback is literally unlimited, there is no mathematical ceiling on delivery cost

That means a strict anti-negative-margin strategy requires:

1. a hard workspace cap on all guest playback
2. a softer per-video cap to prevent one link from dominating usage
3. either an explicit account-level internal fair-use budget or a more conservative storage / price combination

## Monthly vs. Yearly Model

For loam, annual billing is a **good business lever**, not a core pricing change.

Recommended structure:

- Keep the same plan definitions (`Starter`, `Pro`) for both cadences.
- Keep all limits, seats, and caps identical across monthly and yearly.
- Use true yearly Stripe price IDs for a genuine annual offering.
- Start with a ~20% annual discount to match competitive pull.

Recommended public rates from current strategy:

| Plan | Monthly | Yearly |
| --- | --- | --- |
| Starter | $15/month | $144/year |
| Pro | $49/month | $468/year |

Notes:

- Yearly is simply a billing cadence benefit, not a different product contract.
- Annual should remain optional and clearly marked as such.
- If a workspace opts into annual at signup, it should be treated as a committed cohort for renewal forecasting and support prioritization.

### What to track

- Churn by cohort (`monthly` vs `annual`)
- Annual conversion rate (how many active monthly teams switch to annual)
- Net Monthly Recurring Revenue retention
- Support load per workspace by billing cadence
- Gross margin impact by plan and cadence

### Why this is aligned with margins

- Monthly billing gives flexibility and faster price adjustment.
- Annual billing lowers payment friction and raises short-term cash.
- Annual can increase average contract value if users stay in plan, but it must not relax usage guardrails:
  - guest soft/hard caps
  - account-level member fair-use
  - private-by-default behavior

## Competitive Context

As of March 7, 2026:

- Loom is broad workplace video with per-user pricing
- Tella is polished recording/editing with per-user pricing
- Cap is open-source with local-first / cloud add-on positioning

Official competitor links used:

- Loom home: <https://www.loom.com/>
- Loom pricing: <https://www.loom.com/pricing>
- Tella home: <https://www.tella.com/>
- Tella pricing: <https://www.tella.com/pricing>
- Cap home: <https://cap.so/>
- Cap pricing: <https://cap.so/pricing>

## Positioning

Do not position `loam` as:

- “Loom, but cheaper”
- “Tella, but open source”
- “Cap, but hosted”

Position it as:

- the cheapest hosted async video workspace for teams
- private workspace first, optional external sharing second
- optimized for upload, share, watch, reply
- flat team pricing with no seat tax

### Core Message

`loam` is the flat-price async video workspace for teams sharing screen recordings, walkthroughs, bug reports, and video feedback.

## Why Private By Default Is Correct

The expected view distribution is power-law shaped.

Most videos will get:

- one or two viewers
- a few repeat reference views
- very low long-tail activity

The risky outliers are:

- public watch links
- broadly shared client links
- videos reused like public documentation

That means the main cost risk is not “all videos.” It is a small number of externally shared videos creating most delivery volume.

So the default should be:

- every video starts `private`
- external access requires an explicit share action
- restricted share links are the default external sharing path
- public watch pages are optional and secondary

## Recommended Public Plans

These are the recommended public plans if you want to stay close to the original simple `lawn` pricing spirit while keeping cost risk bounded.

| Plan | Monthly | Yearly | Storage | Guest soft cap per video / month | Guest hard cap per workspace / month | Member fair-use per workspace / month |
| --- | --- | --- | --- | --- | --- | --- |
| Starter | `$15/mo` | `$12/mo` billed annually | `100GB` | `25` | `1,000` | `3,000` soft / `4,000` hard member watch minutes |
| Pro | `$49/mo` | `$39/mo` billed annually | `500GB` | `100` | `3,000` | `8,000` soft / `10,000` hard member watch minutes |

Notes:

- no public `Business` plan for now
- if an account regularly outgrows Pro, handle it manually until enough data exists for a third tier
- `500GB` on Pro is deliberate; `1TB` at `$49` is too exposed if you want hard cost control
- the member fair-use budgets are sized to stay safe on yearly billing at the discounted price as well

## Why These Caps

### Soft Per-Video Cap

The soft cap is there to stop one public link from becoming the whole month’s cost center.

Recommended behavior:

- show warnings at `80%` and `100%`
- encourage upgrading or creating a more controlled sharing workflow
- do not silently break playback

Recommended soft caps:

- Starter: `25 guest views per video / month`
- Pro: `100 guest views per video / month`

### Hard Workspace Cap

The hard cap is the actual financial protection.

All non-member playback should count toward it:

- public watch pages
- restricted share links
- unauthenticated guests
- client viewers

Recommended hard caps:

- Starter: `1,000 guest views / workspace / month`
- Pro: `3,000 guest views / workspace / month`

This keeps the real risk bounded at the workspace level instead of multiplying per-video allowances across a large library. Yearly and monthly have the same caps.

### Account-Level Fair Use

Internal playback should also be bounded at the workspace level.

Measure it in `member watch minutes per workspace per month`, not raw internal view count:

- delivery cost is driven by minutes watched
- a five-minute watch costs more than a twenty-second watch
- minute-based fair use is harder to game and easier to model

Recommended account-level fair-use budgets:

- Starter: `3,000` soft / `4,000` hard member watch minutes per month
- Pro: `8,000` soft / `10,000` hard member watch minutes per month

Recommended behavior:

- warn workspace admins at `80%` and `100%`
- pause additional member playback after the hard cap until the monthly reset, or require support intervention
- never silently let internal delivery run unbounded

## Important Product Rule

The hard cap should be account-level for all guest playback, not only public watch pages.

That means:

- `/watch/:publicId` guest views count
- `/share/:token` guest views count
- authenticated workspace members do not count toward the guest cap

If you only cap public watch pages but not restricted share links, the pricing protection is fake.

## Internal Playback Caveat

If you literally promise unlimited internal member playback with no account-level guardrail, then you cannot guarantee cost will stay below subscription revenue.

So the honest product recommendation is:

- public copy: `included internal member viewing`
- internal policy: `subject to account-level fair use / abuse prevention`

If zero negative-margin cases is a hard requirement, then keep an explicit account-level safety valve such as:

- member watch-minute budgets per workspace
- manual review for abnormally high internal delivery
- support intervention for accounts behaving like training libraries or internal broadcast systems

If you do **not** want any safety valve at all, then you need either:

- lower storage than the table above, or
- higher Pro pricing

## Unit Economics Assumptions

Assumptions used here:

- Vercel + Railway fixed floor: `~$25/month` shared overhead
- Stripe processing: `2.9% + $0.30` per successful charge
- Mux delivery: `~$0.0008 per delivered minute`
- Mux stored video: `~$0.003 per stored minute / month`
- Railway object storage: `~$0.015 per GB-month`
- average watched time per guest view:
  - normal case: `3 minutes`
  - conservative case: `5 minutes`

Official pricing / limits links used:

- Vercel pricing: <https://vercel.com/pricing>
- Vercel docs: <https://vercel.com/docs/pricing>
- Vercel limits: <https://vercel.com/docs/limits>
- Convex limits: <https://docs.convex.dev/production/state/limits>
- Clerk pricing: <https://clerk.com/pricing>
- Mux pricing overview: <https://www.mux.com/pricing>
- Mux video pricing docs: <https://www.mux.com/docs/pricing/video>
- Railway pricing: <https://railway.com/pricing>
- Railway storage billing: <https://docs.railway.com/storage-buckets/billing>
- Resend pricing: <https://resend.com/pricing>
- Stripe pricing: <https://stripe.com/us/pricing>

## Cost Per Guest View

At the normal planning assumption:

- `3 minutes watched × $0.0008/minute = ~$0.0024 per guest view`

At the conservative planning assumption:

- `5 minutes watched × $0.0008/minute = ~$0.0040 per guest view`

Use the conservative number when setting caps.

## Cost Per Internal Watch Minute

Internal playback uses the same video delivery rail.

So the planning cost is the same:

- `~$0.0008 per delivered member watch minute`

That is why fair use should be defined in member watch minutes, not internal view count.

## Worst-Case Variable Cost Under Proposed Total Caps

These examples assume:

- storage is fully used
- guest views hit the workspace hard cap
- member playback hits the workspace fair-use hard cap
- pricing is monthly, not annual
- Stripe fee is included
- annual-equivalent safety is discussed below

### Starter Worst-Case With Internal Fair Use

Assumptions:

- `100GB` raw storage fully used
- rough matching Mux stored video cost allowance
- `1,000 guest views / month`
- `4,000 member watch minutes / month`
- `5 minutes average watched time` for conservative planning

Estimated variable cost:

| Cost item | Estimate |
| --- | --- |
| Railway raw storage | `$1.50` |
| Mux stored video reserve | `$1.50` |
| Guest delivery | `$4.00` |
| Member delivery | `$3.20` |
| Stripe fee on `$15` | `$0.74` |
| Total | `$10.94` |

Implication:

- still below the `$15` monthly subscription
- still below the `$12` annual-equivalent price
- leaves a small but real margin buffer at the lower annual price

### Pro Worst-Case With Internal Fair Use

Assumptions:

- `500GB` raw storage fully used
- rough matching Mux stored video cost allowance
- `3,000 guest views / month`
- `10,000 member watch minutes / month`
- `5 minutes average watched time` for conservative planning

Estimated variable cost:

| Cost item | Estimate |
| --- | --- |
| Railway raw storage | `$7.50` |
| Mux stored video reserve | `$7.50` |
| Guest delivery | `$12.00` |
| Member delivery | `$8.00` |
| Stripe fee on `$49` | `$1.72` |
| Total | `$36.72` |

Implication:

- still below the `$49` monthly subscription
- still below the `$39` annual-equivalent price
- leaves a real but controlled margin buffer at the lower annual price
- much safer than `1TB` storage at the same price

## Typical Margin Shape

Under normal async-team usage:

- Starter should usually sit in the `~60% to 80%+` gross margin range before shared overhead
- Pro should usually sit in the `~55% to 75%+` gross margin range before shared overhead

That is the right shape for a flat-price hosted software product.

## What Not To Do

Do not ship this shape if you want strict margin protection:

- `Pro $49`
- `1TB storage`
- `200 guest views per video`
- no workspace guest hard cap
- truly unlimited internal playback

Why it fails:

- the effective public delivery budget multiplies across the whole video library
- one high-usage workspace can consume more in Mux + storage than the plan price pays back

## Recommended Guardrail Model

Use all of these together:

1. videos start private
2. restricted share links are the default external sharing path
3. guest soft cap per video
4. guest hard cap per workspace
5. explicit account-level internal fair-use cap
6. manual review for outlier accounts instead of pretending they fit a flat plan forever

## Final Recommendation

If the goal is:

- simple pricing
- flat team plans
- no public plan where variable cost can exceed subscription revenue

Then the best current recommendation is:

- Starter: `$15/mo`, `100GB`, `25 guest views/video soft`, `1,000 guest views/workspace hard`
- Starter internal fair use: `3,000 member watch minutes soft`, `4,000 hard`
- Pro: `$49/mo`, `500GB`, `100 guest views/video soft`, `3,000 guest views/workspace hard`
- Pro internal fair use: `8,000 member watch minutes soft`, `10,000 hard`
- internal member playback included for normal team use, but protected by account-level fair use

This keeps `loam`:

- cheaper than Loom, Tella, and Cap for real teams
- simple enough to understand
- close to the original `lawn` flat-price spirit
- materially safer on unit economics

## Source Links

Competitors:

- Loom home: <https://www.loom.com/>
- Loom pricing: <https://www.loom.com/pricing>
- Tella home: <https://www.tella.com/>
- Tella pricing: <https://www.tella.com/pricing>
- Cap home: <https://cap.so/>
- Cap pricing: <https://cap.so/pricing>

Infrastructure:

- Vercel pricing: <https://vercel.com/pricing>
- Vercel docs: <https://vercel.com/docs/pricing>
- Vercel limits: <https://vercel.com/docs/limits>
- Convex limits: <https://docs.convex.dev/production/state/limits>
- Clerk pricing: <https://clerk.com/pricing>
- Mux pricing overview: <https://www.mux.com/pricing>
- Mux video pricing docs: <https://www.mux.com/docs/pricing/video>
- Railway pricing: <https://railway.com/pricing>
- Railway storage billing: <https://docs.railway.com/storage-buckets/billing>
- Resend pricing: <https://resend.com/pricing>
- Stripe pricing: <https://stripe.com/us/pricing>
