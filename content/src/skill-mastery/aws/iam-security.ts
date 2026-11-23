import type { QuestionSource } from '@pracstack/content-model';
import { json, plain } from '../helpers';
import { scenarioFamily } from './builders';

/*
 * IAM and security for developers: identities and roles, policy evaluation,
 * least privilege, reading AccessDenied messages, STS and GitHub Actions OIDC,
 * Secrets Manager versus Parameter Store, and KMS basics.
 */

const ACCOUNT = '123456789012';

export const iamSecurityFamilies: readonly QuestionSource[] = [
  ...scenarioFamily(
    'aws-iam-identities',
    1,
    'Long-lived access keys are the thing to avoid. Which option gives temporary credentials that AWS hands out for you?',
    [
      {
        key: 'lambda-credentials',
        question:
          'A Lambda function must read items from a DynamoDB table in the same account. How should the function get AWS credentials?',
        correct:
          'Give the function an execution role whose policy allows the DynamoDB actions it needs; Lambda supplies temporary credentials from that role',
        wrong: [
          'Create an IAM user for the function and put its access key and secret in environment variables',
          'Use the root user’s access keys, stored encrypted in the deployment package',
          'Create a DynamoDB username and password and pass them in the connection string',
        ],
        why: 'Every Lambda function runs with an execution role. The AWS SDK finds the role’s temporary credentials automatically and they rotate on their own. IAM user keys in environment variables are long-lived secrets that leak through logs, consoles and copies of the configuration; root keys should not exist at all. DynamoDB has no database users: access is controlled entirely by IAM.',
      },
      {
        key: 'workforce-access',
        question:
          'A company has twelve AWS accounts. Its forty developers already sign in to everything with the corporate identity provider and need console and CLI access to some of the accounts. What is the recommended setup?',
        correct:
          'IAM Identity Center connected to the corporate identity provider, with permission sets assigned to groups for each account',
        wrong: [
          'An IAM user per developer in each of the twelve accounts, each with its own access keys',
          'One shared IAM user per team whose access keys are kept in the team password manager',
          'The root user of each account, protected with MFA and shared through a vault',
        ],
        why: 'IAM Identity Center is the workforce sign-in service for multiple accounts: people use their existing corporate identity, get short-lived credentials for the console and the CLI (`aws sso login`), and access is managed centrally through groups and permission sets. Per-account IAM users multiply long-lived keys and offboarding work; shared users destroy accountability; root is for a handful of account-level tasks only.',
      },
      {
        key: 'ecs-task-role',
        difficulty: 3,
        question:
          'An ECS service on Fargate pulls its image from ECR and writes logs fine, but the application code gets AccessDenied when it calls `s3:PutObject`. The team added `s3:PutObject` to the task execution role. Why does the call still fail, and what is the fix?',
        correct:
          'The task execution role is used by ECS itself (pulling images, sending logs); application calls use the task role, so the S3 permission belongs on a task role',
        wrong: [
          'Fargate tasks cannot call S3 at all; the upload has to go through a Lambda function',
          'The new permission takes 24 hours to propagate to running tasks',
          'The container must be given IAM user access keys, because roles only work on EC2 instances',
        ],
        why: 'ECS has two roles. The task execution role is what the ECS agent uses to pull the image and push logs; the task role is what the SDK inside your container receives. Mixing them up is a classic mistake: the image pulls fine, so it looks like permissions are set up, but the code runs with whatever the task role allows (or no role at all).',
      },
    ],
  ),
  ...scenarioFamily(
    'aws-iam-policy-evaluation',
    2,
    'Evaluate in order: is there an explicit deny anywhere? Is there an allow? If neither, the default is deny.',
    [
      {
        key: 'explicit-deny',
        question:
          'A developer’s role has two policies attached. Policy A allows `s3:*` on the `reports` bucket and its objects. Policy B denies `s3:DeleteObject` on `arn:aws:s3:::reports/*`. The developer calls DeleteObject on `reports/2026/q3.pdf`. What happens?',
        correct: 'AccessDenied: an explicit deny in any applicable policy overrides every allow',
        wrong: [
          'The object is deleted, because policy A grants `s3:*`, which is broader',
          'The result depends on which policy was attached most recently',
          'The object is deleted, because allows from identity policies outrank denies',
        ],
        why: 'IAM evaluation is simple at the edges: an explicit Deny wins over any Allow, wherever the two come from. Specificity and attachment order do not matter. This is what makes deny statements useful as guardrails: nothing granted elsewhere can undo them.',
      },
      {
        key: 'implicit-deny',
        difficulty: 3,
        question:
          'This is the only policy on a role. The role calls `aws s3 ls s3://reports/` (ListObjectsV2, which is authorised as the `s3:ListBucket` action). What happens?',
        code: json(`{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::reports/*"
    }
  ]
}`),
        correct:
          'AccessDenied: no statement allows `s3:ListBucket`, and anything not allowed is denied by default',
        wrong: [
          'The listing succeeds, because being able to read objects implies being able to list them',
          'The listing succeeds, because `reports/*` matches every key in the bucket',
          'The call fails with a validation error because the policy has no Deny statement',
        ],
        why: 'Requests are implicitly denied unless a policy allows them. `s3:GetObject` and `s3:ListBucket` are different actions on different resources: GetObject applies to object ARNs (`reports/*`), ListBucket to the bucket ARN (`arn:aws:s3:::reports`). Reading and listing are granted separately.',
      },
      {
        key: 'permissions-boundary',
        difficulty: 4,
        question:
          'A role’s identity policy allows `dynamodb:*` and `s3:*` on all resources. The role also has a permissions boundary that allows only `dynamodb:GetItem`, `dynamodb:PutItem` and `dynamodb:Query`. Which calls can the role make?',
        correct:
          'Only GetItem, PutItem and Query on DynamoDB: effective permissions are the overlap of the identity policy and the boundary',
        wrong: [
          'Everything in the identity policy, because a boundary only applies to users, not roles',
          'GetItem, PutItem and Query plus all of S3, because the boundary only restricts DynamoDB',
          'Nothing, because the boundary and the identity policy disagree and IAM denies on conflict',
        ],
        why: 'A permissions boundary sets the maximum an identity can be granted; it grants nothing by itself. An action is allowed only if both the identity policy and the boundary allow it. S3 is not in the boundary, so all S3 calls are denied even though the identity policy allows them. Boundaries are often used so developers can create roles for their functions without being able to create a role more powerful than themselves.',
      },
      {
        key: 'cross-account-bucket',
        difficulty: 5,
        question: `A role in account 111111111111 has an identity policy allowing \`s3:GetObject\` on \`arn:aws:s3:::partner-exports/*\`. The bucket belongs to account ${ACCOUNT}, and its bucket policy does not mention account 111111111111 at all. The role calls GetObject. What happens?`,
        correct:
          'AccessDenied: across accounts, the caller’s identity policy and the resource owner’s bucket policy must both allow the request',
        wrong: [
          'The object is returned, because the caller’s identity policy allows GetObject on that ARN',
          'The object is returned if both accounts are in the same AWS Organization, with no bucket policy needed',
          'AccessDenied, because cross-account access to S3 is only possible by copying objects with replication',
        ],
        why: 'Within one account, an allow in either the identity policy or the resource policy is usually enough. Across accounts, both sides must agree: the caller’s account must allow the call and the owning account must grant access in the resource-based policy (or through a role the caller assumes in the owning account). Being in the same organization does not grant access by itself.',
      },
    ],
  ),
  ...scenarioFamily(
    'aws-iam-least-privilege',
    2,
    'Compare each statement with what the code actually does: which actions, which resources?',
    [
      {
        key: 'spot-broad-statement',
        question:
          'This policy is attached to the role of a Lambda function that only reads orders from the `Orders` table and writes its own logs. Which statement violates least privilege?',
        code: json(`{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadOrders",
      "Effect": "Allow",
      "Action": ["dynamodb:GetItem", "dynamodb:Query"],
      "Resource": "arn:aws:dynamodb:eu-west-1:${ACCOUNT}:table/Orders"
    },
    {
      "Sid": "Storage",
      "Effect": "Allow",
      "Action": "s3:*",
      "Resource": "*"
    },
    {
      "Sid": "Logs",
      "Effect": "Allow",
      "Action": ["logs:CreateLogStream", "logs:PutLogEvents"],
      "Resource": "arn:aws:logs:eu-west-1:${ACCOUNT}:log-group:/aws/lambda/orders-api:*"
    }
  ]
}`),
        correct:
          '`Storage`: it allows every S3 action on every bucket although the function does not use S3',
        wrong: [
          '`ReadOrders`: it should use `dynamodb:*` so future features do not need policy changes',
          '`Logs`: Lambda writes logs without needing any permissions',
          'None of them: wildcards are fine as long as the function code never calls S3',
        ],
        why: 'Least privilege means granting only the actions and resources the code needs. `s3:*` on `*` lets anyone who gets code running in this function (through a vulnerable dependency, for example) read, overwrite or delete every bucket in the account. Relying on “the code never calls it” protects nothing. The log permissions are needed: Lambda writes logs with the execution role’s permissions.',
      },
      {
        key: 'query-index',
        difficulty: 4,
        question:
          'A function’s policy allows `dynamodb:Query` on `arn:aws:dynamodb:eu-west-1:123456789012:table/Orders`. Querying the table works, but querying its global secondary index fails with the error below. What is the least-privilege fix?',
        code: plain(`AccessDeniedException: User: arn:aws:sts::${ACCOUNT}:assumed-role/orders-api-role/orders-api
is not authorized to perform: dynamodb:Query on resource:
arn:aws:dynamodb:eu-west-1:${ACCOUNT}:table/Orders/index/ByCustomer
because no identity-based policy allows the dynamodb:Query action`),
        correct:
          'Add `arn:aws:dynamodb:eu-west-1:123456789012:table/Orders/index/ByCustomer` to the statement’s resources',
        wrong: [
          'Change the statement’s resource to `"*"` so all indexes are covered',
          'Add `dynamodb:Scan` to the actions, because index reads are scans',
          'Add a resource-based policy to the index granting access to everyone in the account',
        ],
        why: 'An index has its own ARN under the table (`table/Orders/index/ByCustomer`), and permission on the table ARN does not cover it. The error tells you exactly what is missing: the action, the resource and that no identity-based policy allows it. Adding the index ARN (or `table/Orders/index/*` if every index is used) fixes it without opening every table in the account.',
      },
    ],
  ),
  ...scenarioFamily(
    'aws-iam-access-denied',
    4,
    'Read the end of the message: it names which kind of policy blocked or failed to allow the call.',
    [
      {
        key: 'scp-deny',
        question:
          'A developer with an administrator role deploys a function to a new Region and gets the error below. Adding an Allow for `lambda:CreateFunction` to their role changes nothing. Why?',
        code: plain(`User: arn:aws:sts::${ACCOUNT}:assumed-role/AdminRole/dana is not authorized to perform:
lambda:CreateFunction on resource: arn:aws:lambda:ap-southeast-2:${ACCOUNT}:function:orders-api
with an explicit deny in a service control policy`),
        correct:
          'A service control policy from AWS Organizations explicitly denies it (here, probably a Region restriction); no policy inside the account can override that, so use an allowed Region or ask the organization admins',
        wrong: [
          'IAM changes take up to a day to apply; retry tomorrow',
          'Administrator roles cannot create Lambda functions; a dedicated Lambda role is required',
          'The function name already exists in another Region and must be renamed',
        ],
        why: 'Service control policies set the outer limit for every identity in member accounts, administrators included. An explicit deny there beats any allow in the account. Organizations commonly deny all but approved Regions. The phrase “with an explicit deny in a service control policy” tells you that editing your own role is pointless.',
      },
      {
        key: 'kms-decrypt',
        question:
          'A role has `s3:GetObject` on `arn:aws:s3:::invoices/*`. Most objects download, but objects encrypted with SSE-KMS using a customer managed key fail with AccessDenied. What is missing?',
        correct:
          'Permission to use the KMS key: `kms:Decrypt` must be allowed for the role, and the key policy must permit it',
        wrong: [
          'The `s3:GetObjectEncrypted` action, which covers encrypted objects',
          'Nothing in IAM: SSE-KMS objects can only be read by the account that uploaded them',
          'The role needs `kms:CreateKey` so it can generate its own copy of the key',
        ],
        why: 'With SSE-KMS, S3 calls KMS to decrypt the object’s data key on your behalf, using your permissions. So reading needs both S3 permission and permission to use the key (`kms:Decrypt`; writing needs `kms:GenerateDataKey`). There is no separate S3 action for encrypted objects, and creating keys has nothing to do with reading data protected by an existing key.',
      },
      {
        key: 'oidc-sub-mismatch',
        difficulty: 5,
        question:
          'A GitHub Actions workflow assumes an AWS role through OIDC. Deployments from `main` work, but the same workflow run for a pull request fails with “Not authorized to perform sts:AssumeRoleWithWebIdentity”. The role’s trust policy is below. Why?',
        code: json(`{
  "Effect": "Allow",
  "Principal": {
    "Federated": "arn:aws:iam::${ACCOUNT}:oidc-provider/token.actions.githubusercontent.com"
  },
  "Action": "sts:AssumeRoleWithWebIdentity",
  "Condition": {
    "StringEquals": {
      "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
      "token.actions.githubusercontent.com:sub": "repo:acme/shop:ref:refs/heads/main"
    }
  }
}`),
        correct:
          'For pull_request runs the token’s `sub` claim is `repo:acme/shop:pull_request`, which does not match the condition, so the trust policy rejects it',
        wrong: [
          'Pull requests cannot request OIDC tokens from GitHub at all',
          'The `aud` value must be the repository URL for pull requests',
          'The role’s permissions policy does not allow `s3:*`, so assuming the role is refused',
        ],
        why: 'The trust policy decides who may assume the role, and the `sub` condition pins it to tokens from the `main` branch of `acme/shop`. GitHub builds the `sub` claim from the trigger: branch pushes give `repo:<owner>/<repo>:ref:refs/heads/<branch>`, pull requests give `repo:<owner>/<repo>:pull_request`, and jobs with an environment give `repo:<owner>/<repo>:environment:<name>`. Failing to assume a role is always about the trust policy, not the role’s permissions policy. Whether pull requests should get a (separate, read-only) role is a design decision; it should not be production.',
      },
    ],
  ),
  ...scenarioFamily(
    'aws-iam-sts-oidc',
    2,
    'Which option avoids storing any long-lived AWS secret outside AWS?',
    [
      {
        key: 'replace-access-keys',
        question:
          'A GitHub Actions workflow deploys to AWS using an IAM user’s access key stored in repository secrets. What is the recommended replacement?',
        correct:
          'Register GitHub’s OIDC provider in the account and let the workflow assume a role (trust policy limited to the repository) to get short-lived credentials',
        wrong: [
          'Keep the IAM user but rotate its access key every 90 days by hand',
          'Store the access key in AWS Secrets Manager and fetch it at the start of the workflow',
          'Use the root user’s key, because it never needs permission changes',
        ],
        why: 'With OIDC, GitHub issues a signed token per job, AWS STS exchanges it (AssumeRoleWithWebIdentity) for temporary credentials, and nothing long-lived is stored in GitHub. Rotating keys still leaves a long-lived secret to leak. Fetching a key from Secrets Manager needs AWS credentials in the first place, so it does not solve the problem.',
      },
      {
        key: 'session-token',
        difficulty: 3,
        question:
          'A script calls `aws sts assume-role`, copies `AccessKeyId` and `SecretAccessKey` from the output into `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`, and every later call fails because the credentials are rejected as invalid. What did it forget?',
        correct:
          'The `SessionToken` from the same output, set as `AWS_SESSION_TOKEN`: temporary credentials are only valid with their session token',
        wrong: [
          'The role’s ARN, set as `AWS_ROLE`: every call must name the role again',
          'Nothing: AssumeRole credentials only work in the AWS console',
          'A call to `aws configure` to save the credentials permanently',
        ],
        why: 'AssumeRole returns three parts plus an expiry: access key ID, secret access key and session token. Temporary credentials (their access key IDs start with `ASIA`) are rejected without the token. The SDKs and CLI pick up `AWS_SESSION_TOKEN` automatically. The credentials expire, which is the point; they are not meant to be saved permanently.',
      },
      {
        key: 'broad-trust-condition',
        difficulty: 5,
        question:
          'The production deploy role trusts GitHub’s OIDC provider with the condition below. What is the risk, and what is the right fix?',
        code: json(`"Condition": {
  "StringEquals": {
    "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
  },
  "StringLike": {
    "token.actions.githubusercontent.com:sub": "repo:acme/*"
  }
}`),
        correct:
          'Any workflow in any repository of the `acme` organization, on any branch, can assume the production role; restrict `sub` to the deploying repository and its production environment, e.g. `repo:acme/shop:environment:production`',
        wrong: [
          'Anyone on GitHub can assume the role; adding the `aud` condition fixes it',
          'There is no risk: the wildcard only matches repositories with “acme” in the name',
          'The condition prevents all deployments because `StringLike` cannot be combined with `StringEquals`',
        ],
        why: 'The `aud` check alone proves only that the token was minted for AWS. The `sub` condition is what pins the role to a repository and context; `repo:acme/*` lets a feature branch of any repository in the organization deploy to production. Pinning `sub` to an environment also lets GitHub environment protection rules (required reviewers) gate production. Multiple condition operators in one block are combined with AND, which is fine.',
      },
    ],
  ),
  ...scenarioFamily(
    'aws-iam-secrets',
    2,
    'Think about who can see the value, how it rotates, and how often the code fetches it.',
    [
      {
        key: 'committed-password',
        difficulty: 1,
        question:
          'A developer notices a production database password committed in `appsettings.json` in the Git repository. What should happen?',
        correct:
          'Rotate the password now (it is exposed), store the new one in AWS Secrets Manager, and have the application read it at runtime through its IAM role',
        wrong: [
          'Delete the line in a new commit; the old value is then gone',
          'Make the repository private; that removes the exposure',
          'Base64-encode the password in the file so it is no longer readable',
        ],
        why: 'Once a secret is in Git history, anyone with a clone has it, so the only safe response is to rotate it. Deleting the line leaves it in history; making the repo private does not reach existing clones; Base64 is an encoding, not encryption. Keeping secrets in Secrets Manager and granting read access through IAM means the code never contains them.',
      },
      {
        key: 'needs-rotation',
        question:
          'A team needs a database credential that rotates automatically every 30 days, with applications always reading the current value. Which service fits?',
        correct: 'AWS Secrets Manager, which has built-in rotation driven by a rotation function',
        wrong: [
          'An SSM Parameter Store SecureString, which rotates its value automatically',
          'AWS KMS, by storing the password as a KMS key',
          'A Lambda environment variable, updated by each deployment',
        ],
        why: 'Secrets Manager stores secrets and rotates them on a schedule (with managed rotation for supported databases, or a Lambda rotation function you provide). Parameter Store SecureString is a good, simple store for encrypted values, but it has no built-in rotation. KMS holds encryption keys, not arbitrary secret values. Environment variables only change when you redeploy.',
      },
      {
        key: 'fetch-per-invocation',
        difficulty: 4,
        question:
          'A Lambda handler calls `GetSecretValue` at the start of every invocation. At peak traffic the team sees throttling errors from Secrets Manager and extra latency. Rotation must keep working. What is the best fix?',
        correct:
          'Cache the secret outside the handler and refresh it after a time-to-live (or use the AWS Parameters and Secrets Lambda Extension), so rotated values are still picked up',
        wrong: [
          'Copy the secret value into a plaintext environment variable at deploy time',
          'Raise the function’s memory so the calls complete faster',
          'Set reserved concurrency to 1 so only one invocation fetches the secret at a time',
        ],
        why: 'Fetching on every invocation multiplies API calls by traffic. Caching in the execution environment (with a refresh interval shorter than the rotation window, and a refetch on authentication failure) removes most calls while still following rotation. A deploy-time environment variable breaks rotation and exposes the value to anyone who can view the function configuration. Memory does not reduce call volume, and concurrency 1 would throttle the whole API.',
      },
    ],
  ),
  ...scenarioFamily(
    'aws-iam-kms',
    4,
    'A KMS key never leaves KMS. How can large data be encrypted with it, and who decides who may use it?',
    [
      {
        key: 'envelope-encryption',
        question: 'S3 encrypts a 2 GB object with SSE-KMS. How is the KMS key involved?',
        correct:
          'KMS generates a data key; S3 encrypts the object with the data key and stores the data key encrypted under the KMS key next to the object',
        wrong: [
          'S3 downloads the KMS key and encrypts the whole object with it',
          'S3 sends the 2 GB object to KMS, which encrypts it and returns the ciphertext',
          'The KMS key is used to encrypt only the object’s metadata, not its content',
        ],
        why: 'This is envelope encryption. KMS keys never leave KMS unencrypted, and KMS only encrypts small payloads directly, so services ask KMS for a data key, encrypt data locally with it, and store the encrypted data key alongside. To decrypt, the service asks KMS to decrypt the data key, which is why reading the object needs `kms:Decrypt` permission.',
      },
      {
        key: 'key-policy-blocks',
        difficulty: 5,
        question:
          'A role’s identity policy allows `kms:Decrypt` on a customer managed key in the same account. Decrypt still fails with AccessDenied. The key policy is below. Why?',
        code: json(`{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "KeyAdmins",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::${ACCOUNT}:role/SecurityAdmin" },
      "Action": "kms:*",
      "Resource": "*"
    }
  ]
}`),
        correct:
          'For KMS the key policy is the starting point: it neither grants the role access nor delegates to IAM (no statement for the account principal), so identity policies have no effect on this key',
        wrong: [
          'Identity policies cannot grant KMS permissions; only grants can',
          'The role must also have `kms:*`, because Decrypt depends on every other KMS action',
          '`"Resource": "*"` in a key policy is invalid, so the whole key policy is ignored and access is denied',
        ],
        why: 'Unlike most services, a KMS key can only be used if its key policy allows it. The default key policy contains a statement for the account principal (`arn:aws:iam::<account>:root`) that lets IAM policies grant access; this custom policy removed it, so only `SecurityAdmin` can use the key, whatever IAM policies say. In a key policy, `"Resource": "*"` means “this key” and is normal.',
      },
    ],
  ),
];
