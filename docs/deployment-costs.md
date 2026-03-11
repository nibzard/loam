# Deployment Cost Research

Research date: March 7, 2026

This note estimates the likely cost to deploy `loam` based on the current codebase and the official vendor pricing pages linked below.

## Stack Assumptions

Inferred from the repo:

- Frontend / SSR: Vercel
- Backend / database / realtime: Convex
- Auth: Clerk
- Video processing and playback: Mux
- Original upload storage: Railway S3-compatible bucket
- Billing: Stripe
- Optional emails: Resend

Relevant repo files:

- [docs/deployment.md](/home/niko/lawn/docs/deployment.md)
- [docs/setup.md](/home/niko/lawn/docs/setup.md)
- [convex/mux.ts](/home/niko/lawn/convex/mux.ts)
- [convex/s3.ts](/home/niko/lawn/convex/s3.ts)
- [convex/videoActions.ts](/home/niko/lawn/convex/videoActions.ts)
- [convex/http.ts](/home/niko/lawn/convex/http.ts)

## Short Answer

The cheapest legitimate commercial deployment is roughly:

- `$20-$25/month + domain` for a very small launch
- more realistically `$25-$45/month` before meaningful video traffic

That assumes:

- Vercel Pro
- Clerk free tier
- Convex free / low usage
- Resend free tier or disabled
- Railway object storage with low usage
- Mux still mostly inside free / very low paid usage

## Baseline Monthly Cost

### Vercel

- Treat `Pro` as the minimum for a real product because Vercel says `Hobby` is for personal, non-commercial use.
- Estimated floor: `Pro $20/month + usage`

### Convex

- Can likely stay near `$0` at launch for a small product if usage is light.
- If you outgrow that and need the paid tier, the relevant step-up is `Professional`, which is materially more expensive than the launch stack.

### Clerk

- Likely `$0` at launch on the free tier.
- Paid tier exists if active users or features outgrow the free allowance.

### Railway Storage

- Budget at least `~$5/month` for a real deployment because Railway pricing is usage-based with a minimum plan floor.
- Bucket storage itself is cheap relative to video delivery.

### Resend

- Optional.
- Can be `$0` initially if email volume is small.

### Stripe

- No fixed monthly platform fee assumed here.
- Cost is transaction-based and scales with paid conversions.

### Domain

- Separate from infrastructure.
- `loam.video` should be checked directly at your registrar before launch, because premium TLD pricing can vary materially by provider and renewal term.

## Practical Launch Floor

Approximate launch floor:

- `Vercel Pro $20`
- `Railway ~$5`
- everything else can plausibly remain `$0` at first

Practical minimum:

- about `~$25/month + domain`

## Important Cost Driver

For this app, the large variable is not auth or the web app. It is video usage.

This codebase:

- stores original uploads in Railway S3-compatible storage
- sends uploaded videos into Mux for playback
- keeps both original file storage and streaming delivery in play

That means the major variable costs are:

- Mux delivery minutes
- Mux hosted video storage
- original object storage

Raw object storage is cheap. Video viewing volume is what can grow fast.

## Rough Scenario Estimates

These are directional estimates, not quotes.

### Scenario 1: Tiny launch

Assumptions:

- very low traffic
- small video library
- Mux mostly within free / low paid usage
- Clerk / Convex / Resend still on free tiers

Estimate:

- about `~$25-$45/month + domain`

### Scenario 2: Small active product

Assumptions:

- `100 videos`
- `5 minutes` average each
- `150,000 watched minutes/month`

Rough estimate:

- about `~$65-$70/month + Stripe fees`

### Scenario 3: Moderate product

Assumptions:

- `500 videos`
- `5 minutes` average each
- `500,000 watched minutes/month`

Rough estimate:

- about `~$350-$360/month + Stripe fees`

## Pricing Notes

### Why the app can be cheap at launch

Most core services have a free or low-entry tier:

- Clerk
- Convex
- Resend
- low-usage Railway storage

So the fixed-cost floor is mostly:

- Vercel
- a small amount of storage
- domain

### Why the app can get expensive later

Mux delivery is the meaningful scaling variable.

If teams upload a lot and viewers actually watch a lot of video, the Mux bill can outgrow the app subscription revenue quickly unless pricing and usage controls are designed around it.

That matters because the current product copy positions plans like:

- Basic: `$5/month`
- Pro: `$25/month`

Those prices are friendly, but they leave limited room if customers become heavy video consumers.

## How To Recalculate Later

To refresh this estimate, collect:

1. monthly uploaded video minutes
2. average stored library size
3. monthly watched minutes
4. number of paying teams
5. average plan mix between low-usage and heavy-usage customers

Then update:

- Mux delivery estimate
- Mux video storage estimate
- Railway object storage estimate
- Clerk / Convex tier assumptions

## Source Links Used

Official pricing / limits pages used for this estimate:

- Vercel pricing: <https://vercel.com/pricing>
- Vercel pricing docs: <https://vercel.com/docs/pricing>
- Vercel limits docs: <https://vercel.com/docs/limits>
- Convex limits / production docs: <https://docs.convex.dev/production/state/limits>
- Clerk pricing: <https://clerk.com/pricing>
- Mux pricing overview: <https://www.mux.com/pricing>
- Mux video pricing docs: <https://www.mux.com/docs/pricing/video>
- Railway pricing: <https://railway.com/pricing>
- Railway storage bucket billing docs: <https://docs.railway.com/storage-buckets/billing>
- Resend pricing: <https://resend.com/pricing>
- Stripe pricing: <https://stripe.com/us/pricing>
- Namecheap `.you` domain pricing: <https://www.namecheap.com/domains/registration/gtld/you/>

## Caveats

- Vendor pricing changes frequently.
- Free-tier eligibility and usage limits can change.
- Domain pricing is registrar-specific and can vary by promotion, renewal term, and date.
- This document is a directional planning note, not a binding cost quote.
