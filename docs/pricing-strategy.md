# Pricing Strategy

Research date: March 7, 2026

## New Direction

`loam` should remove per-video caps and use account-level watch-minute caps only.

- No per-video views or per-video soft caps.
- Private by default stays non-negotiable.
- Public and share-link usage is controlled by account-wide shared-link watch minutes.
- Internal usage is controlled by account-wide member watch minutes.
- Invitees start as viewers; uploads and edits remain role-gated.

This keeps the plan logic easy to explain and avoids the “one video controls everything” complexity while still protecting costs.

## Positioning Update

`loam` is still positioned as: fast async screen-video workflow for teams.

- Not Loom: no broad workplace suite.
- Not Tella: no polished creator/editor-first workflow.
- Not Cap: hosted and open by design, with clear usage limits.

Core positioning message:

> Async screen recordings, walkthroughs, and feedback that teammates can watch on their own time.

## Plan Rules

- Starter: $15/month.
- Pro: $49/month.
- Unlimited seats on both plans.
- Flat workspace pricing with usage hard limits at the account level.
- Videos are private by default.

## Pricing Table (Launch Strategy)

| Plan | Monthly | Storage | Shared-link watch minutes | Member watch minutes |
| --- | --- | --- | --- | --- |
| Starter | $15 | 100GB | 5,000 | 4,000 |
| Pro | $49 | 500GB | 15,000 | 10,000 |

Notes:

- shared-link minutes include `/watch/:publicId` and `/share/:token` access.
- member watch minutes include logged-in workspace members and viewer invites.
- these are hard account-level caps in first launch pass.

## Why no per-video caps

1. It shortens decision fatigue for users.
2. It makes invite-led sharing and internal workflows cleaner.
3. It keeps implementation simpler and more resilient under load.

## Default team access model

- Invite flow defaults to **Viewer** role.
- Viewers can watch/comment/react.
- Admins or members can promote viewers to Member/Admin for upload/edit rights.
- This creates account growth opportunity from invite chains while preserving least privilege.

## Cost control behavior

- Cost risk now sits in watch-time, so this model only protects when usage meters are enforced.
- Shared-link minutes are where public exposure risk is concentrated.
- Member minutes cover normal team usage, including invited collaborators.

If usage protection is insufficient, add one manual guard: pause playback at hard cap and route users to upgrade/contact sales.

## Monthly guardrail math (practical)

Assume a conservative watched-minute unit cost of `~$0.0008/minute` (delivery).

### Worst month, Starter

- Public share usage at cap: `5,000 × $0.0008 = $4.00`.
- Internal usage at cap: `4,000 × $0.0008 = $3.20`.
- Combined theoretical direct video cost: `~$7.20`.

### Worst month, Pro

- Public share usage at cap: `15,000 × $0.0008 = $12.00`.
- Internal usage at cap: `10,000 × $0.0008 = $8.00`.
- Combined theoretical direct video cost: `~$20.00`.

## Strategic effect on growth

- Default viewer-first invites increases total known users/registrations per team.
- Private-by-default videos reduce accidental public spend.
- Account-level budgets avoid “single hot video” accounting surprises and keep pricing communication clean.

## Links used

- Loom pricing: <https://www.loom.com/pricing>
- Tella pricing: <https://www.tella.com/pricing>
- Cap pricing: <https://cap.so/pricing>
- Namecheap `.you`: <https://www.namecheap.com/domains/registration/gtld/you/>
- Vercel pricing: <https://vercel.com/pricing>
- Mux pricing overview: <https://www.mux.com/pricing>
- Mux video pricing docs: <https://www.mux.com/docs/pricing/video>
- Clerk pricing: <https://clerk.com/pricing>
- Stripe pricing: <https://stripe.com/us/pricing>
- Resend pricing: <https://resend.com/pricing>
