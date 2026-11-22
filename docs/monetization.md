# Plans and entitlements

**No payments are possible today.** There is no billing provider, no checkout and no purchase
button, and no payment details are collected. Pro features are shown as Coming Soon previews.

## Plans

| Plan | Who | Features |
| --- | --- | --- |
| FREE | Everyone with an account (default) | Skill Mastery, Coding Challenges, company search, reported questions, free recommended practice, timed sessions |
| PRO | An active entitlement record | `premium-recommendations`, `advanced-preparation-plans`, `advanced-mock-interviews`, `progress-analytics` |
| ADMIN | Members of the Cognito `admins` group | All features |

## How access is decided (server only)

`services/api/src/account/entitlements.ts`:

1. ADMIN if the verified ID token's `cognito:groups` contains `admins`.
2. PRO if the store has an entitlement record `{ plan: 'pro', source, grantedAt, expiresAt? }`
   that has not expired.
3. Otherwise FREE.

Request bodies, headers, query strings and local storage can never change the plan (tested:
`?plan=pro`, extra body fields). Features are checked by name with
`EntitlementService.require(caller, feature)` (403 `forbidden`), so call sites do not change when
billing arrives. `GET /api/me/entitlements` reports the plan and `billing: { available: false }`.

Locally, `PRACSTACK_LOCAL_PLAN=pro npm run api` previews Pro as the local developer only;
`createApi` refuses this override with any real authenticator.

## Premium content

Pro recommendations are returned with `locked: true` for FREE users; the UI shows title,
difficulty and a short explanation with a lock icon and **Coming soon**, and no link or start
button. The two Pro challenges are **planned**: only their public metadata exists, so nothing
premium is in the web bundle. When premium challenges are written, their statements must be
served by the API behind `require('premium-recommendations')`, not from the public content
manifest.

## Before enabling payments

1. Choose a billing provider (e.g. Stripe) and create products and prices.
2. Add a checkout endpoint that starts a hosted checkout session for the signed-in user.
3. Add a webhook endpoint: verify signatures, deduplicate events by id, and write
   `EntitlementRecord { source: 'billing', externalReference, expiresAt }` (the period end).
   Store the webhook secret in Secrets Manager.
4. Handle cancellation, failed payments and refunds by updating `expiresAt`.
5. Serve premium challenge content through the API with entitlement checks.
6. Add terms of service, a privacy policy, a refund policy, tax handling, and a customer portal
   link on the Account page.
