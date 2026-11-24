import type { QuestionSource } from '@pracstack/content-model';
import { plain } from '../helpers';
import { ppChoiceFamily, ppSelectFamily } from './builders';

/*
 * Power Apps (canvas and model-driven, Power Fx) and Power Automate cloud flows.
 * Scenario reasoning only: nothing runs against a Microsoft tenant.
 */

// ---------------------------------------------------------------- Power Apps

export const powerAppsFamilies: readonly QuestionSource[] = [
  ...ppChoiceFamily(
    'pp-apps-app-type',
    1,
    'Ask where the user interface comes from: designed control by control, or generated from the Dataverse data model.',
    [
      {
        key: 'field-technicians',
        question:
          'Field technicians need a phone app with a custom, pixel-precise layout: take a photo of a meter, read its value into a form, and save to a SharePoint list and an Azure SQL table. Which kind of Power Apps app fits best?',
        correct: 'A canvas app',
        wrong: ['A model-driven app', 'A Power Pages site', 'A business process flow'],
        why: 'Canvas apps give full control over layout and controls (including the camera) and connect to many data sources through connectors, such as SharePoint and SQL. Model-driven apps are generated from Dataverse tables, forms and views, so they give little layout control and work only with Dataverse data. A business process flow is a guided stage bar inside a model-driven app, not an app type.',
      },
      {
        key: 'case-management',
        question:
          'A back-office team manages cases, customers and contracts that already live in Dataverse. They want consistent forms, views, dashboards and a stage-by-stage process, with little UI design work. Which kind of app fits best?',
        correct: 'A model-driven app',
        wrong: ['A canvas app', 'A component library', 'A desktop flow'],
        why: 'Model-driven apps are built from the Dataverse data model: forms, views, charts, dashboards and business process flows come from the tables, and the UI is responsive by default. A canvas app could do it, but every screen would be designed by hand. A component library only shares canvas components, and a desktop flow is robotic process automation in Power Automate.',
      },
    ],
  ),
  ...ppChoiceFamily(
    'pp-apps-variables',
    2,
    'Compare the scope of `Set` (the whole app), `UpdateContext` (one screen) and collections (tables that persist until changed).',
    [
      {
        key: 'context-scope',
        question:
          'A canvas app has two screens. The button is on `BrowseScreen` and the label is on `DetailScreen`. The label shows an error saying the name is not recognized. Why?',
        code: plain(`// BrowseScreen > btnOpen.OnSelect
UpdateContext({ selectedId: ThisItem.ID });
Navigate(DetailScreen)

// DetailScreen > lblId.Text
selectedId`),
        correct:
          '`UpdateContext` creates a context variable that exists only on `BrowseScreen`; use `Set` for a global variable, or pass the value in the context argument of `Navigate`',
        wrong: [
          '`UpdateContext` runs after `Navigate`, so the variable is not set yet when `DetailScreen` loads',
          'Context variables must be declared in `App.OnStart` before any screen can use them',
          '`ThisItem` is not available in `OnSelect`, so the variable is never created',
        ],
        why: 'Context variables are screen-scoped: `UpdateContext` on `BrowseScreen` creates a variable that other screens cannot see. `Set` creates a global variable visible on every screen, and `Navigate(DetailScreen, ScreenTransition.None, { selectedId: ThisItem.ID })` sets a context variable on the target screen. The order of the two calls is not the issue (they run in sequence), and nothing has to be declared in `OnStart`.',
      },
      {
        key: 'collect-duplicates',
        question:
          'A user opens `OrdersScreen` three times during a session. Twenty orders are open. How many rows does `colOpenOrders` contain after the third visit?',
        code: plain(`// OrdersScreen.OnVisible
Collect(colOpenOrders, Filter(Orders, Status = "Open"))`),
        correct: '60, because `Collect` appends to the collection each time',
        wrong: [
          '20, because `Collect` replaces the collection contents',
          '20, because `Collect` skips records that are already in the collection',
          '0, because collections are cleared when the user leaves the screen',
        ],
        why: '`Collect` adds rows to whatever the collection already holds, so every visit appends the same 20 orders again. `ClearCollect` clears the collection first and is the right function here. Collections are app-wide and survive navigation, and `Collect` does not de-duplicate.',
      },
      {
        key: 'set-blank-counter',
        question:
          'The variable `clicks` is never initialized anywhere in the app. What does the label show after the user selects the button three times?',
        code: plain(`// btnAdd.OnSelect
Set(clicks, clicks + 1)

// lblClicks.Text
clicks`),
        correct: '3',
        wrong: [
          'An error, because `clicks` is used before it has a value',
          '1, because `Set` resets the variable each time',
          'Nothing: `clicks + 1` stays blank because blank plus a number is blank',
        ],
        why: 'A global variable that has not been set is blank, and Power Fx treats blank as zero in arithmetic, so the first click sets `clicks` to 1 and the third to 3. `Set` keeps the value between clicks; it just assigns the new one. Relying on this is legal, but initializing variables explicitly (for example in `App.OnStart` or with a default in a named formula) makes intent clearer.',
      },
    ],
  ),
  ...ppChoiceFamily(
    'pp-apps-components',
    2,
    'A component cannot see the screens of the app that hosts it; data goes in and out through custom properties.',
    [
      {
        key: 'input-property',
        question:
          'You build a header component used on every screen of a canvas app. Each screen must show its own title in the header. What is the right design?',
        correct:
          'Add an input custom property `Title` to the component and set it on each instance, for example to `"Orders"`',
        wrong: [
          'Inside the component, read the label of the current screen directly by its control name',
          'Copy the header controls onto each screen instead of using a component',
          'Add an output property `Title` and read it from each screen',
        ],
        why: 'Components are encapsulated: the host app passes data in through input custom properties and reads results through output properties. A component should not depend on controls in the host screens. Copying controls onto every screen defeats reuse, and an output property sends data from the component to the app, the opposite direction.',
      },
      {
        key: 'library-update',
        question:
          'Five canvas apps use a footer component from a component library. You fix a bug in the library and publish it. What happens to the five apps?',
        correct:
          'Makers of each app are offered the updated component when they edit the app; the app must be updated and republished to use the fix',
        wrong: [
          'All five apps use the fixed component immediately, without being republished',
          'Nothing can update them: the component was copied into each app when it was imported',
          'The five apps stop working until they are rebuilt from the library',
        ],
        why: 'A component library is the single place to maintain shared components. Apps keep the version they were published with; when a maker opens an app after the library changed, Power Apps offers the update, and the app is republished to ship it. It is not live-linked (so a library change cannot break running apps), but it is not a one-time copy either.',
      },
    ],
  ),
  ...ppChoiceFamily(
    'pp-apps-forms',
    3,
    'Think about when `SubmitForm` has finished, and what each form property holds after a successful save.',
    [
      {
        key: 'navigate-before-save',
        question:
          'Users report that the app sometimes returns to the list even though their changes were not saved (for example, a required column was empty). What is the fix?',
        code: plain(`// btnSave.OnSelect
SubmitForm(frmOrder);
Navigate(BrowseScreen, ScreenTransition.Fade)`),
        correct:
          'Move `Navigate(BrowseScreen, ...)` into `frmOrder.OnSuccess`, and show a message in `frmOrder.OnFailure`',
        wrong: [
          'Swap the two lines so `Navigate` runs first',
          'Replace `SubmitForm` with `Patch(Orders, frmOrder.Updates)` and keep `Navigate` after it',
          'Wrap both lines in `Concurrent` so they finish together',
        ],
        why: '`SubmitForm` does not wait for the outcome before the next statement runs, so `Navigate` happens whether the save succeeds or fails. The form’s `OnSuccess` runs only after a successful save and `OnFailure` only after a failed one, so navigation belongs in `OnSuccess`. Swapping or running both concurrently makes the race worse, and an unchecked `Patch` still navigates on failure.',
      },
      {
        key: 'last-submit',
        question:
          'After a new order is created through `frmOrder`, the app must navigate to a screen that shows the new order, including its server-generated order number. Which formula in `frmOrder.OnSuccess` gives that record?',
        correct: '`Navigate(OrderScreen, ScreenTransition.None, { current: frmOrder.LastSubmit })`',
        wrong: [
          '`Navigate(OrderScreen, ScreenTransition.None, { current: frmOrder.Updates })`',
          '`Navigate(OrderScreen, ScreenTransition.None, { current: frmOrder.Item })`',
          '`Navigate(OrderScreen, ScreenTransition.None, { current: Defaults(Orders) })`',
        ],
        why: '`LastSubmit` is the record as saved by the data source, including generated values such as the ID or an autonumber column. `Updates` holds only the values the user entered (not yet saved), `Item` was the empty default record of a new form, and `Defaults` returns a fresh default record.',
      },
      {
        key: 'patch-partial',
        question:
          'Order 7 has Title "Laptops", Status "Open" and Amount 2400. What does this formula change?',
        code: plain(`Patch(Orders, LookUp(Orders, ID = 7), { Status: "Closed" })`),
        correct: 'Only Status becomes "Closed"; Title and Amount keep their values',
        wrong: [
          'Status becomes "Closed" and Title and Amount become blank',
          'It creates a new order with Status "Closed"',
          'Nothing: `Patch` needs every column of the record',
        ],
        why: 'With an existing record as the second argument, `Patch` modifies only the columns named in the change record and leaves the others alone. A new record is created only when the base record is `Defaults(Orders)`. This is why `Patch` is handy for one-column updates such as closing an order.',
      },
    ],
  ),
  ...ppChoiceFamily(
    'pp-apps-delegation',
    4,
    'Delegation means the data source does the filtering. If it cannot, Power Apps fetches only the first rows up to the data row limit and works on those.',
    [
      {
        key: 'len-filter',
        question:
          'The Dataverse table `Accounts` has 60,000 rows. A gallery uses this formula and Power Apps Studio shows a delegation warning. With default app settings, what will users see?',
        code: plain(`Filter(Accounts, Len('Account Name') > 30)`),
        correct:
          'Only the long-named accounts among the first 500 rows retrieved; matches further in the table are silently missing',
        wrong: [
          'All long-named accounts, but loaded more slowly because the filter runs in the app',
          'An error at run time, because non-delegable formulas cannot run against Dataverse',
          'All long-named accounts, because Dataverse delegates every function in a filter',
        ],
        why: '`Len` on a column cannot be delegated, so Power Apps retrieves only the first rows up to the data row limit (500 by default, configurable up to 2,000) and filters those locally. There is no error; the results are just incomplete, which is why the warning matters on tables that can grow. The fix is a delegable condition, for example an indexed or calculated column the source can filter on.',
      },
      {
        key: 'left-vs-startswith',
        question:
          'A gallery over a 40,000-row Dataverse table should list tickets whose title begins with what the user types. The first formula has a delegation warning. Which replacement returns complete results?',
        code: plain(`Filter(Tickets, Left(Title, Len(txtSearch.Text)) = txtSearch.Text)`),
        correct: '`Filter(Tickets, StartsWith(Title, txtSearch.Text))`',
        wrong: [
          '`Filter(Tickets, Mid(Title, 1, Len(txtSearch.Text)) = txtSearch.Text)`',
          '`Filter(ClearCollect(colTickets, Tickets), Left(Title, Len(txtSearch.Text)) = txtSearch.Text)`',
          'Keep the `Left` formula and raise the data row limit to 2,000',
        ],
        why: '`StartsWith` on a text column is delegable to Dataverse, so the server finds every match. `Left` and `Mid` on a column are not delegable. Collecting the table first is itself limited by the data row limit, and raising the limit to 2,000 still leaves most of 40,000 rows unseen.',
      },
      {
        key: 'collect-workaround',
        difficulty: 5,
        question:
          'To "avoid delegation", a developer loads the whole 40,000-row `Tickets` table into a collection when the app starts and then filters the collection. The data row limit is set to 2,000. What is the result?',
        code: plain(`// App.OnStart
ClearCollect(colTickets, Tickets);

// galTickets.Items
Filter(colTickets, Len(Title) > 50)`),
        correct:
          'The collection holds at most 2,000 tickets, so the gallery filters an incomplete copy, and the app also starts more slowly',
        wrong: [
          'All 40,000 tickets are collected, because `ClearCollect` is not subject to delegation',
          'The gallery shows all matching tickets, because collections are delegable',
          'The app fails to start because collections are limited to 500 rows',
        ],
        why: 'Copying a data source into a collection is not delegated: it brings back at most the data row limit (here 2,000). Filtering the collection then works on an incomplete copy without any warning, which is worse than the original problem. Real fixes keep the query delegable (a delegable predicate, a view, or a server-side column) or page through the data deliberately.',
      },
    ],
  ),
  ...ppSelectFamily(
    'pp-apps-delegable-dataverse',
    4,
    'Comparison operators and `StartsWith` on a column delegate to Dataverse; functions that transform the column value usually do not.',
    [
      {
        key: 'filters',
        question:
          'Which of these gallery formulas over a large Dataverse table `Orders` can be fully delegated to Dataverse?',
        options: [
          ['`Filter(Orders, Amount > 1000 And Status = "Open")`', true],
          ["`Filter(Orders, StartsWith('Customer Name', txtFind.Text))`", true],
          ['`Filter(Orders, Upper(\'Customer Name\') = "CONTOSO")`', false],
          ['`Filter(Orders, Len(Notes) > 0)`', false],
          ["`Filter(Orders, 'Sales Rep Email' = varUser.Email)`", true],
        ],
        why: "Comparisons (`=`, `<>`, `<`, `>`, `<=`, `>=`) combined with `And`/`Or`, and `StartsWith` on a text column, delegate to Dataverse. A value that does not depend on the row, such as `varUser.Email`, is computed once in the app and sent as a constant, so it is fine. `Upper('Customer Name')` and `Len(Notes)` must be evaluated per row on a column value, which Dataverse cannot do for Power Apps, so those formulas only see the first rows up to the data row limit.",
      },
    ],
  ),
  ...ppChoiceFamily(
    'pp-apps-errors',
    4,
    'Inside the fallback of `IfError`, `FirstError` and `AllErrors` describe what went wrong.',
    [
      {
        key: 'firsterror',
        question:
          'A save button must show the reason when Dataverse rejects a new order (for example, a business rule error), and stay on the screen. Which formula does that?',
        correct:
          '`IfError(Patch(Orders, Defaults(Orders), newOrder), Notify("Not saved: " & FirstError.Message, NotificationType.Error), Navigate(BrowseScreen))`',
        wrong: [
          '`If(IsBlank(Patch(Orders, Defaults(Orders), newOrder)), Notify("Not saved"), Navigate(BrowseScreen))`',
          '`Patch(Orders, Defaults(Orders), newOrder); If(IsEmpty(Errors(Orders)), Navigate(BrowseScreen), Notify("Not saved: " & FirstError.Message))`',
          '`IfError(Navigate(BrowseScreen), Patch(Orders, Defaults(Orders), newOrder))`',
        ],
        why: '`IfError(value, fallback, ...)` evaluates the `Patch`; if it produces an error, the fallback runs, and inside it `FirstError.Message` holds the reason. Otherwise evaluation continues with the next argument, here the navigation. `FirstError` is only available inside an `IfError` fallback or `App.OnError` (so the `Errors` variant cannot use it), a failed `Patch` returns an error rather than blank, and the last option navigates first and never handles the save’s error.',
      },
      {
        key: 'sequence',
        difficulty: 5,
        question:
          'The `Patch` to `Orders` fails because a required column is missing. What happens?',
        code: plain(`IfError(
    Patch(Orders, Defaults(Orders), newOrder),
        Notify("Order was not saved", NotificationType.Error),
    Patch(OrderLines, Defaults(OrderLines), newLine),
        Notify("Order saved, but its line was not", NotificationType.Error)
)`),
        correct: 'The first notification is shown and the `OrderLines` patch is never attempted',
        wrong: [
          'The first notification is shown, then the `OrderLines` patch still runs',
          'Both notifications are shown because both pairs are checked',
          'Nothing is shown: `IfError` only catches errors in its last argument',
        ],
        why: '`IfError` with several value/fallback pairs evaluates the values in order. When one returns an error, its fallback is evaluated and the remaining arguments are skipped, so the dependent `OrderLines` write never happens. This makes `IfError` a convenient way to stop a chain of dependent writes at the first failure. Note that it is not a transaction: if the second patch fails, the first record has already been saved.',
      },
    ],
  ),
  ...ppChoiceFamily(
    'pp-apps-performance',
    4,
    'Count how many times each formula runs and how many calls each run makes to the data source.',
    [
      {
        key: 'gallery-lookup',
        question:
          'A gallery shows 200 orders from SQL Server. The customer label uses a `LookUp` against the `Customers` table (300 rows, rarely changes). Scrolling is slow. Which change helps most?',
        code: plain(`// galOrders > lblCustomer.Text
LookUp(Customers, CustomerId = ThisItem.CustomerId).Name`),
        correct:
          'Load `Customers` once into a collection (for example in `OnVisible`) and look up against the collection',
        wrong: [
          'Raise the data row limit to 2,000 so the lookup returns more rows at once',
          'Wrap the `LookUp` in `Concurrent` so the rows load in parallel',
          'Replace `LookUp` with `First(Filter(...))`, which is cached automatically',
        ],
        why: 'A `LookUp` against the data source in a gallery template can mean a request per visible row. Caching a small, stable reference table once and looking up locally removes those calls. The data row limit does not reduce the number of calls, `Concurrent` is for behavior formulas like `OnStart`, not label properties, and `First(Filter(...))` makes the same request as `LookUp`.',
      },
      {
        key: 'concurrent-dependency',
        difficulty: 5,
        question: 'Sometimes `varOpenCount` is 0 even though there are open orders. Why?',
        code: plain(`// App.OnStart
Concurrent(
    ClearCollect(colOrders, Filter(Orders, Status = "Open")),
    ClearCollect(colProducts, Products),
    Set(varOpenCount, CountRows(colOrders))
)`),
        correct:
          'The formulas inside `Concurrent` run in no guaranteed order, so `Set` may count `colOrders` before it has been loaded',
        wrong: [
          '`CountRows` is not delegable, so it always returns 0 on a collection',
          '`Concurrent` runs only the first formula when `OnStart` is used',
          '`Set` cannot be used inside `Concurrent`',
        ],
        why: '`Concurrent` speeds up independent work by running it at the same time, but none of its formulas may depend on another’s result. Move `Set(varOpenCount, CountRows(colOrders))` after the `Concurrent` call. `CountRows` on a collection works locally, and `Set` is allowed inside `Concurrent`; the problem is only the dependency.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Power Automate

export const powerAutomateFamilies: readonly QuestionSource[] = [
  ...ppChoiceFamily(
    'pp-flow-trigger-type',
    1,
    'Ask what starts the flow: an event in a system, a person, or the clock.',
    [
      {
        key: 'weekly-report',
        question:
          'Every Monday at 07:00 a flow must email managers a summary of last week’s overdue tasks. Which kind of cloud flow is this?',
        correct: 'A scheduled cloud flow (Recurrence trigger)',
        wrong: [
          'An automated cloud flow triggered when a task is modified',
          'An instant cloud flow started from a button',
          'A desktop flow',
        ],
        why: 'A scheduled flow starts from the Recurrence trigger at fixed times. An automated flow reacts to events, such as a task changing, which would send a report on every change instead of weekly. Instant flows need someone to start them, and desktop flows automate UI on a computer.',
      },
      {
        key: 'from-app',
        question:
          'A user selects "Request quote" in a canvas app, and a flow must create a PDF and return its link to the app. Which kind of cloud flow is this?',
        correct: 'An instant cloud flow, triggered from Power Apps',
        wrong: [
          'A scheduled cloud flow that checks for new requests every 5 minutes',
          'An automated cloud flow triggered when the app is opened',
          'A business process flow',
        ],
        why: 'Instant flows start when a person acts, here from a canvas app, and can return values to the app with "Respond to a PowerApp or flow". Polling on a schedule adds delay and wasted runs, there is no "app opened" trigger for this, and a business process flow is a stage bar in model-driven apps, not automation.',
      },
    ],
  ),
  ...ppChoiceFamily(
    'pp-flow-expressions',
    2,
    'Read the format string character by character; `MM` and `mm`, `HH` and `hh` mean different things.',
    [
      {
        key: 'format-date',
        question: 'What does this expression return?',
        code: plain(`formatDateTime('2026-03-05T14:30:00Z', 'yyyy-MM-dd HH:mm')`),
        correct: '`2026-03-05 14:30`',
        wrong: ['`2026-30-05 14:03`', '`2026-03-05 02:30`', '`05-03-2026 14:30`'],
        why: 'In format strings `MM` is the month and `mm` the minutes; `HH` is the 24-hour clock and `hh` the 12-hour clock. So `yyyy-MM-dd HH:mm` gives `2026-03-05 14:30`. Mixing up `MM`/`mm` or `HH`/`hh` is the classic mistake that produces wrong dates silently.',
      },
      {
        key: 'split-first',
        question:
          'A flow receives the invoice number `INV-2026-0042`. What does this expression return?',
        code: plain(`last(split(triggerBody()?['invoiceNumber'], '-'))`),
        correct: 'The string `0042`',
        wrong: ['The number `42`', 'The string `INV`', 'The array `["INV", "2026", "0042"]`'],
        why: '`split` returns an array of strings and `last` takes its final element, the string `0042`. Leading zeros are kept because nothing converts it to a number (that would need `int(...)`). `first` would return `INV`.',
      },
      {
        key: 'coalesce',
        difficulty: 3,
        question:
          'Some SharePoint items have no Department. The flow fails on those items in a Compose action. Which expression both avoids the failure and uses "Unassigned" when Department is missing?',
        code: plain(`// Compose input that fails on some items
triggerOutputs()['body/Department']`),
        correct: `\`coalesce(triggerOutputs()?['body/Department'], 'Unassigned')\``,
        wrong: [
          `\`if(empty(triggerOutputs()['body/Department']), 'Unassigned', triggerOutputs()['body/Department'])\``,
          `\`triggerOutputs()['body/Department'] ?? 'Unassigned'\``,
          `\`string(triggerOutputs()['body/Department'])\``,
        ],
        why: 'The `?[...]` operator returns null instead of failing when a property is missing, and `coalesce` returns its first non-null argument. The `if(empty(...))` version still evaluates `[...]` without `?`, so it fails before `empty` can help. `??` is not a Workflow Definition Language operator, and `string(...)` does not stop the property access from failing.',
      },
    ],
  ),
  ...ppChoiceFamily(
    'pp-flow-trigger-conditions',
    3,
    'A trigger condition is checked before a run starts: when it is false, no run is created.',
    [
      {
        key: 'self-trigger',
        question:
          'This flow runs again and again for the same item, every time it finishes. What is the best fix?',
        code: plain(`Trigger:  SharePoint - When an item is created or modified (list: Requests)
Action 1: Compose - build the approval summary
Action 2: SharePoint - Update item (same item): Processed = Yes, Summary = Outputs('Compose')`),
        correct: `Add a trigger condition such as \`@not(equals(triggerOutputs()?['body/Processed'], true))\` so updates that already set Processed do not start a run`,
        wrong: [
          'Add a Condition as the first action that ends the flow when Processed is Yes',
          'Set the trigger’s concurrency control to 1',
          'Turn off the flow after the first run and turn it on again with a scheduled flow',
        ],
        why: 'The flow’s own "Update item" is a modification, so it triggers the flow again. A trigger condition is evaluated before a run is created, so ignored updates cost no run and fill no run history. A Condition action also stops the loop, but only after a run has started for every update. Concurrency control limits parallel runs, not repeated ones.',
      },
      {
        key: 'combined-conditions',
        question:
          'A trigger has these two trigger conditions in its settings. When does a run start?',
        code: plain(`@equals(triggerOutputs()?['body/Status/Value'], 'Submitted')
@greater(triggerOutputs()?['body/Amount'], 5000)`),
        correct: 'Only when Status is Submitted and Amount is greater than 5000',
        wrong: [
          'When Status is Submitted or Amount is greater than 5000',
          'Only the first condition is used; the second is ignored',
          'The flow always runs, and the conditions only decide which actions execute',
        ],
        why: 'Multiple trigger conditions must all be true for a run to start (AND). For OR logic, write a single condition with `@or(...)`. Trigger conditions never select actions; that is the job of Condition and Switch actions after the trigger.',
      },
    ],
  ),
  ...ppChoiceFamily(
    'pp-flow-approvals',
    3,
    'Look at the approval type and at the exact values the action returns in `outcome`.',
    [
      {
        key: 'outcome-string',
        question:
          'Every approved request is treated as rejected. The approvers definitely chose Approve. What is wrong?',
        code: plain(`Action: Start and wait for an approval (Approve/Reject - First to respond)
Condition: outputs('Start_and_wait_for_an_approval')?['body/outcome'] is equal to 'Approved'
  If yes: Update item - Status = Approved
  If no:  Update item - Status = Rejected`),
        correct:
          'The outcome of an Approve/Reject approval is `Approve` or `Reject`, so the condition must compare with `Approve`',
        wrong: [
          'With "First to respond" the outcome is always empty; use "Everyone must approve"',
          'The condition runs before the approval is completed',
          'The outcome is a Boolean, so it must be compared with `true`',
        ],
        why: 'For Approve/Reject approvals the `outcome` is the text of the chosen response, `Approve` or `Reject`. Comparing with `Approved` is never true, so every request goes down the No branch. "Start and wait for an approval" pauses the run until the approval completes, so the condition sees the final outcome.',
      },
      {
        key: 'everyone-must-approve',
        difficulty: 2,
        question:
          'An approval of type "Approve/Reject - Everyone must approve" is assigned to three people. The first person rejects. What is the outcome of the approval?',
        correct: '`Reject`: one rejection is enough to reject the request',
        wrong: [
          '`Approve`, if the other two approve',
          'The approval waits until the other two respond, and the majority decides',
          'The rejection is ignored until all three have responded',
        ],
        why: 'With "Everyone must approve", all approvers must approve for the outcome to be `Approve`; any single rejection makes the outcome `Reject`. There is no majority vote. For majority-style decisions you would use custom responses and evaluate the individual responses yourself.',
      },
      {
        key: 'timeout-escalation',
        difficulty: 5,
        question:
          'Approvals that nobody answers must be escalated to a manager after 7 days, instead of leaving the run waiting. Which design works?',
        correct:
          'Set the approval action’s timeout to `P7D` and add an escalation action configured to run after the approval "has timed out"',
        wrong: [
          'Add a Delay of 7 days after the approval action, then send the escalation',
          'Put the approval in an Apply to each with a 7-day interval',
          'Add a Condition after the approval checking whether `outcome` is empty, without changing any settings',
        ],
        why: 'An action’s timeout (an ISO 8601 duration such as `P7D`) makes it end with status Timed out, and an action with run-after "has timed out" handles that path. A Delay after "Start and wait" only runs once someone responds. A Condition placed normally runs only after the approval succeeded, which never happens when nobody answers.',
      },
    ],
  ),
  ...ppChoiceFamily(
    'pp-flow-apply-each',
    4,
    'Variables belong to the whole flow run, not to one loop iteration.',
    [
      {
        key: 'concurrency-variable',
        question:
          'Concurrency control was enabled on this loop (degree of parallelism 20) to speed it up. Now the email bodies are mixed up: some contain another order’s lines. Why?',
        code: plain(`Initialize variable: body (String)
Apply to each: Orders   [Concurrency control: On, degree 20]
    Set variable: body = ''
    Apply to each: lines of the order
        Append to string variable: body += line text
    Send an email: Body = variables('body')`),
        correct:
          'All iterations share the single flow-level variable `body`, so parallel iterations overwrite and append to each other’s text',
        wrong: [
          'Concurrency control makes the iterations run in reverse order',
          'Append to string variable is not allowed inside a nested Apply to each',
          'Each iteration receives a copy of the variable, but the copies are merged at the end',
        ],
        why: 'Variables are global to the run. With parallel iterations, one iteration’s Set variable can clear text another iteration is still building. Either run the loop sequentially (concurrency off or degree 1) or avoid the shared variable: build each email body with actions scoped to the iteration, for example a Select over the lines followed by a Compose with `join(...)`.',
      },
      {
        key: 'filter-array',
        question:
          'A flow loops over 5,000 rows to collect those with Amount over 1,000 into an array variable. It is slow and uses many actions. Which redesign is best?',
        code: plain(`Apply to each: body('List_rows')?['value']
    Condition: item()?['amount'] is greater than 1000
        If yes: Append to array variable: bigOrders`),
        correct: `Replace the loop with a Filter array action using \`@greater(item()?['amount'], 1000)\` (or filter in the List rows query itself)`,
        wrong: [
          'Turn on concurrency control with degree 50 and keep the Append to array variable',
          'Add a Delay inside the loop to avoid throttling',
          'Split the loop into five loops of 1,000 rows each',
        ],
        why: 'Filter array evaluates the condition over the whole array as a single action, and filtering in the source query (an OData filter in "List rows") avoids fetching the rows at all. A loop with a condition and an append costs several actions per row. Parallel appends to a shared variable are also unsafe, and splitting or delaying the loop does not reduce the work.',
      },
    ],
  ),
  ...ppChoiceFamily(
    'pp-flow-error-handling',
    4,
    'An action runs after its predecessor only for the statuses ticked in "Configure run after": is successful, has failed, is skipped, has timed out.',
    [
      {
        key: 'timeout-runafter',
        question:
          'The HTTP call in Try sometimes times out. When it does, the Catch scope does not run. Why?',
        code: plain(`Scope: Try
    HTTP - POST to the payment API (timeout PT2M)
Scope: Catch   [run after Try: has failed]
    Post message in a chat or channel: "Payment failed"`),
        correct:
          'A timeout gives Try the status Timed out, not Failed; Catch must also run after "has timed out"',
        wrong: [
          'Scopes cannot catch errors from HTTP actions',
          'Catch must be placed inside Try to see its errors',
          'Catch runs only if every action in Try has failed',
        ],
        why: 'Run-after checks the predecessor’s status exactly. Timed out is a separate status from Failed, so a Catch that only runs after "has failed" is skipped on timeouts. Typical catch scopes tick both "has failed" and "has timed out". A scope takes a failed or timed-out status from the actions inside it, which is what makes the Try/Catch pattern work.',
      },
      {
        key: 'result-function',
        question:
          'In the Catch scope you want the error message of whichever action failed inside Try. Which expression is the starting point?',
        correct: "`result('Try')`, filtered to the items whose status is Failed",
        wrong: [
          "`outputs('Try')?['body/error']`",
          "`body('Catch')`",
          "`triggerOutputs()?['error']`",
        ],
        why: '`result()` returns an array describing every action inside a scope, each with its name, status, inputs and outputs, so you can filter for status `Failed` and read the error. A scope has no ordinary outputs, `body(...)` of the catch scope refers to itself, and the trigger outputs know nothing about later failures.',
      },
      {
        key: 'finally-skipped',
        difficulty: 5,
        question:
          'Finally is meant to always write a log row. It runs when Try fails, but is skipped when Try succeeds. Why?',
        code: plain(`Scope: Try
Scope: Catch    [run after Try: has failed, has timed out]
Scope: Finally  [run after Catch: is successful, has failed]
    Dataverse - Add a new row (Run log)`),
        correct:
          'When Try succeeds, Catch is skipped; Finally must also run after Catch "is skipped"',
        wrong: [
          'Finally must run after Try instead of Catch, because only the first scope has a status',
          'A scope with no failed actions is skipped, so Try itself is skipped',
          'Finally is skipped because Dataverse actions cannot run after a scope',
        ],
        why: 'Catch only runs on failure, so on success its status is Skipped. Finally depends on Catch, and since "is skipped" is not ticked, it is skipped too. Ticking all four statuses (successful, failed, skipped, timed out) on Finally makes it run in every case.',
      },
      {
        key: 'terminate-status',
        difficulty: 5,
        question:
          'Try fails, Catch runs successfully and posts an alert. Run history shows the run as Succeeded, so the support team’s monitoring of failed runs misses it. What should be added?',
        code: plain(`Scope: Try
Scope: Catch   [run after Try: has failed, has timed out]
    Post message in a chat or channel: "Import failed"`),
        correct: 'A Terminate action with status Failed at the end of Catch',
        wrong: [
          'Nothing: a run that contains any failed action is always reported as Failed',
          'A Condition after Catch that compares the run status with `Failed`',
          'Turn off "Secure outputs" on the Try scope',
        ],
        why: 'When a failure is handled by later actions that succeed, the run’s final status is taken from how it ended, so it can be Succeeded even though Try failed. Ending Catch with Terminate (status Failed, with a code and message) makes the run report failure honestly while still running the handling actions. Secure outputs only hides data in run history.',
      },
    ],
  ),
  ...ppChoiceFamily(
    'pp-flow-retry',
    4,
    'Retry policies are for transient failures: the same request might succeed a moment later.',
    [
      {
        key: 'bad-request',
        question:
          'An HTTP action fails with `400 Bad Request` because a required field is missing from the JSON body. The action uses the default retry policy. What happens, and what is the fix?',
        correct:
          'The request is not retried, because 400 is not a transient error; fix the request body (and handle the failure with run-after)',
        wrong: [
          'It is retried until it succeeds, so no change is needed',
          'Switch the retry policy to a fixed interval with 10 retries',
          'Add a Delay before the HTTP action so the API is ready',
        ],
        why: 'Retry policies retry transient failures: timeouts (408), throttling (429), server errors (5xx) and connection problems. A 400 means the request itself is wrong; sending it again gives the same answer. More retries or delays only waste time, so fix the input and handle permanent failures explicitly.',
      },
      {
        key: 'throttling',
        question:
          'During a nightly bulk update, a connector action sometimes fails with `429 Too Many Requests`, but succeeds when the run is resubmitted. What is the most appropriate change?',
        correct:
          'Keep an exponential retry policy on the action and reduce parallelism (for example lower the loop’s concurrency)',
        wrong: [
          'Set the retry policy to None so the flow fails fast',
          'Add a trigger condition so the flow runs less often',
          'Replace the action with an HTTP action, which is never throttled',
        ],
        why: '429 is a transient throttling response: retrying with growing intervals usually succeeds, and sending fewer requests at once avoids the limit in the first place. Disabling retries turns a transient error into a failed run, a trigger condition does not change the number of calls within a run, and every API (including through the HTTP action) has limits.',
      },
    ],
  ),
  ...ppChoiceFamily(
    'pp-flow-idempotency',
    5,
    'Assume the same event can arrive twice. What makes the second processing harmless?',
    [
      {
        key: 'duplicate-invoice',
        question:
          'An automated flow creates an invoice in Dataverse for each "order paid" event from a webhook. The sender guarantees at-least-once delivery, and some orders got two invoices. Which design prevents duplicates?',
        correct:
          'Store the order ID on the invoice as an alternate key and upsert by that key (or check for an existing invoice with that order ID) before creating',
        wrong: [
          'Set the trigger’s concurrency control to 1 so runs never overlap',
          'Add a retry policy of None to the create action',
          'Add a Delay of 1 minute at the start of the flow',
        ],
        why: 'With at-least-once delivery, the same event can legitimately arrive twice, possibly hours apart. Making the operation idempotent, keyed on a stable business identifier, means the second processing updates or finds the same invoice instead of creating another. Serializing runs only stops overlapping runs, not repeated ones; removing retries or adding delays does not change that the event was delivered twice.',
      },
      {
        key: 'race-check',
        question:
          'A flow checks "Does an invoice for this order exist?" and creates one if not. Two runs for the same order start within the same second and both create an invoice. What makes this reliable?',
        correct:
          'Let Dataverse enforce uniqueness with an alternate key on the order ID, so the second create fails (or the upsert updates the same row)',
        wrong: [
          'Add a second "does it exist?" check just before the create',
          'Increase the retry count on the create action',
          'Move the check into a child flow',
        ],
        why: 'Check-then-create is a race: both runs can pass the check before either creates. A uniqueness constraint in the data store (an alternate key) is enforced atomically, so only one row can exist for the order. Extra checks narrow the window but do not close it, and retries or child flows do not change the race.',
      },
    ],
  ),
  ...ppChoiceFamily(
    'pp-flow-operations',
    2,
    'Think about what an operator can see in run history, and what solution features a flow relies on.',
    [
      {
        key: 'secure-inputs',
        question:
          'A flow retrieves an API key from Azure Key Vault and passes it in an HTTP header. Anyone who can view run history can read the key. What should you do?',
        correct: 'Turn on Secure inputs and Secure outputs on the actions that handle the key',
        wrong: [
          'Rename the action so the key is harder to find',
          'Store the key in a flow variable instead',
          'Delete run history after each run',
        ],
        why: 'Secure inputs and Secure outputs hide an action’s data in run history, so the secret is not displayed. Variables are visible in run history too, renaming hides nothing, and deleting history manually is unreliable and loses useful diagnostics.',
      },
      {
        key: 'child-flow',
        difficulty: 3,
        question:
          'Three flows repeat the same 12 actions to create a customer in an ERP system. You want one reusable flow that returns the new customer number to its callers. Which design fits?',
        correct:
          'A solution-aware child flow with a manual trigger that ends with "Respond to a PowerApp or flow", called from the parents with "Run a Child Flow"',
        wrong: [
          'A scheduled flow that the three flows start by writing a row to a SharePoint list',
          'Copy the 12 actions into a Scope in each flow',
          'A desktop flow, because only desktop flows can return values',
        ],
        why: 'Child flows let parent flows call shared logic and receive outputs; both flows are created in a solution, the child uses a manual trigger, and its response action returns values to the parent. A list-and-schedule hand-off is slow and cannot return a value to the caller, and copying actions into Scopes keeps three copies to maintain.',
      },
    ],
  ),
];
