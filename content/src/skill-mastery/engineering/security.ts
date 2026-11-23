import type { QuestionSource } from '@pracstack/content-model';
import { cs, plain } from '../helpers';
import { scenarioFamily, selectFamily } from './builders';

/*
 * Secure coding: OWASP Top 10 risks applied to code (injection, XSS, CSRF,
 * broken access control, cryptographic failures, vulnerable components,
 * logging), secrets, threat modeling and incident response. C# shown as
 * `csharp` is compiled and run; code that needs packages (SqlClient, EF Core)
 * and TypeScript or Razor markup is shown as text.
 */

export const secureCodingFamilies: readonly QuestionSource[] = [
  // ---------------------------------------------------------------- Injection
  ...scenarioFamily(
    'eng-sec-sql-injection',
    1,
    'Ask whether user input can change the structure of the SQL statement, or only a value in it.',
    [
      {
        key: 'spot-injection',
        question: [
          "This C# code uses `Microsoft.Data.SqlClient`. An attacker submits the email `' OR '1'='1`. What happens?",
        ],
        code: plain(`var sql = "SELECT Id, Email, Role FROM Users WHERE Email = '" + email + "'";
using var command = new SqlCommand(sql, connection);
using var reader = command.ExecuteReader();`),
        correct:
          'The input becomes part of the SQL, so the condition is always true and every user is returned: SQL injection',
        wrong: [
          'No user matches that email, so the query returns no rows',
          'SQL Server rejects the query because of the extra quotes',
          '`SqlCommand` escapes the quotes automatically',
        ],
        why: "Concatenating input into SQL lets the input change the statement's structure: the query becomes `WHERE Email = '' OR '1'='1'`, which matches every row. `SqlCommand` executes the text it is given; it cannot know which parts came from the user. The fix is a parameterised query.",
      },
      {
        key: 'choose-fix',
        difficulty: 2,
        question:
          'Which change fixes the SQL injection in a C# query built as `"... WHERE Email = \'" + email + "\'"` (using `Microsoft.Data.SqlClient`)?',
        correct:
          'Use `WHERE Email = @email` and add the value with `command.Parameters.Add("@email", SqlDbType.NVarChar, 256).Value = email`',
        wrong: [
          'Escape the input with `email.Replace("\'", "\'\'")` before concatenating',
          'Reject input that contains the words `OR`, `AND` or `--`',
          'Move the same concatenation into a stored procedure that runs it with `EXEC`',
        ],
        why: 'With a parameter, the SQL text is fixed and the value is sent separately, so the database never interprets it as SQL. Hand-escaping and keyword blocklists are fragile: they miss encodings and edge cases, and block legitimate input. A stored procedure that concatenates and runs dynamic SQL is just as injectable.',
      },
      {
        key: 'sort-column',
        difficulty: 4,
        question:
          'The sort column comes from the query string (`?sort=name`). Column names cannot be sent as SQL parameters. How should this code build the query safely?',
        code: cs(`Console.WriteLine(BuildQuery("name"));
Console.WriteLine(BuildQuery("name; DROP TABLE Customers--"));

static string BuildQuery(string sort)
{
    var column = sort switch
    {
        "name" => "Name",
        "created" => "CreatedAt",
        _ => "Id",
    };
    return $"SELECT Id, Name FROM Customers ORDER BY {column}";
}`),
        correct:
          'As it does: map the input to a fixed allow-list of known column names, so the SQL only ever contains text the developer wrote',
        wrong: [
          'Pass `sort` as a parameter, `ORDER BY @sort`, like any other value',
          'Wrap the raw input in brackets, `ORDER BY [` + sort + `]`',
          'Remove semicolons from `sort` and then concatenate it',
        ],
        why: 'Identifiers such as column names are part of the SQL structure, so parameters cannot supply them (a parameter would be a constant value, not a column). Mapping input to a fixed set of developer-written names means unknown input can never reach the SQL; here it falls back to `Id`. Brackets can be closed by input containing `]`, and stripping characters is a blocklist that misses other tricks.',
      },
    ],
  ),
  ...selectFamily(
    'eng-sec-ef-core-raw-sql',
    4,
    'Check whether the value travels as a parameter or is pasted into the SQL text.',
    [
      {
        key: 'which-vulnerable',
        question:
          'These are C# EF Core queries, where `name` comes from the user. Which of them are vulnerable to SQL injection?',
        right: [
          '`db.Users.FromSqlRaw($"SELECT * FROM Users WHERE Name = \'{name}\'")`',
          '`db.Users.FromSqlRaw("SELECT * FROM Users WHERE Name = \'" + name + "\'")`',
        ],
        wrong: [
          '`db.Users.FromSql($"SELECT * FROM Users WHERE Name = {name}")`',
          '`db.Users.FromSqlRaw("SELECT * FROM Users WHERE Name = {0}", name)`',
          '`db.Users.Where(u => u.Name == name)`',
        ],
        why: '`FromSql` takes a `FormattableString` and turns each interpolated value into a database parameter, and `FromSqlRaw` turns `{0}` placeholders with separate arguments into parameters. LINQ queries are always parameterised. But passing an already interpolated or concatenated string to `FromSqlRaw` builds the SQL text from user input before EF Core sees it. The two look almost the same, which is why raw SQL needs careful review.',
      },
    ],
  ),

  // ---------------------------------------------------------------- Cross-site scripting
  ...scenarioFamily(
    'eng-sec-xss',
    2,
    'Ask whether user-controlled text is inserted as text, or interpreted as HTML or script.',
    [
      {
        key: 'razor-raw',
        question:
          'A comment contains `<script>steal(document.cookie)</script>`. Which line in this Razor view lets the script run?',
        code: plain(`<p>@Model.Author</p>                       @* line 1 *@
<p title="@Model.Author">Author</p>        @* line 2 *@
<div>@Html.Raw(Model.CommentBody)</div>    @* line 3 *@
<span>@Model.CommentBody.Length chars</span> @* line 4 *@`),
        correct: 'Line 3, because `Html.Raw` outputs the comment as HTML without encoding',
        wrong: ['Line 1', 'Line 2', 'Line 4'],
        why: 'Razor HTML-encodes every `@` expression by default, so `<script>` is shown as text. `Html.Raw` turns that protection off and writes the markup as-is, so user content passed to it can run script. Only use it for HTML you generated or sanitised with a proper HTML sanitiser.',
      },
      {
        key: 'angular-bypass',
        difficulty: 3,
        question:
          'In this Angular component, `user.bio` is text the user typed in their profile. What is the risk?',
        code: plain(`@Component({
  selector: 'app-profile',
  template: \`<div [innerHTML]="bio"></div>\`,
})
export class ProfileComponent {
  private readonly sanitizer = inject(DomSanitizer);
  bio: SafeHtml = '';

  show(user: User) {
    this.bio = this.sanitizer.bypassSecurityTrustHtml(user.bio);
  }
}`),
        correct:
          "`bypassSecurityTrustHtml` switches off Angular's sanitisation, so a bio containing script, such as an `onerror` handler, runs in other users' browsers",
        wrong: [
          'None: `[innerHTML]` bindings are always sanitised by Angular',
          'None: Angular templates cannot contain user data',
          'Only that the bio may display with broken formatting',
        ],
        why: 'Without the bypass, Angular sanitises values bound to `[innerHTML]`, removing scripts and event handlers. Marking a value as trusted tells Angular to skip that, so it must only be used for content you control. User-provided HTML should go through the normal binding or a sanitiser.',
      },
      {
        key: 'dom-innerhtml',
        difficulty: 4,
        question: 'This TypeScript runs in the browser. What is the problem, and what is the fix?',
        code: plain(`const name = new URLSearchParams(location.search).get('name') ?? 'guest';
document.querySelector('#greeting')!.innerHTML = 'Welcome, ' + name;`),
        correct:
          'A link such as `?name=<img src=x onerror=...>` runs script (DOM-based XSS); assign to `textContent` instead, so the value is treated as text',
        wrong: [
          'Remove `<script>` tags from `name` with a regular expression before assigning it',
          'Limit `name` to 50 characters',
          "There is no problem, because the value comes from the page's own URL",
        ],
        why: '`innerHTML` parses its value as HTML, and an attacker controls the URL they send a victim. Many payloads need no `<script>` tag at all, such as an image with an `onerror` handler, so stripping script tags does not help, and short payloads fit in 50 characters. `textContent` never interprets markup.',
      },
      {
        key: 'csp-unsafe-inline',
        difficulty: 5,
        question:
          'A site with a stored XSS bug sends this header. Does it stop an injected inline `<script>` block from running?',
        code: plain(
          `Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'`,
        ),
        correct:
          "No: `'unsafe-inline'` allows inline scripts, including injected ones; use nonces or hashes for legitimate inline scripts, and still fix the encoding bug",
        wrong: [
          "Yes: `'self'` only allows scripts that come from the site itself",
          'Yes: `default-src` blocks all inline content',
          'No, but only because CSP has no effect on stored XSS',
        ],
        why: "An injected script block is served by the site itself, so the browser cannot tell it from a legitimate inline script unless the policy demands a nonce or hash. `'unsafe-inline'` removes exactly the protection CSP gives against XSS. CSP is a valuable second layer, but the primary fix is still encoding output correctly.",
      },
    ],
  ),

  // ---------------------------------------------------------------- CSRF
  ...scenarioFamily(
    'eng-sec-csrf',
    3,
    'CSRF abuses credentials the browser attaches automatically. Ask which credentials are automatic here.',
    [
      {
        key: 'cookie-form',
        question:
          "An ASP.NET Core MVC app uses cookie authentication. `POST /account/email` changes the account's email. An attacker's page contains a hidden form that posts to it automatically. Which defence stops the attack?",
        correct:
          'Validate an anti-forgery token on state-changing requests (as `[ValidateAntiForgeryToken]` does), together with `SameSite` session cookies',
        wrong: [
          'Accept only POST requests for the endpoint',
          'Serve the site only over HTTPS',
          'Validate the format of the new email address',
        ],
        why: "The browser attaches the session cookie to the forged request, so the server sees a logged-in user. An anti-forgery token is a value the attacker's page cannot read or guess, so forged requests fail validation. `SameSite` cookies add a browser-side layer. A cross-site form can POST, HTTPS does not change what the browser sends, and the attacker supplies a perfectly valid email.",
      },
      {
        key: 'bearer-token-spa',
        difficulty: 4,
        question:
          'A single-page app keeps its access token in memory and sends it in an `Authorization: Bearer` header. No cookies are used for authentication. How does CSRF apply?',
        correct:
          "CSRF is not the main risk, because an attacker's page cannot make the browser add the header; protecting the token from XSS matters more",
        wrong: [
          'CSRF is a high risk, because browsers attach the `Authorization` header to every request',
          'CSRF is prevented only if the API also validates an anti-forgery token',
          'CSRF is a high risk, because bearer tokens are sent to every site',
        ],
        why: "CSRF works because browsers send cookies automatically with cross-site requests. A header that the app's own JavaScript adds is not sent by a forged request from another origin. The trade-off is that a token readable by JavaScript can be stolen by XSS, so output encoding and CSP become more important. If authentication moves back to cookies, CSRF protection is needed again.",
      },
      {
        key: 'samesite-lax-get',
        difficulty: 5,
        question:
          'The session cookie is `SameSite=Lax`. The app has `GET /transfer?to=...&amount=...`, which moves money. An attacker posts a link to it on a forum. Is the app protected?',
        correct:
          'No: `Lax` cookies are still sent on top-level GET navigations from other sites, so clicking the link performs the transfer; state changes belong in POST requests with anti-forgery protection',
        wrong: [
          'Yes: `SameSite=Lax` blocks cookies on all requests from other sites',
          'Yes: GET requests cannot change data',
          'No, but only for users of browsers without `SameSite` support',
        ],
        why: '`Lax` blocks cookies on cross-site subresource requests and cross-site POSTs, but allows them when the user follows a link, so normal links into the site keep working. A state-changing GET defeats that protection. HTTP semantics say GET should be safe, but only the code decides whether it is.',
      },
    ],
  ),

  // ---------------------------------------------------------------- Access control
  ...scenarioFamily(
    'eng-sec-access-control',
    2,
    'Authentication says who the user is; authorisation must check, on the server, what they may access.',
    [
      {
        key: 'idor',
        question:
          'The API handles `GET /invoices/{id}` by calling `GetInvoice(id, currentUserId)`. User `user-7` requests invoice 1002, which belongs to `user-9`. What is the bug and the fix?',
        code: cs(`var service = new InvoiceService();
Console.WriteLine(service.GetInvoice(invoiceId: 1002, currentUserId: "user-7")?.Total);

record Invoice(int Id, string OwnerId, decimal Total);

class InvoiceService
{
    private readonly Dictionary<int, Invoice> invoices = new()
    {
        [1001] = new Invoice(1001, "user-7", 120m),
        [1002] = new Invoice(1002, "user-9", 980m),
    };

    public Invoice? GetInvoice(int invoiceId, string currentUserId) =>
        invoices.GetValueOrDefault(invoiceId);
}`),
        correct:
          'Insecure direct object reference: `currentUserId` is never checked; return the invoice only if its `OwnerId` matches, and respond as not found otherwise',
        wrong: [
          'The IDs are guessable; switching to GUIDs fixes it',
          "The user interface should not show links to other users' invoices",
          'The endpoint should require HTTPS',
        ],
        why: 'Any logged-in user can read any invoice by changing the number in the URL, a classic case of broken access control. The server must check ownership on every request. Unguessable IDs make attacks harder but are not access control: IDs leak through logs, links and referrers. Hiding links only changes the user interface, not what the API allows.',
      },
      {
        key: 'client-side-only',
        difficulty: 3,
        question:
          'The Angular app shows the "Delete user" button only when `isAdmin` is true. The API endpoint `DELETE /api/users/{id}` has `[Authorize]` and no other check. What is the risk?',
        correct:
          'Any signed-in user can call the endpoint directly and delete users; the API must check the role or policy, for example `[Authorize(Roles = "Admin")]`',
        wrong: [
          'None: users cannot press a button that is not displayed',
          'None: `[Authorize]` already restricts the endpoint to administrators',
          'Only administrators who disable JavaScript can misuse it',
        ],
        why: "The browser is under the user's control: anyone can send the request with developer tools or `curl`. Hiding the button is a usability choice, not a security control. Plain `[Authorize]` only requires that the user is authenticated; authorisation rules for roles or policies must be enforced by the server on every request.",
      },
      {
        key: 'mass-assignment',
        difficulty: 4,
        question:
          "This C# ASP.NET Core action updates a user's profile. What is the vulnerability?",
        code: plain(`public class User
{
    public int Id { get; set; }
    public string DisplayName { get; set; } = "";
    public bool IsAdmin { get; set; }
}

[HttpPut("profile")]
public async Task<IActionResult> UpdateProfile([FromBody] User user)
{
    user.Id = CurrentUserId();
    db.Users.Update(user);
    await db.SaveChangesAsync();
    return NoContent();
}`),
        correct:
          'Mass assignment: a request body with `"isAdmin": true` makes the caller an administrator; bind a DTO with only the editable fields and copy them onto the stored user',
        wrong: [
          'SQL injection through `DisplayName`',
          'Cross-site scripting, because `DisplayName` is not encoded when saved',
          'None: the action sets `Id` from the signed-in user, so only their own row changes',
        ],
        why: 'Binding the request straight to the entity lets the client set every property, including ones it should never control. Setting `Id` correctly limits whose row changes, not which fields. A request model with only `DisplayName` makes privilege fields impossible to send. EF Core parameterises the update, and encoding belongs at output time.',
      },
    ],
  ),

  // ---------------------------------------------------------------- Secrets and dependencies
  ...scenarioFamily(
    'eng-sec-secrets-dependencies',
    2,
    'Assume anything that was ever pushed is already copied; and know exactly which versions you ship.',
    [
      {
        key: 'pushed-api-key',
        difficulty: 3,
        question:
          'Ten minutes ago you pushed a commit containing a live API key to a public repository. You removed it in the next commit. What should you do now?',
        correct:
          'Revoke or rotate the key at the provider immediately, check its usage logs for misuse, and then clean it from history',
        wrong: [
          'Nothing: the key was removed in the next commit',
          'Rewrite history with a force push to remove the commit; then the key is safe',
          'Make the repository private',
        ],
        why: 'The key is still in the repository history, and public repositories are scanned for secrets within minutes, so assume it is compromised. Only revoking it makes it useless. Rewriting history or making the repository private does not reach copies that were already taken; cleaning up is worthwhile only after rotation.',
      },
      {
        key: 'lockfile',
        question:
          "Yesterday's build of commit `4d2e1f0` passed. Today a rebuild of the same commit fails, because a dependency released a new minor version that breaks the app. The `package-lock.json` file is not committed. What is the fix?",
        correct:
          'Commit the lockfile and install with `npm ci`, then take dependency updates deliberately through pull requests (for example from Dependabot)',
        wrong: [
          'Pin every version range in `package.json` with `^`',
          'Delete `node_modules` before every build',
          'Rebuild until the dependency publishes a fix',
        ],
        why: 'Without a lockfile, each install resolves version ranges afresh, so the same commit can build with different code each day, which is also how a malicious or broken release slips in unnoticed. A committed lockfile with `npm ci` installs exactly the reviewed versions. `^` allows new minor versions, which is what happened.',
      },
      {
        key: 'transitive-vulnerability',
        difficulty: 4,
        question:
          'Dependabot reports a critical vulnerability in `xml-parser` 2.1.0, a transitive dependency pulled in by `report-lib`. Version 2.1.4 fixes it. What is the best response?',
        correct:
          'Upgrade so the resolved version is 2.1.4 or later (a newer `report-lib`, or an override of the transitive version), run the tests and ship it promptly',
        wrong: [
          'Dismiss the alert, because the app does not depend on `xml-parser` directly',
          'Delete the lockfile so that every package resolves to its latest version',
          'Wait for the next quarterly dependency upgrade',
        ],
        why: 'Transitive dependencies run inside your application just like direct ones, so the vulnerability is yours. Targeted upgrades, verified by tests, fix it quickly without unrelated changes. Deleting the lockfile upgrades everything at once, uncontrolled. If a fix is impossible, assess whether the vulnerable code is reachable and record the decision, rather than silently dismissing it.',
      },
    ],
  ),

  // ---------------------------------------------------------------- Passwords and logging
  ...scenarioFamily(
    'eng-sec-passwords',
    3,
    'Password storage must make each guess slow and identical passwords look different.',
    [
      {
        key: 'plain-sha256',
        question: 'This C# code stores password hashes. What is wrong with it?',
        code: cs(`using System.Security.Cryptography;

Console.WriteLine(HashPassword("correct horse") == HashPassword("correct horse"));

static string HashPassword(string password) =>
    Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(password)));`),
        correct:
          'SHA-256 is fast and unsalted here: equal passwords give equal hashes and attackers can test billions of guesses per second; use a salted, deliberately slow algorithm such as PBKDF2, bcrypt, scrypt or Argon2',
        wrong: [
          'SHA-256 is too short; SHA-512 would make it secure',
          'Hashes cannot be checked at login; the password should be encrypted with AES so it can be compared',
          'Nothing: SHA-256 has no known collisions, so it is safe for passwords',
        ],
        why: 'Password hashing needs a unique random salt per password, so precomputed tables and identical-password matches fail, and a slow, tunable work factor, so each guess is expensive. General-purpose hashes like SHA-256 and SHA-512 are designed to be fast. Encryption is worse: whoever gets the key gets every password. Collision resistance is not the property that matters here.',
      },
    ],
  ),
  ...selectFamily(
    'eng-sec-password-hashing',
    4,
    'Consider what each piece (salt, iterations, comparison) defends against.',
    [
      {
        key: 'pbkdf2',
        question: 'Which statements about this C# password hashing code are true?',
        code: cs(`using System.Security.Cryptography;

var (salt, hash) = Hash("correct horse");
Console.WriteLine(Verify("correct horse", salt, hash));
Console.WriteLine(Verify("wrong horse", salt, hash));

static (byte[] Salt, byte[] Hash) Hash(string password)
{
    byte[] salt = RandomNumberGenerator.GetBytes(16);
    byte[] hash = Rfc2898DeriveBytes.Pbkdf2(password, salt, 600_000, HashAlgorithmName.SHA256, 32);
    return (salt, hash);
}

static bool Verify(string attempt, byte[] salt, byte[] expected)
{
    byte[] actual = Rfc2898DeriveBytes.Pbkdf2(attempt, salt, 600_000, HashAlgorithmName.SHA256, 32);
    return CryptographicOperations.FixedTimeEquals(actual, expected);
}`),
        right: [
          'Because each password gets its own random salt, two users with the same password have different hashes',
          'The high iteration count makes every guess expensive for an attacker who steals the hashes',
          '`FixedTimeEquals` avoids leaking, through response timing, how many bytes matched',
        ],
        wrong: [
          'The salt must be kept secret, like an encryption key, or the scheme is broken',
          'With the right key, the stored hash can be decrypted to recover the password',
        ],
        why: 'Salts are stored next to the hash and need not be secret; their job is to make every hash unique, defeating precomputed tables and same-password matches. The iteration count is the work factor, raised over time as hardware gets faster. Hashing is one-way: there is no key to decrypt with, which is exactly why it beats encryption for passwords.',
      },
    ],
  ),
  ...selectFamily(
    'eng-sec-logging',
    1,
    'Logs are copied to many systems and read by many people; keep what helps investigation, drop what grants access.',
    [
      {
        key: 'what-not-to-log',
        question:
          'A payment API logs each request for troubleshooting. Which of these must be kept out of the logs?',
        right: [
          'The full card number',
          'The session cookie value',
          'The password-reset token in the URL',
        ],
        wrong: ['The user ID', 'The request correlation ID', 'The HTTP status code and duration'],
        why: 'Card numbers, session cookies and reset tokens let whoever reads the log act as the user or misuse their card, and logs are retained, shipped to other tools and widely readable. Identifiers, correlation IDs and outcomes are exactly what an investigation needs. Mask or drop sensitive fields at the logging layer so a careless log statement cannot leak them.',
      },
      {
        key: 'login-logging',
        difficulty: 3,
        question: ['This C# login code logs failed attempts. Which statements are true?'],
        code: plain(`logger.LogWarning(
    "Login failed for {Email} with password {Password} from {Ip}",
    request.Email, request.Password, httpContext.Connection.RemoteIpAddress);`),
        right: [
          'The password must not be logged; failed attempts are often a real password with a typo, or the password for another site',
          'Recording failed logins with the account and source IP is useful for spotting credential-stuffing attacks',
        ],
        wrong: [
          'Logging the password is fine for failed logins, because the password was wrong',
          'Structured logging placeholders like `{Password}` mask the value automatically',
        ],
        why: 'Logging authentication failures is good practice for detecting attacks, but the submitted password is a secret whether or not it matched: it is often one character away from the real one. Message-template placeholders only name the value for structured logging; they do not hide it.',
      },
    ],
  ),

  // ---------------------------------------------------------------- Threat modeling and incidents
  ...scenarioFamily(
    'eng-sec-threats-incidents',
    2,
    'STRIDE: Spoofing, Tampering, Repudiation, Information disclosure, Denial of service, Elevation of privilege.',
    [
      {
        key: 'stride-tampering',
        question:
          'While threat modeling a checkout, the team notes: "The client sends the item price, and an attacker could change it in the request before it reaches the server." Which STRIDE category is this?',
        correct: 'Tampering',
        wrong: ['Spoofing', 'Repudiation', 'Denial of service'],
        why: 'Tampering is unauthorised modification of data, in transit or at rest. The mitigation here is to not trust the client at all: the server looks up prices itself. Spoofing is pretending to be someone else, and repudiation is denying an action without the system being able to prove it.',
      },
      {
        key: 'stride-repudiation',
        difficulty: 3,
        question:
          'A manager denies having approved a 50,000 euro payment, and the system cannot show who approved it or when. Which STRIDE category does this gap belong to, and what mitigates it?',
        correct: 'Repudiation; record who did what and when in a tamper-resistant audit log',
        wrong: [
          'Spoofing; require stronger passwords',
          'Information disclosure; encrypt the payment table',
          "Elevation of privilege; remove the manager's approval rights",
        ],
        why: 'Repudiation threats are about being unable to prove that someone performed an action. Strong authentication tells you who is signed in, but only an audit trail that the actor cannot alter provides the proof afterwards. Encryption and permissions address other threats.',
      },
      {
        key: 'ssrf',
        difficulty: 4,
        question:
          'A C# endpoint fetches a preview of any URL the user supplies, with `await http.GetStringAsync(url)`, on a cloud server. What is the main risk, and the right defence?',
        correct:
          'Server-side request forgery: the user can make the server call internal addresses (such as the cloud metadata endpoint or internal services); allow only expected destinations and block private and link-local ranges',
        wrong: [
          'Cross-site scripting, prevented by HTML-encoding the URL',
          'SQL injection, prevented by parameterising the URL',
          'None: the request comes from the server, which is trusted',
        ],
        why: 'The server sits inside the network and can reach things the user cannot, so a user-controlled URL turns it into a proxy. The metadata endpoint can hand out cloud credentials. Defences check the resolved destination against an allow-list (and block internal ranges, including after redirects). The misconception is that requests made by the server are automatically safe.',
      },
      {
        key: 'incident-first-steps',
        difficulty: 5,
        question:
          'At 03:20 the on-call engineer sees alerts: unusual outbound traffic from a production server, and a new administrator account created at 03:12 that nobody recognises. What should they do first?',
        correct:
          'Follow the incident response plan: alert the security lead, contain (disable the unknown account, isolate the server from the network) while preserving logs and disk state as evidence, and start a written timeline',
        wrong: [
          'Wipe and rebuild the server from a clean image straight away',
          'Delete the unknown account and the logs, then monitor until business hours',
          'Wait until morning to confirm it is a real attack before involving anyone',
        ],
        why: 'The first goals are to limit the damage and keep the evidence: containment stops the attacker, and logs and disk state show how they got in and what else they touched. Rebuilding at once destroys that evidence and may leave other footholds. Deleting logs hampers the investigation, and waiting gives the attacker hours.',
      },
    ],
  ),
];
