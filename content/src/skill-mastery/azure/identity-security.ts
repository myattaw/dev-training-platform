import type { QuestionSource } from '@pracstack/content-model';
import { json, plain } from '../helpers';
import { scenarioFamily } from './builders';

/*
 * Azure identity and security: scopes and RBAC inheritance, Microsoft Entra ID,
 * managed identities, secrets in configuration, DefaultAzureCredential, private
 * endpoints, and logging for incident response. Scenario reasoning only.
 */

const defaultCredentialCode =
  plain(`// C# (Azure.Identity and Azure.Security.KeyVault.Secrets packages)
var client = new SecretClient(
    new Uri("https://kv-orders.vault.azure.net/"),
    new DefaultAzureCredential());

KeyVaultSecret secret = await client.GetSecretAsync("OrdersDb");`);

export const identitySecurityFamilies: readonly QuestionSource[] = [
  ...scenarioFamily(
    'az-rbac-scope',
    1,
    'Role assignments flow down the hierarchy: from a scope to everything inside it, never sideways or up.',
    [
      {
        key: 'sibling-resource-group',
        question:
          'Dana has this role assignment. She tries to restart a web app in the resource group `rg-payments`, in the same subscription. What happens?',
        code: plain(`Principal      Role          Scope
dana           Contributor   /subscriptions/<sub-id>/resourceGroups/rg-orders`),
        correct:
          'It is denied: the assignment covers `rg-orders` and the resources inside it, not other resource groups',
        wrong: [
          'It succeeds: Contributor always applies to the whole subscription',
          'It succeeds because both resource groups are in the same subscription',
          'It succeeds only if both resource groups are in the same region',
        ],
        why: 'A role assignment applies at its scope and is inherited by everything below it. `rg-payments` is a sibling of `rg-orders`, not a child, so Dana has no role there. The tempting answer assumes a role name carries a scope of its own; the scope is part of the assignment.',
      },
      {
        key: 'subscription-inherits-down',
        question:
          'Sam has Reader at subscription scope. A storage account is later created in a brand-new resource group `rg-archive` in that subscription. Can Sam view the storage account’s configuration?',
        code: plain(`Principal   Role     Scope
sam         Reader   /subscriptions/<sub-id>`),
        correct:
          'Yes: a subscription-scope assignment is inherited by every resource group and resource in it, including ones created later',
        wrong: [
          'No: each resource group needs its own assignment',
          'No: inheritance only covers resource groups that existed when the role was assigned',
          'Only if the storage account is in the subscription’s home region',
        ],
        why: 'Inheritance is evaluated at access time, so new resource groups and resources under the subscription are covered automatically. Subscriptions have no region; region is a property of individual resources.',
      },
      {
        key: 'hierarchy-order',
        question: 'Which list orders Azure RBAC scopes from broadest to narrowest?',
        correct: 'Management group → subscription → resource group → resource',
        wrong: [
          'Subscription → management group → resource group → resource',
          'Resource group → subscription → management group → resource',
          'Management group → resource group → subscription → resource',
        ],
        why: 'Management groups organize subscriptions, subscriptions contain resource groups, and resource groups contain resources. A role assigned at any level applies to everything below it.',
      },
      {
        key: 'assignments-add-up',
        difficulty: 3,
        question:
          'Priya has both assignments below. What can she do with a virtual machine in `rg-web` and one in `rg-data` (same subscription)?',
        code: plain(`Principal   Role          Scope
priya       Reader        /subscriptions/<sub-id>
priya       Contributor   /subscriptions/<sub-id>/resourceGroups/rg-web`),
        correct:
          'She can manage the VM in `rg-web` and only read the VM in `rg-data`, because role assignments add up',
        wrong: [
          'She can only read both: the broader Reader assignment overrides the narrower one',
          'She can manage both: Contributor anywhere in the subscription applies everywhere',
          'She gets access denied in `rg-web` because the two assignments conflict',
        ],
        why: 'Azure RBAC is additive: effective permissions are the union of all role assignments that apply at a scope. Reader does not take anything away from Contributor; only deny assignments remove access. Contributor at `rg-web` does not reach `rg-data`.',
      },
    ],
  ),
  ...scenarioFamily(
    'az-entra-concepts',
    2,
    'Separate the definition of an application from the identity that acts in a tenant.',
    [
      {
        key: 'app-registration-service-principal',
        question:
          'A team creates an app registration in their Microsoft Entra tenant for a background service, and grants it access to a storage account. Which object is the role assignment actually made to?',
        correct:
          'The service principal (enterprise application) that represents the app in the tenant',
        wrong: [
          'The client secret of the app registration',
          'The user account of the developer who created the registration',
          'The subscription that contains the storage account',
        ],
        why: 'An app registration is the global definition of an application; the service principal is its identity in a specific tenant, and that is what RBAC roles are assigned to. A client secret is only a credential the service principal uses to prove who it is.',
      },
      {
        key: 'managed-identity-is-service-principal',
        question: 'What is a managed identity, underneath?',
        correct:
          'A service principal in Microsoft Entra ID whose credentials Azure creates and rotates, so your code never stores a secret',
        wrong: [
          'A user account whose password is kept in the app’s settings',
          'A Key Vault secret holding a client secret for the app',
          'A built-in RBAC role that grants access to Azure services',
        ],
        why: 'A managed identity is a special kind of service principal. The platform obtains tokens for it on the app’s behalf, so there is no secret in configuration to leak or rotate. It still needs role assignments: an identity is not a permission.',
      },
    ],
  ),
  ...scenarioFamily(
    'az-managed-identity-kinds',
    2,
    'Ask how long the identity must live and whether several resources share it.',
    [
      {
        key: 'shared-across-apps',
        question:
          'Ten function apps need the same access to one storage account. The team wants to grant that access once, and keep it even when an app is deleted and recreated. Which identity fits?',
        correct: 'One user-assigned managed identity attached to all ten apps',
        wrong: [
          'A system-assigned managed identity, attached to all ten apps',
          'A client secret for one app registration, copied into each app’s settings',
          'The developer’s own account, used by each app',
        ],
        why: 'A user-assigned identity is a standalone resource: it can be attached to many apps and outlives them, so one set of role assignments serves all ten. A system-assigned identity belongs to exactly one resource and cannot be shared; copying a client secret reintroduces the secret management managed identities avoid.',
      },
      {
        key: 'recreated-app',
        question:
          'A web app with a system-assigned managed identity had Key Vault Secrets User on a vault. The app is deleted and recreated with the same name, and system-assigned identity is enabled again. Can it read secrets?',
        correct:
          'Not until access is granted again: the old identity was deleted with the app, and the new one is a different principal',
        wrong: [
          'Yes: the identity is derived from the app name, so it is the same principal',
          'Yes: role assignments move automatically to the new identity',
          'Yes: the new app inherits the identity of its resource group',
        ],
        why: 'A system-assigned identity shares the life cycle of its resource. Recreating the app creates a new service principal with a new object ID; the old role assignment refers to a principal that no longer exists. When access must survive recreation, use a user-assigned identity.',
      },
    ],
  ),
  ...scenarioFamily(
    'az-least-privilege',
    3,
    'Pick the narrowest scope that covers the task, and a role that grants exactly the kind of action needed.',
    [
      {
        key: 'pipeline-deploys-one-app',
        question:
          'A deployment pipeline’s service principal only needs to deploy code to the web app `app-shop-prod`. Which assignment follows least privilege?',
        correct: 'Contributor (or a narrower web app role) scoped to the `app-shop-prod` web app',
        wrong: [
          'Owner on the subscription',
          'Contributor on the subscription',
          'User Access Administrator on the resource group',
        ],
        why: 'Least privilege means the smallest scope and the weakest role that still works. A subscription-wide role lets a compromised pipeline change everything; Owner also lets it grant access to others. User Access Administrator can manage role assignments but cannot deploy code at all.',
      },
      {
        key: 'grant-access-without-changing-resources',
        question:
          'A team lead must be able to give teammates Reader on `rg-analytics`, but must not be able to change any resource. Which assignment fits?',
        correct: 'User Access Administrator scoped to `rg-analytics`',
        wrong: [
          'Contributor scoped to `rg-analytics`',
          'Reader scoped to `rg-analytics`',
          'Owner on the subscription',
        ],
        why: 'Managing role assignments is a separate permission. User Access Administrator can assign roles but not modify resources. Contributor is the classic trap: it can change every resource but cannot assign roles. Reader can do neither, and Owner on the subscription is far too broad.',
      },
      {
        key: 'read-secret-values',
        question:
          'An app’s managed identity must read secret values from `kv-orders`, which uses the Azure RBAC permission model. Which assignment fits?',
        correct: 'Key Vault Secrets User on `kv-orders`',
        wrong: [
          'Key Vault Reader on `kv-orders`',
          'Contributor on `kv-orders`',
          'Key Vault Administrator on the subscription',
        ],
        why: 'Reading a secret’s value is a data-plane action, granted by Key Vault Secrets User. Key Vault Reader only reads metadata (names, attributes), not values. Contributor manages the vault resource (control plane) but grants no data actions. Key Vault Administrator works but grants full data access to every vault in the subscription.',
      },
    ],
  ),
  ...scenarioFamily(
    'az-secrets-config',
    3,
    'Configuration should point at where a secret lives, and the app’s identity must be allowed to fetch it.',
    [
      {
        key: 'unresolved-key-vault-reference',
        question:
          'A function app has this app setting. At runtime, the app reads `OrdersDb` and gets the literal text starting with `@Microsoft.KeyVault(` instead of the connection string. What is the most likely cause?',
        code: json(`{
  "name": "OrdersDb",
  "value": "@Microsoft.KeyVault(SecretUri=https://kv-orders.vault.azure.net/secrets/OrdersDb/)",
  "slotSetting": false
}`),
        correct:
          'The reference could not be resolved: the app has no managed identity, or its identity is not allowed to read the secret',
        wrong: [
          'Key Vault references only work in local.settings.json, not in Azure',
          'The secret URI has no version, and unversioned references are never resolved',
          'App setting values cannot contain parentheses',
        ],
        why: 'The platform resolves a Key Vault reference using the app’s managed identity; when it cannot, the setting keeps the reference text. Check that the identity exists and has secret read access (and that the vault is reachable). A reference without a version is valid and uses the latest version of the secret.',
      },
      {
        key: 'committed-local-settings',
        question:
          'A developer committed local.settings.json, which contains the production storage account key, to a shared repository. What is the right response?',
        correct:
          'Rotate the exposed key, remove the file from source control and ignore it, and move the deployed app to a managed identity or a Key Vault reference',
        wrong: [
          'Delete the file in a new commit; once it is gone from the latest version the key is safe',
          'Rename the file to appsettings.json, which is never deployed',
          'Make the repository private; the key then does not need rotating',
        ],
        why: 'Anything committed stays in history and clones, so the key must be treated as leaked and regenerated. Deleting the file or restricting the repository does not un-leak it. Then remove the root cause: local.settings.json is for local development only and should be git-ignored, and the cloud app should not need the key at all.',
      },
      {
        key: 'what-private-endpoint-changes',
        question:
          'A storage account gets a private endpoint in the application’s virtual network. What does that change?',
        correct:
          'The storage account gets a private IP address in the VNet, so traffic from the VNet can reach it privately and public network access can then be disabled',
        wrong: [
          'Requests no longer need authentication or RBAC, because only the VNet can reach the account',
          'Traffic becomes encrypted, which it was not before',
          'The storage account moves into the virtual network’s region',
        ],
        why: 'A private endpoint is a network interface with a private IP that maps to the service. It controls the network path, not identity: callers still need keys, tokens and roles. Traffic to Azure storage is already encrypted with TLS either way.',
      },
    ],
  ),
  ...scenarioFamily(
    'az-default-credential',
    4,
    'DefaultAzureCredential tries a chain of credential types in a fixed order and uses the first one that is configured.',
    [
      {
        key: 'local-and-azure',
        question:
          'This C# code reads a secret. It works on a developer laptop where the developer is signed in with the Azure CLI, and in Azure where the app has a managed identity with Key Vault Secrets User. Why does it work in both places without code changes?',
        code: defaultCredentialCode,
        correct:
          'DefaultAzureCredential tries several credential types in order; in Azure the managed identity credential succeeds, and locally a developer-tool credential such as the Azure CLI succeeds',
        wrong: [
          'It reads a client secret from local.settings.json in both places',
          'Key Vault allows anonymous reads from inside Azure',
          'The developer’s token is packaged with the deployment and reused in Azure',
        ],
        why: 'DefaultAzureCredential is a chain: environment variables, workload identity, managed identity, then developer tools. Each environment supplies a different link of the chain, so the same code runs everywhere without secrets in configuration. Each identity still needs its own role on the vault.',
      },
      {
        key: 'stale-environment-variables',
        question:
          'The same code fails in Azure with an invalid client secret error, although the app’s managed identity has Key Vault Secrets User. The app settings below were left from an older setup. What is going on?',
        code: plain(`App settings
AZURE_TENANT_ID      = 72f9...
AZURE_CLIENT_ID      = 1b0c...   (an old app registration)
AZURE_CLIENT_SECRET  = (expired)

Exception
Azure.Identity.AuthenticationFailedException: EnvironmentCredential authentication failed:
... invalid client secret provided ...`),
        correct:
          'The environment credential is tried before managed identity; because those variables are set it attempts to sign in with the expired secret and fails, so managed identity is never reached',
        wrong: [
          'Managed identities stop working when any client secret exists in the tenant',
          'The managed identity’s own secret expired and must be rotated in Entra ID',
          'Key Vault Secrets User only works with client-secret sign-in',
        ],
        why: 'Environment variables come first in the chain. A credential that is configured but fails to authenticate stops the chain with an error instead of falling through. Remove the stale variables (or fix them) so the managed identity is used. A managed identity has no secret you rotate.',
      },
      {
        key: 'two-user-assigned-identities',
        question:
          'A function app has two user-assigned managed identities and no system-assigned identity. The code creates `new DefaultAzureCredential()` with no options and fails to get a managed identity token. What fixes it?',
        code: defaultCredentialCode,
        correct:
          'Tell the credential which identity to use by its client ID, for example through `DefaultAzureCredentialOptions.ManagedIdentityClientId`',
        wrong: [
          'Add a third user-assigned identity so one can be chosen by majority',
          'Give both identities the same role so either one may be picked',
          'Enable public network access on the key vault',
        ],
        why: 'Without a system-assigned identity, the platform cannot guess which of several user-assigned identities you mean, so the request must name one by client ID (or resource ID). Network access is unrelated: this fails before any call to Key Vault.',
      },
    ],
  ),
  ...scenarioFamily(
    'az-private-dns',
    4,
    'Look at which IP address the name resolves to from where the app runs.',
    [
      {
        key: 'zone-not-linked',
        question:
          'A storage account has public network access disabled and a private endpoint at 10.1.2.4 in `vnet-app`. A web app with VNet integration into `vnet-app` gets 403 AuthorizationFailure. From the app’s console you see this. What is wrong?',
        code: plain(`> nslookup storders.blob.core.windows.net
Non-authoritative answer:
Name:    blob.ams23prdstr05a.store.core.windows.net
Address: 20.60.222.4
Aliases: storders.blob.core.windows.net
         storders.privatelink.blob.core.windows.net`),
        correct:
          'The name resolves to the public IP: the privatelink DNS zone is not linked to (or not used by) the VNet, so traffic goes to the blocked public endpoint',
        wrong: [
          'The app’s managed identity lacks a storage data role',
          'Private endpoints only work for virtual machines, not web apps',
          'The storage account is in a different region from the VNet',
        ],
        why: 'The CNAME to the privatelink name is there, but nothing answers that name with the private IP, so it falls through to a public address. Link the `privatelink.blob.core.windows.net` private DNS zone to the VNet (or forward to it from your DNS server). A missing role would also give 403, but the public IP in the lookup already shows the request never reaches the private endpoint.',
      },
    ],
  ),
  ...scenarioFamily(
    'az-key-vault-data-plane',
    5,
    'Key Vault has a management plane and a data plane, and which authorization system the data plane uses is a vault setting.',
    [
      {
        key: 'contributor-forbidden',
        question:
          'A user with Contributor on a vault that uses the Azure RBAC permission model gets this when reading a secret. Why?',
        code: plain(`Status: 403 Forbidden
Code:   ForbiddenByRbac
Message: Caller is not authorized to perform action on resource.
Action: 'Microsoft.KeyVault/vaults/secrets/getSecret/action'`),
        correct:
          'Contributor grants management actions on the vault but no data actions; reading a secret needs a data-plane role such as Key Vault Secrets User',
        wrong: [
          'Contributor only works once the user also signs in with an access key',
          'Only Owner can read secrets in an RBAC vault',
          'The vault is soft-deleted, so all reads return 403',
        ],
        why: 'Azure roles separate Actions (control plane) from DataActions (data plane). Contributor has broad Actions and no DataActions, so it can change the vault’s settings but cannot read its secrets. Owner is no different here. Grant the narrowest data role that fits.',
      },
      {
        key: 'access-policy-model',
        question:
          'An app’s managed identity has Key Vault Secrets User on `kv-legacy`, but reading a secret returns 403. The vault’s properties include the setting below. What is the fix?',
        code: json(`{
  "properties": {
    "enableRbacAuthorization": false,
    "accessPolicies": []
  }
}`),
        correct:
          'The vault uses access policies, so RBAC data roles are ignored: add an access policy for the identity or migrate the vault to the RBAC permission model',
        wrong: [
          'Wait: RBAC data roles take effect only after the next secret rotation',
          'Assign Key Vault Secrets User at subscription scope instead of vault scope',
          'Grant the identity Contributor on the vault as well',
        ],
        why: 'With `enableRbacAuthorization` false, the data plane is authorized by the vault’s access policies only; data-plane role assignments are not evaluated at any scope. Note the risk of the access policy model: anyone who can modify the vault (such as Contributor) can add an access policy for themselves.',
      },
      {
        key: 'deleted-secret-no-logs',
        question:
          'A production secret was deleted yesterday. Diagnostic settings were never configured on the vault, and the Activity Log shows no delete. What is the accurate conclusion and next step?',
        correct:
          'Secret operations are data-plane events that are only kept if resource logs are collected; recover the soft-deleted secret, configure diagnostic settings, and look for other evidence of who had access',
        wrong: [
          'The Activity Log is just delayed; wait a day and the secret deletion will appear',
          'Entra ID sign-in logs record each secret name that was deleted',
          'The secret is gone for good, because soft delete protects vaults but not secrets',
        ],
        why: 'The Activity Log records control-plane operations on resources (create, update, delete the vault). Reads and deletes of individual secrets are data-plane operations, recorded only in the vault’s resource logs, which must be routed by a diagnostic setting before the incident. Soft delete applies to secrets too, so the secret can be recovered.',
      },
      {
        key: 'leaked-key-order',
        question:
          'A storage account key is found in a public repository. Apps currently use that key. What should happen first?',
        correct:
          'Switch the apps to the other key (or a managed identity) and regenerate the leaked key, then investigate access logs and fix the root cause',
        wrong: [
          'Rewrite the repository history first; rotation is unnecessary if the key was public only briefly',
          'Watch the logs for a week before rotating, so the attacker is not alerted',
          'Disable the storage account’s diagnostic logs so the attacker cannot read them',
        ],
        why: 'Containment comes first: a leaked key is valid until it is regenerated, and automated scanners find public keys within minutes. Moving apps to the second key (or to a managed identity) first avoids an outage. Logs are evidence: keep them, then investigate.',
      },
    ],
  ),
];
