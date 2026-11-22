# Accounts and sign-in

## What works

| Feature | How |
| --- | --- |
| Sign up, email verification, sign in, password reset | Amazon Cognito managed login. `/account/sign-in` opens Cognito's sign-in or sign-up page (authorization code + PKCE, public client, no secret in the browser). Passwords never reach PracStack. |
| Persistent sessions | ID token in `sessionStorage`, refreshed with the refresh token; Cognito's own cookie makes re-sign-in one redirect |
| Sign out | Revokes the refresh token (`/oauth2/revoke`), clears tokens and calls Cognito `/logout` |
| Protected routes | `requireSignIn` guard (company pages, timed practice, account); the API also rejects unauthenticated calls (API Gateway JWT authorizer plus a re-check in the function) |
| Profile | `GET`/`PATCH /api/me`: display name (sanitised, 1–60 characters) |
| Saved progress across devices | Everything is stored per user in DynamoDB |
| Local mode | `npm start`: the unauthenticated "Local developer" user, loopback only, clearly labelled |

Open redirects are prevented: return paths must start with a single `/` (`safeReturnPath`), and
the OAuth `state` is checked before a code is exchanged.

## Stable user ids and account linking

`services/api/src/account/identity.ts` maps every `(provider, subject)` to an internal user id.
The first identity of an account keeps its Cognito `sub` as the id, so existing progress keeps
its key. A second sign-in method can be linked to the same account:

1. While signed in, `POST /api/me/identities/link-intents` returns a single-use token, valid for
   10 minutes.
2. While signed in with the new identity, `POST /api/me/identities/link { token }` maps that
   identity to the account.

Linking needs proof from both sides and **never** happens because two identities share an email
address. If the new identity already has its own progress, linking is refused (409): merging two
accounts' progress is not automatic. Covered by `services/api/src/prep.spec.ts`.

## Importing browser-only progress

Before accounts, challenge drafts lived only in `localStorage`. The Account page lists them and
imports them (`POST /api/me/progress/import`):

- Idempotent per `importId`; repeating an import is safe (identical drafts are reported
  unchanged).
- A different draft already in the account is a **conflict**, explained per draft and replaced
  only if the learner chooses "Replace the account draft".
- Browser visible-test results are **not** imported as solved challenges; only server-graded
  submissions count.
- Local data is never deleted. Account drafts can be restored into another browser.

## GitHub sign-in: evaluation

GitHub is **not** a built-in Cognito social provider (the built-ins are Facebook, Google, Login
with Amazon and Sign in with Apple), and ordinary GitHub OAuth Apps are not OpenID Connect
providers (no ID token, no discovery document), so they cannot be added as Cognito OIDC
providers directly.

| Option | Security | Cost | Maintenance | Fit with Cognito and linking |
| --- | --- | --- | --- | --- |
| 1. OIDC bridge for GitHub (small service that wraps GitHub OAuth as OIDC), added to Cognito as an OIDC provider | Good if built carefully; it signs tokens, so it is security-critical code | Lambda/API Gateway pennies | Moderate: you own the signing keys and the bridge | Best: Cognito stays the one identity system; linking via the identity map above or `AdminLinkProviderForUser` |
| 2. Separate backend GitHub OAuth flow with its own sessions | Two auth systems to secure | Low | High: duplicate session handling | Poor: two kinds of tokens for the API |
| 3. Managed identity provider with GitHub built in (e.g. Auth0) | Good | Paid beyond free tiers | Low | Would replace Cognito or sit in front of it |
| 4. Defer | No new risk | None | None | Email sign-in already covers everything |

**Decision: defer (option 4) now, option 1 when GitHub sign-in is wanted.** It needs a GitHub OAuth
App (client id and secret, stored in Secrets Manager, never in the browser) and a reviewed
bridge. Only the `read:user` and `user:email` scopes are needed; no repository access. The UI
says "Continue with GitHub is not available yet" and shows no GitHub button. No GitHub OIDC
discovery URL is configured, because GitHub OAuth Apps do not have one.

## Setting up Cognito (when deploying)

The CDK stack creates the user pool (email sign-in, 12+ character passwords, optional
authenticator-app MFA), the managed-login domain, the public PKCE client and the `admins` group;
it also writes `config.json`. After deploying:

- Add an administrator: `aws cognito-idp admin-add-user-to-group --user-pool-id <UserPoolId> --username <email> --group-name admins`.
- Cognito's default email sender allows 50 emails a day per AWS account (sign-up codes and
  password resets): enough for a private beta, not for public sign-up. Configure Amazon SES
  before then. Details: [staging-launch.md](staging-launch.md#5-cognito-and-email).
- Private staging: `-c signUpAllowlist=…` limits self sign-up to listed emails or domains.
- No credentials are needed in the repository.
