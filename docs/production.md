# Production (pracstack.com)

Production is the stack `PracStack-production` in the same AWS account and region as staging
(us-east-2), with its own user pool, table, runners and budget. The domain is registered at
Namecheap; DNS is hosted at **Cloudflare**. Every record below must be **DNS only** (grey
cloud): Cloudflare's proxy in front of CloudFront or Cognito breaks certificates and sign-in.

| Name                 | Serves                                                        |
| -------------------- | ------------------------------------------------------------- |
| `pracstack.com`      | the site (CloudFront, TLS 1.2 minimum)                        |
| `www.pracstack.com`  | 301 redirect to `https://pracstack.com` (same path and query) |
| `auth.pracstack.com` | sign-in pages (Cognito managed login)                         |

## 1. DNS at Cloudflare

1. Cloudflare → Add a site → `pracstack.com` → Free plan. Cloudflare imports existing records
   (there should be none worth keeping) and shows two nameservers.
2. Namecheap → Domain List → `pracstack.com` → Manage → Nameservers → **Custom DNS** → enter
   Cloudflare's two nameservers. Changes take minutes to a few hours.
3. Cloudflare → SSL/TLS: leave the defaults; they do not apply to DNS-only records.

## 2. Certificate (us-east-1)

```bash
cd infra
AWS_PROFILE=main-admin npx cdk deploy PracStack-production-certificate \
  -c stage=production -c certificateFor=pracstack.com
```

The stack waits until the certificate is validated. Meanwhile, get the validation records:

```bash
aws acm list-certificates --region us-east-1 --profile main-admin \
  --query "CertificateSummaryList[?DomainName=='pracstack.com'].CertificateArn"
aws acm describe-certificate --region us-east-1 --profile main-admin --certificate-arn <arn> \
  --query "Certificate.DomainValidationOptions[].ResourceRecord"
```

Add each as a **CNAME** in Cloudflare (Name and Value as shown, without the trailing dot;
DNS only). The certificate is issued within minutes and the stack completes; its output is the
`CertificateArn`. Keep the records: ACM renews the certificate with them.

## 3. The production stack

```bash
npm run deploy:prepare
cd infra
AWS_PROFILE=main-admin npx cdk diff|deploy PracStack-production -c stage=production \
  -c retainData=true -c alertEmail=<email> -c budgetUsd=<usd> -c signUpAllowlist=<emails> \
  -c domain=pracstack.com -c certificateArn=<CertificateArn> \
  -c googleClientId=<id> -c googleClientSecretName=pracstack/staging/google-client-secret \
  -c githubClientId=<id> -c githubClientSecretName=pracstack/staging/github-client-secret \
  -c githubSigningKeyParameter=/pracstack/staging/github-oidc-signing-key
```

Web execution (the web challenge runners) is on by default; only `-c webExecution=false` removes
the runners. It used to be opt-in, and on 2026-11-27 a deploy without the flag deleted
production's runners. Still read the diff for `Web*Runner` / `WebWorker` resources being added or
removed. After a deploy, run `npx tsx scripts/verify-runners.ts PracStack-production` and
`npx tsx scripts/smoke-test.ts --stack PracStack-production`.

Production reuses the staging Google client, GitHub OAuth App and their secrets (one app each,
with both stages' redirect URIs). The GitHub bridge's signing key is shared too; tokens are
still bound to each stage's own issuer URL, so one stage's bridge cannot sign in to the other.

Then in Cloudflare, with the `SiteDnsTarget` output (`dxxxx.cloudfront.net`):

| Type  | Name                                                    | Target          |
| ----- | ------------------------------------------------------- | --------------- |
| CNAME | `@` (pracstack.com; Cloudflare flattens it at the apex) | `SiteDnsTarget` |
| CNAME | `www`                                                   | `SiteDnsTarget` |

## 4. Sign-in at auth.pracstack.com

Cognito creates a custom domain only when the parent domain already resolves, so this is a
second deploy, once `https://pracstack.com` loads: the same command with `-c authDomain=true`.
Then add, in Cloudflare:

| Type  | Name   | Target                 |
| ----- | ------ | ---------------------- |
| CNAME | `auth` | `AuthDnsTarget` output |

The Cognito address (`pracstack-production-<suffix>.auth.us-east-2.amazoncognito.com`) keeps
working as well.

## Inviting people

`-c signUpAllowlist=` takes comma-separated entries: emails, domains (`@example.com`) and
GitHub accounts by **numeric user ID** (`github:39500954`). Use the ID, never the username:
usernames can be renamed and then claimed by someone else. Look it up with
`curl -s https://api.github.com/users/<username>` (the `id` field). A GitHub entry only
admits sign-ups through Continue with GitHub (Cognito user `GitHub_<id>`).

Invited GitHub users (2026-11-24): `myattaw` = 39500954, `owenbean400` = 63262699.

## 5. Google and GitHub redirect URIs

Add to the Google OAuth client (Google Cloud → APIs & Services → Credentials) and the GitHub
OAuth App (Settings → Developer settings → OAuth Apps), next to the staging ones:

- `https://auth.pracstack.com/oauth2/idpresponse`
- `https://pracstack-production-<suffix>.auth.us-east-2.amazoncognito.com/oauth2/idpresponse`

## 6. After deploying

- `npx tsx scripts/verify-runners.ts PracStack-production` and
  `npx tsx scripts/smoke-test.ts --stack PracStack-production`.
- Administrator: `aws cognito-idp admin-add-user-to-group --user-pool-id <UserPoolId> --username <email> --group-name admins`.
- Email: Cognito's default sender allows 50 emails a day per AWS account, shared by staging and
  production. Enough for invite-only; set up Amazon SES before opening sign-up.
- The budget is for the whole account (staging included); each stage's kill switch stops only
  its own runners.

## Moving to a separate AWS account later

Cognito users cannot be moved between accounts with their passwords. Before real users arrive
is the time to move; afterwards it means a migration (a Cognito user-migration trigger or
password resets, and copying the table). Give collaborators their own IAM Identity Center
users with limited permissions instead of sharing credentials.
