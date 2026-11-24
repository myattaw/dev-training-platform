# Accounts and sign-in

## What works

| Feature                                              | How                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign up, email verification, sign in, password reset | Amazon Cognito managed login (the newer pages, branded with PracStack colors and logo; Essentials plan). `/account/sign-in` opens Cognito's sign-in or sign-up page (authorization code + PKCE, public client, no secret in the browser). Passwords never reach PracStack. |
| Persistent sessions                                  | ID token in `sessionStorage`, refreshed with the refresh token; Cognito's own cookie makes re-sign-in one redirect                                                                                                                                                         |
| Sign out                                             | Revokes the refresh token (`/oauth2/revoke`), clears tokens and calls Cognito `/logout`                                                                                                                                                                                    |
| Protected routes                                     | `requireSignIn` guard (company pages, timed practice, account); the API also rejects unauthenticated calls (API Gateway JWT authorizer plus a re-check in the function)                                                                                                    |
| Profile                                              | `GET`/`PATCH /api/me`: display name (sanitized, 1–60 characters)                                                                                                                                                                                                           |
| Saved progress across devices                        | Everything is stored per user in DynamoDB                                                                                                                                                                                                                                  |
| Local mode                                           | `npm start`: the unauthenticated "Local developer" user, loopback only, clearly labeled                                                                                                                                                                                   |

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

## GitHub sign-in

GitHub is **not** a built-in Cognito social provider (the built-ins are Facebook, Google, Login
with Amazon and Sign in with Apple), and GitHub OAuth Apps are not OpenID Connect providers (no
ID token, no discovery document). Of the options considered (an OIDC bridge, a separate GitHub
session system, a managed identity provider such as Auth0, or deferring), PracStack uses an
**OIDC bridge**: Cognito stays the one identity system and linking works as for any provider.

### How it works

`services/api/src/github-oidc/bridge.ts` is a minimal OpenID Connect provider in its own Lambda
function (`GithubOidcFunction`), routed by API Gateway at `/oidc/github/*` without an authorizer.
Cognito has it as the OIDC provider **GitHub**.

1. "Continue with GitHub" sends the browser to Cognito with `identity_provider=GitHub`; Cognito
   calls the bridge's `/authorize`, which redirects to GitHub with scopes `read:user user:email`
   (no repository access).
2. GitHub redirects back to Cognito's `/oauth2/idpresponse`. Cognito calls the bridge's `/token`
   with the code and the GitHub app's client ID and secret; the bridge exchanges the code with
   GitHub, reads the user and their email addresses, and returns an RS256-signed ID token.
3. Cognito verifies the token against the bridge's `/jwks.json`, reads `/userinfo`, and creates
   or signs in a Cognito user `GitHub_<github user id>`. The app receives Cognito tokens as with
   any other sign-in.

| Safeguard | How |
| --- | --- |
| No stored GitHub secret | Cognito sends the app's client secret to `/token` (as any OIDC client does); the bridge passes it to GitHub and keeps nothing |
| Only verified email | The token's email is GitHub's **primary, verified** address; without one, sign-in is refused. Unverified addresses could otherwise sign someone into another person's account |
| Stable identity | `sub` is GitHub's numeric user ID (logins can be renamed) |
| No open redirect | `/authorize` and `/token` accept only Cognito's `/oauth2/idpresponse` as the redirect URI |
| Signed, short-lived tokens | RS256 with a key in an SSM SecureString that only this function can read (`ssm:GetParameter` on that parameter, `kms:Decrypt` only via SSM); 5-minute lifetime; audience = the client ID |
| Isolation | Its own function, role and bundle: no table access, no content, no API code |
| Invite-only staging | The sign-up allowlist trigger applies to GitHub users too |

Tests: `bridge.spec.ts` (discovery, open redirects, token signing and claims, unverified and
non-primary emails, bad grants, userinfo), `infra/test/pracstack-stack.spec.ts` (provider,
function permissions, unauthenticated routes, cdk-nag), and the web sign-in and linking specs.

### Linking GitHub to an existing account

A GitHub sign-in is its own Cognito user. To use it with an existing account, the Account page
offers **Add GitHub to this account**: it creates a link token while signed in to the account,
keeps it in this tab's `sessionStorage` (never in a URL), signs in with GitHub, and redeems the
token (see "Stable user ids and account linking" above). Linked identities are listed by how they
sign in (`identities` claim: "GitHub", "Google"; "Email and password" otherwise). A GitHub
account that already has progress of its own is not linked automatically.

### Setting it up for a stage

1. **GitHub OAuth App** (GitHub → Settings → Developer settings → OAuth Apps → New OAuth App):
   - Homepage URL: the site URL.
   - Authorization callback URL: `https://<Cognito sign-in domain>/oauth2/idpresponse` (the
     `SignInDomain` stack output).
   - Then generate a client secret.
2. **Client secret** in Secrets Manager (plain text), named `pracstack/<stage>/github-client-secret`
   (or `-c githubClientSecretName=…`).
3. **Signing key** in SSM Parameter Store as a SecureString named
   `/pracstack/<stage>/github-oidc-signing-key` (or `-c githubSigningKeyParameter=…`): an RSA
   2048 private key in PEM. Rotating it: write a new key; tokens issued with the old one live 5
   minutes.
4. Deploy with `-c githubClientId=<client ID>`. The stack adds the provider and the bridge, and
   `config.json` lists GitHub, which turns the disabled "Coming soon" button into "Continue with
   GitHub".

Cost: the bridge runs only during GitHub sign-ins (Lambda and API Gateway, fractions of a cent);
the Secrets Manager secret is $0.40 a month; the SSM parameter is free.

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
