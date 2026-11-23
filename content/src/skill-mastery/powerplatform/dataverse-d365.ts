import type { QuestionSource } from '@pracstack/content-model';
import { plain } from '../helpers';
import { ppChoiceFamily, ppSelectFamily } from './builders';

/*
 * Dataverse (data modelling, server logic, security) and Dynamics 365 Customer
 * Engagement apps at a developer level. Scenario reasoning only.
 */

const BU_TREE = `Business units
  Contoso (root)
  ├── Sales
  │   ├── Sales North
  │   └── Sales South
  └── Service`;

// ---------------------------------------------------------------- Dataverse

export const dataverseFamilies: readonly QuestionSource[] = [
  ...ppChoiceFamily(
    'pp-dv-column-type',
    1,
    'Ask whether the value points to another row, comes from a fixed list, or is free data.',
    [
      {
        key: 'link-to-account',
        question:
          'Each project in a custom Project table belongs to exactly one customer account, and users should be able to open the account from the project. Which column type do you add to Project?',
        correct: 'A lookup column to the Account table',
        wrong: [
          'A text column holding the account name',
          'A choice column listing the account names',
          'A whole number column holding the account number',
        ],
        why: 'A lookup column creates a many-to-one relationship: each project references one account row, the form shows a link, and renaming the account updates everywhere. Copying the name into text or a choice duplicates data that drifts, and a number gives no relationship, navigation or security behaviour.',
      },
      {
        key: 'multi-select',
        question:
          'A Training table must record which delivery formats a course supports: any combination of Classroom, Online and Blended. The list rarely changes. Which column type fits?',
        correct: 'A choices (multi-select) column',
        wrong: [
          'A choice column (single select)',
          'Three separate lookup columns to a Format table',
          'A text column where users type the formats separated by commas',
        ],
        why: 'A choices column stores several values from a fixed list. A single-select choice holds one value, a lookup per format is a rigid substitute for a relationship that is not needed for a short stable list, and comma-separated text cannot be validated or filtered reliably.',
      },
    ],
  ),
  ...ppChoiceFamily(
    'pp-dv-choices',
    2,
    'A choice stores a number; the text users see is a label for it.',
    [
      {
        key: 'global',
        question:
          'Case, Complaint and Feedback tables all need the same "Product line" list, and the business wants to add a product line in one place. How do you model it?',
        correct: 'One global choice, used by a choice column on each of the three tables',
        wrong: [
          'A local choice on each table, kept in sync by hand',
          'A text column on each table with a business rule that checks the allowed values',
          'One local choice on Case, referenced by the other two tables',
        ],
        why: 'A global choice is defined once and reused by columns on several tables, so adding an option updates all of them. Local choices belong to a single column, so three copies drift apart; a local choice cannot be shared by other tables. Text plus validation rules is fragile and loses the choice behaviour in filters and views.',
      },
      {
        key: 'rename-label',
        question:
          'A choice column has the option Label "Pending", Value 100000001. The business renames the label to "Awaiting review". What happens to the 3,000 existing rows that had "Pending"?',
        correct:
          'They show "Awaiting review", because rows store the value 100000001, not the label',
        wrong: [
          'They keep showing "Pending" until each row is edited',
          'Their value becomes blank because the option no longer exists',
          'They are converted to a new value with the new label',
        ],
        why: 'A choice column stores the integer value; the label is metadata (and can be translated). Renaming the label changes how every existing row displays without touching data. Integrations and formulas that compare against labels, rather than values, are the ones that break, which is why code should compare values.',
      },
    ],
  ),
  ...ppChoiceFamily(
    'pp-dv-relationships',
    2,
    'Ask which side holds the lookup column, and whether the link itself has data of its own.',
    [
      {
        key: 'one-to-many',
        question:
          'One account has many invoices; each invoice belongs to one account. Where is the lookup column?',
        correct: 'On Invoice, pointing to Account (a 1:N relationship from Account to Invoice)',
        wrong: [
          'On Account, pointing to Invoice',
          'On both tables, pointing to each other',
          'In a separate intersect table, because Dataverse stores all relationships that way',
        ],
        why: 'In a one-to-many relationship the "many" side holds the lookup: each invoice row stores its account. Seen from Invoice it is N:1, seen from Account it is 1:N, but it is one relationship. Only native N:N relationships use a hidden intersect table.',
      },
      {
        key: 'many-to-many-with-data',
        difficulty: 3,
        question:
          'Employees work on many projects and projects have many employees. For each assignment you must store the role (Lead, Reviewer…) and the hours allocated. How should you model it?',
        correct:
          'A custom Assignment table with lookups to Employee and Project, plus Role and Hours columns',
        wrong: [
          'A native N:N relationship between Employee and Project, with Role and Hours added to its intersect table',
          'A lookup to Project on Employee, and a lookup to Employee on Project',
          'A choices column on Employee listing the projects',
        ],
        why: 'A native N:N relationship links rows through a system intersect table that cannot hold your own columns. When the link carries data, model it as its own table with two N:1 lookups (a manual N:N). Two lookups only allow one project per employee and one employee per project, and a choices column cannot reference rows.',
      },
    ],
  ),
  ...ppChoiceFamily(
    'pp-dv-cascade',
    3,
    'Cascade behaviour decides what happens to child rows when the parent row is deleted, assigned or shared.',
    [
      {
        key: 'parental',
        question:
          'Invoice lines have no meaning without their invoice. When an invoice is deleted, its lines must be deleted too, and assigning the invoice should reassign its lines. Which relationship behaviour fits Invoice → Invoice line?',
        correct: 'Parental',
        wrong: [
          'Referential, Remove Link',
          'Referential, Restrict Delete',
          'Referential with no cascading',
        ],
        why: 'Parental cascades every action (delete, assign, share, unshare, reparent) from parent to child, which matches child rows that belong entirely to the parent. Remove Link would leave orphan lines with an empty lookup, and Restrict Delete would block deleting an invoice that has lines.',
      },
      {
        key: 'restrict',
        difficulty: 4,
        question:
          'An admin deletes a customer account that still has orders, and every order loses its customer. The business requires that accounts with orders cannot be deleted at all. Which change implements this?',
        code: plain(`Relationship: Account (1) → Order (N), lookup Order.Customer
Delete behaviour: Referential, Remove Link`),
        correct: 'Change the delete behaviour to Referential, Restrict Delete',
        wrong: [
          'Change the relationship to Parental',
          'Make the Customer lookup on Order a required column',
          'Turn on auditing for the Account table',
        ],
        why: 'Restrict Delete makes Dataverse refuse to delete a parent while related child rows exist. Parental would delete the orders together with the account, the opposite of what is wanted. Making the lookup required only applies when an order is saved, and auditing records the deletion but does not prevent it.',
      },
      {
        key: 'remove-link',
        difficulty: 4,
        question:
          'With this relationship, a user deletes the Marketing campaign "Spring 2026". What happens to the 400 leads that reference it?',
        code: plain(`Relationship: Campaign (1) → Lead (N), lookup Lead.Source campaign
Delete behaviour: Referential, Remove Link`),
        correct: 'The leads stay, and their Source campaign lookup becomes empty',
        wrong: [
          'The leads are deleted with the campaign',
          'The delete is blocked because leads reference the campaign',
          'The leads keep pointing to the deleted campaign until they are edited',
        ],
        why: 'Remove Link deletes the parent and clears the lookup on the child rows, which keep their other data. Deleting children is the Parental (or Cascade All delete) behaviour, and blocking is Restrict Delete. A lookup never points to a row that no longer exists.',
      },
    ],
  ),
  ...ppChoiceFamily(
    'pp-dv-logic-placement',
    3,
    'Ask where and when the logic runs: in the form (client), in the save transaction (server, synchronous), or after the save (asynchronous).',
    [
      {
        key: 'business-rule-scope',
        question:
          'A business rule sets Priority to High when Amount is over 50,000. It works when users edit orders in the model-driven form, but not for orders imported through the Web API. What should change?',
        code: plain(`Business rule: Set high priority
Table: Order    Scope: All Forms
If Amount > 50000 then Set Priority = High`),
        correct: 'Set the business rule’s scope to Entity so it also runs on the server',
        wrong: [
          'Add the Priority column to every form',
          'Publish the rule again, because imports use the previous version',
          'Rewrite the rule in form JavaScript',
        ],
        why: 'A business rule scoped to forms runs only in the client, so data written by imports, flows or the API never sees it. Scope Entity makes the rule run on the server as well, for every save. Form JavaScript is also client-side only, and the form layout is not the problem.',
      },
      {
        key: 'credit-limit',
        difficulty: 4,
        question:
          'Saving an order must be refused if the customer’s open orders plus this one exceed the customer’s credit limit, however the order is created (forms, imports, API). Which implementation enforces this?',
        correct:
          'A synchronous plug-in on the order create and update messages (pre-validation or pre-operation) that sums the open orders and throws `InvalidPluginExecutionException`',
        wrong: [
          'An automated Power Automate flow triggered when an order is added, which deletes it if the limit is exceeded',
          'A business rule with Entity scope that shows an error message',
          'Form JavaScript in the order form’s OnSave event',
        ],
        why: 'The rule needs data from other rows (the customer’s open orders) and must stop the save, so it belongs in a synchronous plug-in inside the save pipeline; throwing `InvalidPluginExecutionException` cancels the operation with a message. Dataverse-triggered flows run asynchronously after the row is saved, so the order exists for a while and may already be used. Business rules work only on the row’s own columns, and form scripts do not run for imports or the API.',
      },
      {
        key: 'flow-async',
        question:
          'An automated flow, triggered when a Dataverse order is modified, recalculates the Discount column. After saving, users still see the old discount until they refresh. Why?',
        correct:
          'Dataverse-triggered cloud flows run asynchronously after the save completes, so the change arrives later',
        wrong: [
          'The flow runs before the save and its change is overwritten',
          'Flows cannot update the row that triggered them',
          'The form caches column values until the browser is restarted',
        ],
        why: 'Cloud flows triggered by Dataverse run after the transaction commits, usually seconds later, so the form has already reloaded the saved row. If the value must be correct immediately after save, compute it in a synchronous pre-operation plug-in, a calculated or formula column, or a business rule. Flows can update the triggering row (filter the trigger so they do not loop).',
      },
    ],
  ),
  ...ppChoiceFamily(
    'pp-dv-access-levels',
    4,
    'User = own rows (plus rows shared with you or owned by your teams); Business Unit = your BU; Parent: Child = your BU and those below it; Organization = everything.',
    [
      {
        key: 'bu-level',
        question:
          'Ana belongs to the Sales business unit. Her only role gives Read on Account at Business Unit level. Which accounts can she read?',
        code: plain(BU_TREE),
        correct: 'Accounts owned by users and teams in Sales only',
        wrong: [
          'Accounts in Sales, Sales North and Sales South',
          'All accounts in Contoso, because Sales is a direct child of the root',
          'Only the accounts she owns',
        ],
        why: 'Business Unit access covers rows owned in the user’s own business unit, not its children. Including Sales North and Sales South needs Parent: Child Business Units, and every account needs Organization. Only her own accounts would be User access.',
      },
      {
        key: 'cumulative',
        question: 'Ben has two security roles. What access does he have to Account rows?',
        code: plain(`Role            Account: Read           Account: Write
Salesperson     User                    User
Report Viewer   Organization            (none)`),
        correct:
          'He can read all accounts, but write only the accounts he owns (or that are shared with him or owned by his teams)',
        wrong: [
          'He can only read his own accounts, because the most restrictive role wins',
          'He can read and write all accounts, because Organization read implies write',
          'The roles conflict, so he gets no access to accounts',
        ],
        why: 'Security roles are cumulative: for each privilege, the user gets the widest access level any of their roles grants. Read comes from Report Viewer (Organization) and Write from Salesperson (User). Privileges are separate, so Organization read never implies write.',
      },
      {
        key: 'parent-child-matrix',
        difficulty: 5,
        question:
          'Priya is in the Sales business unit with this role. Tom, in Sales North, owns an opportunity. What can Priya do with Tom’s opportunity?',
        code: plain(`${BU_TREE}

Role: Sales Manager (table Opportunity)
  Create  User
  Read    Parent: Child Business Units
  Write   Business Unit
  Delete  User`),
        correct: 'Read it, but not edit or delete it',
        wrong: [
          'Read and edit it, but not delete it',
          'Nothing: the opportunity is in a different business unit',
          'Read, edit and delete it, because she manages his business unit',
        ],
        why: 'Each privilege is evaluated with its own access level. Read at Parent: Child reaches Sales North, so she can read it. Write at Business Unit covers only rows owned in Sales itself, and Delete at User only her own rows. Being "above" a business unit gives nothing by itself; only the access level of each privilege counts.',
      },
      {
        key: 'team-owned',
        difficulty: 5,
        question:
          'An account is owned by the owner team "Key Accounts". Lena is a member of that team. The team has no security role. Lena’s own role gives Read on Account at User level. Can Lena read the account?',
        correct: 'Yes: User-level access includes rows owned by teams the user is a member of',
        wrong: [
          'No: User level covers only rows Lena owns personally',
          'No: the team needs its own security role before members can see its rows',
          'Only if the account is also shared with her personally',
        ],
        why: 'User (Basic) access covers rows the user owns, rows shared with the user, and rows owned by or shared with teams the user belongs to. Team-owned rows are therefore visible to members whose roles grant User-level read. Giving the team a role matters when members need privileges through the team, not for this case.',
      },
    ],
  ),
  ...ppChoiceFamily(
    'pp-dv-teams-hierarchy',
    4,
    'Owner teams own rows and carry security roles; access teams grant access to specific rows; hierarchy security follows the manager or position chain.',
    [
      {
        key: 'access-team',
        question:
          'For each large opportunity, a different set of specialists (legal, pricing, solution architects) must be able to read and edit that one opportunity. Membership changes often. Which feature fits best?',
        correct:
          'An access team template on Opportunity with Read and Write rights, adding specialists to each opportunity’s access team',
        wrong: [
          'An owner team per specialist group, with a Business Unit-level Write role',
          'A new business unit for each opportunity',
          'Organization-level Write on Opportunity for all specialists',
        ],
        why: 'Access teams grant rights on individual rows according to a template, without security roles or ownership changes, which suits ad hoc per-record collaboration. An owner team with a BU-level role would open every opportunity in that business unit, and Organization-level write gives far too much. Business units model the organisation, not single records.',
      },
      {
        key: 'hierarchy',
        difficulty: 5,
        question:
          'Regional directors must see the records owned by everyone who reports to them, directly or indirectly, and these people are spread across several business units. Granting Organization-level read is not acceptable. Which feature is designed for this?',
        correct: 'Hierarchy security, using the manager hierarchy (or a position hierarchy)',
        wrong: [
          'Parent: Child Business Units read for the directors',
          'Field security profiles on every column',
          'Sharing each record with the director manually',
        ],
        why: 'Hierarchy security grants access along the reporting structure (the Manager field on users, or positions), independently of business units. Parent: Child access follows the business unit tree, which here does not match the reporting lines. Field security controls columns, not rows, and manual sharing does not scale.',
      },
    ],
  ),
  ...ppChoiceFamily(
    'pp-dv-column-security',
    5,
    'Hiding a column on a form is cosmetic. Column-level security is enforced by Dataverse for every way of reading the data.',
    [
      {
        key: 'salary',
        question:
          'HR must read and update the Salary column on Employee, line managers may only read it, and everyone else must not see it anywhere: forms, views, exports, the Web API. Which design is correct?',
        correct:
          'Enable column security on Salary; create a profile for HR with Read and Update, and one for managers with Read only; give no profile to anyone else',
        wrong: [
          'Remove Salary from the forms and views used by non-HR users',
          'Create a business rule that hides Salary unless the user is in HR',
          'Give non-HR users a security role without Read on the Employee table',
        ],
        why: 'Column security is enforced on the server: users without a profile granting Read get no value through any channel. Removing the column from forms or hiding it with a business rule is only presentation, and the value stays reachable through views, exports and the API. Removing Read on the table hides the whole employee row, not just Salary.',
      },
      {
        key: 'profile-missing',
        question:
          'Column security is enabled on Employee.Salary. A new HR analyst has Organization-level Read on Employee but sees Salary as empty everywhere. What is missing?',
        correct: 'She is not in a field security profile that grants Read on Salary',
        wrong: [
          'Her role needs Organization-level Write on Employee',
          'Auditing must be enabled on the Salary column',
          'Salary must be added to the Employee main form again',
        ],
        why: 'Table privileges and column security are separate layers: row access comes from security roles, while a secured column is readable only to users or teams in a profile granting Read on it. Adding her (or her team) to the HR profile fixes it. Write privileges, auditing and form layout do not grant access to secured columns.',
      },
    ],
  ),
  ...ppChoiceFamily(
    'pp-dv-environment-admin',
    2,
    'Separate what lets someone build things in an environment from what lets them read business data.',
    [
      {
        key: 'env-maker',
        question:
          'A citizen developer has the Environment Maker role in a Dataverse environment. She builds a canvas app over the Project table, but the app shows no rows to her. Why?',
        correct:
          'Environment Maker lets her create apps, flows and connections, but gives no access to the data in Dataverse tables; she also needs a role with privileges on Project',
        wrong: [
          'Environment Maker can only build apps over SharePoint, not Dataverse',
          'Canvas apps never show Dataverse rows to their maker',
          'The app must be shared with her even though she built it',
        ],
        why: 'Environment Maker is about making resources in the environment. Access to rows is governed by Dataverse security roles, so a maker without table privileges sees nothing. Assign a role with appropriate Read (and other) privileges on Project.',
      },
      {
        key: 'auditing',
        difficulty: 3,
        question:
          'Auditing is turned on for the Account table and all its columns, yet the audit history stays empty after edits. What is the most likely cause?',
        correct: 'Auditing is not enabled for the environment as a whole',
        wrong: [
          'Audit history only records deletions, not edits',
          'Auditing records changes made through the API, not through forms',
          'Each user must turn on auditing in their personal options',
        ],
        why: 'Dataverse auditing is switched on at three levels: the environment, the table, and the column. All three must be on for changes to be logged. Audit history records creates, updates and deletes from any channel, and it is not a per-user setting.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Dynamics 365

export const dynamicsFamilies: readonly QuestionSource[] = [
  ...ppChoiceFamily(
    'pp-d365-model-driven',
    1,
    'Model-driven apps have several form types, each for a specific job.',
    [
      {
        key: 'quick-view',
        question:
          'On the Contact form, users want to see the parent account’s phone number and industry, read-only, without leaving the form. What do you add?',
        correct:
          'A quick view form of Account, placed on the Contact form via the parent account lookup',
        wrong: [
          'A quick create form of Account',
          'Copies of the Phone and Industry columns on Contact, filled by a flow',
          'A business process flow stage for Account',
        ],
        why: 'A quick view form displays columns of a related row (through a lookup) inside another form, always current and read-only. A quick create form is for creating rows quickly, copying the columns duplicates data that drifts, and business process flows guide a process.',
      },
      {
        key: 'quick-create',
        question:
          'Agents often add a contact while working on a case, and want to do it without leaving the case form. Which form type is designed for this?',
        correct: 'A quick create form for Contact',
        wrong: [
          'A quick view form for Contact',
          'A card form for Contact',
          'A new main form tab on Case',
        ],
        why: 'Quick create forms open as a panel with a few essential columns so a related row can be created without navigating away. Quick view forms only display related data, card forms are compact read layouts for views, and a tab on Case does not create contacts.',
      },
      {
        key: 'bpf',
        difficulty: 2,
        question:
          'Sales managers want every opportunity to move through Qualify, Develop, Propose and Close, with required steps in each stage visible at the top of the form. Which feature fits?',
        correct: 'A business process flow',
        wrong: ['A business rule', 'A classic background workflow', 'A dashboard'],
        why: 'Business process flows show stages and steps across the top of model-driven forms and guide users through a consistent process. Business rules apply logic to columns, background processes run without guiding the user, and dashboards display data.',
      },
    ],
  ),
  ...ppChoiceFamily(
    'pp-d365-apps',
    2,
    'Think about the standard tables and processes that Dynamics 365 Sales and Customer Service provide on Dataverse.',
    [
      {
        key: 'qualify-lead',
        question:
          'In Dynamics 365 Sales a seller qualifies a lead with the default settings. What happens?',
        correct:
          'The lead is marked qualified, and an account, contact and opportunity can be created from its data',
        wrong: [
          'The lead row is converted into an account row and deleted',
          'The lead is turned into a case for the service team',
          'Nothing is created; qualifying only changes a status field that sellers must act on',
        ],
        why: 'Qualifying closes the lead as qualified and, by default, creates (or links to) an account, a contact and an opportunity, keeping the originating lead for reporting. The lead is not deleted or converted in place, and cases belong to Customer Service.',
      },
      {
        key: 'sla',
        question:
          'In Dynamics 365 Customer Service, premium customers’ cases must get a first response within 4 hours, with a warning to the team at 3 hours. Which feature is designed for this?',
        correct:
          'A service-level agreement (SLA) with KPIs, warning and failure actions, applied to cases',
        wrong: [
          'A business process flow with a Respond stage',
          'A rollup column counting hours since creation',
          'A queue named "4 hours"',
        ],
        why: 'SLAs define KPIs such as first response and resolve-by times, track them on each case and trigger actions at warning and failure. A business process flow guides users but does not time them, a rollup column does not raise warnings, and queues organise work without enforcing time targets.',
      },
    ],
  ),
  ...ppChoiceFamily(
    'pp-d365-extend-choice',
    3,
    'Pick the lightest tool that meets the timing requirement: inside the form, inside the save, or after the save.',
    [
      {
        key: 'notify-teams',
        question:
          'When a case is escalated, the owner must get a Teams message with a link to the case. A delay of a few seconds is fine. What is the simplest suitable approach?',
        correct:
          'An automated Power Automate flow triggered when the case’s escalation column changes',
        wrong: [
          'A synchronous plug-in that calls the Teams API during the save',
          'A business rule on the Case form',
          'Form JavaScript that posts to Teams when the user saves',
        ],
        why: 'Power Automate has a Teams connector and runs asynchronously after the save, which is fine when seconds of delay are acceptable. A synchronous plug-in would make every save wait for an external call (and fail if Teams is slow); business rules cannot call external services; and form script misses escalations made by other processes.',
      },
      {
        key: 'show-hide',
        question:
          'On the Opportunity form, the "Competitor" column should only be visible when "Lost to competitor" is Yes. Which approach is simplest?',
        correct: 'A business rule that shows or hides the column based on "Lost to competitor"',
        wrong: [
          'A synchronous plug-in on update',
          'An automated cloud flow',
          'A separate form for lost opportunities',
        ],
        why: 'Showing and hiding columns is form behaviour, and business rules do it without code. Plug-ins and flows run on the server and cannot change what the form displays, and maintaining a second form for one column adds work.',
      },
      {
        key: 'reject-save',
        question:
          'An opportunity must not be closed as won unless it has at least one product line, whichever app or integration closes it. Which approach enforces this?',
        correct:
          'A synchronous plug-in in the save pipeline that checks the product lines and throws an error',
        wrong: [
          'An automated cloud flow that reopens the opportunity when it has no products',
          'A business rule on the Opportunity form',
          'A view that lists won opportunities without products',
        ],
        why: 'Only server-side synchronous logic can refuse the operation for every channel before it is committed. A flow reacts afterwards (the opportunity was already closed), a form business rule cannot count related rows and does not cover integrations, and a view only reports the problem.',
      },
    ],
  ),
  ...ppChoiceFamily(
    'pp-d365-plugin-stages',
    4,
    'Pre-validation runs before the transaction and core checks; pre-operation runs in the transaction before the row is written; post-operation runs after it is written.',
    [
      {
        key: 'set-column',
        question:
          'When an account is created, a plug-in must set `accountcategorycode` from the revenue, without a second update of the row. Which registration fits?',
        correct: 'Synchronous, pre-operation stage, changing the column on the `Target` entity',
        wrong: [
          'Synchronous, post-operation stage, calling `service.Update` on the new account',
          'Asynchronous, post-operation stage, calling `service.Update` on the new account',
          'Pre-validation, calling `service.Create` with the category',
        ],
        why: 'In pre-operation the `Target` is the data about to be written, so changing it saves the value with the original create, in the same transaction and with no extra update. Post-operation needs a second `Update` (more work, and it triggers update logic); asynchronous adds delay. Creating another account would duplicate it.',
      },
      {
        key: 'create-child',
        question:
          'When an order is created, a default "Delivery" task must be created, linked to the order. If creating the task fails, the order must not be saved either. Which registration fits?',
        correct: 'Synchronous, post-operation stage on Create of Order',
        wrong: [
          'Asynchronous, post-operation stage on Create of Order',
          'Pre-validation stage on Create of Order',
          'Synchronous, pre-operation stage on Create of Task',
        ],
        why: 'In post-operation the order exists (its ID is in the output parameters), so the task can reference it, and a synchronous step still runs inside the database transaction: an exception rolls back the order too. An asynchronous step runs after the commit, so a failure cannot undo the order. Pre-validation runs before the order exists, and a step on Task would not run when orders are created.',
      },
      {
        key: 'async-failure',
        question:
          'An asynchronous post-operation plug-in on Update of Contact throws an exception. What does the user who saved the contact experience?',
        correct:
          'The save succeeds; the plug-in’s system job fails and the error is visible in the system jobs list',
        wrong: [
          'The save is rolled back and the user sees the exception message',
          'The save waits until the plug-in is retried successfully',
          'The contact is deleted because the post-operation failed',
        ],
        why: 'Asynchronous steps run later as system jobs, after the change has been committed, so they cannot affect the user’s save. Their failures must be monitored (system jobs, tracing) instead. Only synchronous steps can cancel the operation and show the message to the user.',
      },
      {
        key: 'pre-validation-delete',
        difficulty: 5,
        question:
          'Before a project is deleted, a plug-in must count its timesheet rows and refuse the delete if any are approved. Timesheets are in a Parental relationship with Project. In which stage must the step be registered?',
        correct:
          'Pre-validation, because the cascade delete of the timesheets happens before pre-operation runs',
        wrong: [
          'Pre-operation, because it is the last stage before the project row is deleted',
          'Post-operation, because the timesheets are still available after the delete',
          'Asynchronous post-operation, so the check does not slow the delete down',
        ],
        why: 'For a delete, cascading actions on related rows are processed before the pre-operation stage, so by then the child timesheets may already be gone. Pre-validation runs before that, while the related rows still exist, and throwing there cancels the delete. Post-operation and asynchronous steps run after the deletion, when the check is useless.',
      },
      {
        key: 'sync-rollback',
        difficulty: 5,
        question:
          'A synchronous post-operation plug-in on Create of Invoice creates three invoice lines, then throws `InvalidPluginExecutionException` while creating the fourth. What is saved?',
        correct: 'Nothing: the invoice and the three lines are all rolled back',
        wrong: [
          'The invoice and three lines are saved; only the fourth line is missing',
          'The invoice is saved, but all four lines are rolled back',
          'The invoice is saved and the plug-in is retried later',
        ],
        why: 'A synchronous post-operation step runs inside the same database transaction as the create. Any exception rolls back everything in that transaction: the invoice and the rows the plug-in created. That all-or-nothing behaviour is a reason to use synchronous steps; asynchronous steps run in their own context after the commit.',
      },
    ],
  ),
  ...ppChoiceFamily(
    'pp-d365-plugin-loop',
    5,
    'Ask what message the plug-in’s own call raises, and whether the step would fire for it.',
    [
      {
        key: 'update-self',
        question:
          'This C# plug-in is registered synchronously, post-operation, on Update of Account, with no filtering attributes. Saving an account soon fails with an error about an infinite loop. What is the best fix?',
        code: plain(`// C# (Dataverse plug-in)
public void Execute(IServiceProvider serviceProvider)
{
    var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
    var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
    var service = factory.CreateOrganizationService(context.UserId);

    var target = (Entity)context.InputParameters["Target"];
    var update = new Entity("account", target.Id);
    update["new_lastreviewed"] = DateTime.UtcNow;
    service.Update(update);
}`),
        correct:
          'Register the step in pre-operation and set `new_lastreviewed` on `Target` instead of calling `Update`, and add filtering attributes so it only fires for the relevant columns',
        wrong: [
          'Make the step asynchronous, so the update happens later',
          'Catch the exception around `service.Update` and ignore it',
          'Use `context.InitiatingUserId` instead of `context.UserId` when creating the service',
        ],
        why: 'The plug-in’s own `Update` raises another Update of Account, which runs the same step again, and so on until Dataverse stops the loop. Setting the column on `Target` in pre-operation writes it as part of the original save with no extra update, and filtering attributes stop the step firing for unrelated changes. An asynchronous step would still loop (just later), swallowing the error hides it, and the user identity does not affect the recursion.',
      },
      {
        key: 'depth-check',
        question:
          'A plug-in on Update of Opportunity must call `service.Update` on the same opportunity (it cannot be moved to pre-operation). Besides filtering attributes, which guard prevents it from re-running for its own update?',
        correct:
          'Return early when `context.Depth > 1`, accepting that it also skips updates made by other plug-ins or flows that run inside the pipeline',
        wrong: [
          'Return early when `context.Stage == 40`',
          'Return early when `context.MessageName == "Update"`',
          'Return early when `context.UserId` is a system user',
        ],
        why: '`Depth` increases each time an operation is triggered from within the pipeline, so a check on it stops the step re-entering for its own update. It is a blunt guard, because legitimate updates from other server-side code also arrive with a higher depth; filtering attributes or comparing values are more precise. Stage and message are the same for the original and the nested call, so those checks either block everything or nothing.',
      },
    ],
  ),
  ...ppChoiceFamily(
    'pp-d365-web-api',
    3,
    'The Dataverse Web API is OData v4: entity set names, `$select`, `$filter` with `eq`/`gt`/…, and navigation properties for lookups.',
    [
      {
        key: 'query',
        question:
          'Which Web API request returns the name and revenue of the five accounts with the highest revenue above 1,000,000?',
        correct:
          '`GET [org]/api/data/v9.2/accounts?$select=name,revenue&$filter=revenue gt 1000000&$orderby=revenue desc&$top=5`',
        wrong: [
          '`GET [org]/api/data/v9.2/accounts?$select=name,revenue&$filter=revenue > 1000000&$orderby=revenue desc&$top=5`',
          '`GET [org]/api/data/v9.2/accounts?$fields=name,revenue&$where=revenue gt 1000000&$sort=-revenue&$limit=5`',
          '`GET [org]/api/data/v9.2/accounts?$select=name,revenue&$filter=revenue gt 1000000&$top=5`',
        ],
        why: 'OData uses `$select`, `$filter` with operators such as `gt`, `$orderby` and `$top`. Symbols like `>` are not OData operators, `$fields`/`$where`/`$sort`/`$limit` are not OData options, and without `$orderby` `$top=5` returns five matching accounts in no meaningful order, not the five largest.',
      },
      {
        key: 'bind-lookup',
        difficulty: 4,
        question:
          'You create an account with the Web API and want its primary contact to be an existing contact. Which request body is correct?',
        code: plain(`POST [org]/api/data/v9.2/accounts
Content-Type: application/json

{ "name": "Fabrikam", ??? }`),
        correct:
          '`"primarycontactid@odata.bind": "/contacts(00000000-0000-0000-0000-000000000001)"`',
        wrong: [
          '`"_primarycontactid_value": "00000000-0000-0000-0000-000000000001"`',
          '`"primarycontactid": "00000000-0000-0000-0000-000000000001"`',
          '`"primarycontactid@odata.bind": "00000000-0000-0000-0000-000000000001"`',
        ],
        why: 'A lookup is set through its single-valued navigation property with `@odata.bind` and a reference to the related row, `/contacts(<id>)`. The `_primarycontactid_value` property is a read-only lookup value you see when reading, a plain GUID on the navigation property is not valid, and `@odata.bind` needs the entity set path, not just the GUID.',
      },
      {
        key: 'upsert',
        difficulty: 5,
        question:
          'An ERP integration sends customers with their ERP number, which is an alternate key `accountnumber` on Account. It must create the account when it does not exist yet, and update it otherwise, in one request. Which request does that?',
        correct:
          "`PATCH [org]/api/data/v9.2/accounts(accountnumber='ERP-1001')` with the column values and no `If-Match` or `If-None-Match` header",
        wrong: [
          "`PATCH [org]/api/data/v9.2/accounts(accountnumber='ERP-1001')` with the header `If-Match: *`",
          "`POST [org]/api/data/v9.2/accounts(accountnumber='ERP-1001')`",
          "`PUT [org]/api/data/v9.2/accounts?$filter=accountnumber eq 'ERP-1001'`",
        ],
        why: 'A `PATCH` to a row addressed by its key is an upsert: it updates the row if it exists and creates it otherwise. `If-Match: *` turns it into update-only (it fails when the row is missing), and `If-None-Match: *` would make it create-only. `POST` creates on the collection, not on a keyed row, and `$filter` cannot address a row for an update.',
      },
    ],
  ),
  ...ppChoiceFamily(
    'pp-d365-integration',
    4,
    'Decide whether the data should be copied into Dataverse, shown from its source on demand, or pushed to another system as events.',
    [
      {
        key: 'virtual-table',
        question:
          'Sellers want to see a customer’s orders from an external SQL database inside the model-driven app, always current, and the data must not be copied into Dataverse. Which approach fits?',
        correct: 'A virtual table that reads the orders from the external source at run time',
        wrong: [
          'A nightly dataflow that imports the orders into a Dataverse table',
          'A rollup column on Account that totals the orders',
          'An access team template on Account',
        ],
        why: 'A virtual table presents external data as a Dataverse table; rows are fetched from the source when requested and are not stored in Dataverse. A nightly import copies the data and is up to a day stale, a rollup column summarises Dataverse rows only, and access teams are a security feature.',
      },
      {
        key: 'service-bus',
        difficulty: 5,
        question:
          'Every change to an order must be delivered reliably to a downstream warehouse system that is sometimes offline for maintenance, without slowing users’ saves. Which pattern fits best?',
        correct:
          'Register an Azure Service Bus service endpoint with an asynchronous post-operation step on Order, and let the warehouse consume the queue',
        wrong: [
          'A synchronous plug-in that calls the warehouse API during each save',
          'Form JavaScript that posts the order to the warehouse after save',
          'A scheduled flow that exports all orders every hour',
        ],
        why: 'Posting the execution context to Service Bus asynchronously decouples the systems: saves are not delayed, and the queue holds messages while the warehouse is offline. A synchronous call makes saves slow and fails them when the warehouse is down, form script misses changes from other channels, and hourly full exports are late and wasteful.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- multi-select checks

export const dataverseSelectFamilies: readonly QuestionSource[] = ppSelectFamily(
  'pp-dv-server-side',
  3,
  'Ask whether the logic runs only when a person uses a model-driven form.',
  [
    {
      key: 'api-import',
      question:
        'A bulk import writes 10,000 rows through the Dataverse Web API. Which of these run for the imported rows?',
      options: [
        ['A synchronous plug-in step on Create of the table', true],
        ['A business rule with scope Entity', true],
        ['A business rule with scope All Forms', false],
        ['JavaScript registered on the form’s OnSave event', false],
        ['An automated cloud flow with the trigger "When a row is added"', true],
      ],
      why: 'Plug-ins, Entity-scoped business rules and Dataverse-triggered flows are part of the server and run for every channel (flows asynchronously, after each save). Form-scoped business rules and form scripts run in the browser only when someone uses the form, so they never see API imports.',
    },
  ],
);
