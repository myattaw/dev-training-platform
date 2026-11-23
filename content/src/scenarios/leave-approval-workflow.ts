import type { ScenarioSource } from '@pracstack/content-model';
import { plain, text } from '../skill-mastery/helpers';
import { blanks, multiple, questionTask, single } from './builders';

const ID = 'leave-approval-workflow';

export const leaveApprovalWorkflow: ScenarioSource = {
  id: ID,
  version: 1,
  title: 'Leave Approval Workflow',
  summary:
    'Design a Power Automate approval flow on Dataverse that does not trigger itself, handles two approval stages and gives each role the right access.',
  difficulty: 'medium',
  estimatedMinutes: 45,
  technologies: ['Power Automate', 'Dataverse', 'Power Apps', 'Security roles'],
  relatedSkillIds: ['pp-power-automate', 'pp-dataverse', 'pp-power-apps'],
  context: text(
    'Halden & Rowe Engineering (a fictional 600-person engineering consultancy) is retiring its email-based holiday requests. Employees now submit leave requests in a model-driven Power App backed by Dataverse, and a Power Automate cloud flow routes them for approval.',
    'The pilot in one department went badly: some requests got three approval emails, one flow ran in a loop until it was turned off, and an employee could open colleagues’ medical leave requests. You are the Power Platform developer asked to redesign the flow and the security model before the company-wide rollout.',
  ),
  requirements: [
    {
      kind: 'list',
      items: [
        'A request starts approval when the employee submits it, and only then.',
        'The line manager approves every request; requests of more than 5 working days also need HR approval after the manager.',
        'Rejection ends the process with the approver’s comments; approvers may delegate to a deputy while away.',
        'One submission produces exactly one approval process, even if Dataverse delivers the change more than once.',
        'Employees see only their own requests, managers their team’s, HR all of them.',
      ],
    },
  ],
  acceptanceCriteria: [
    'The flow does not run again because of its own updates to the row.',
    'The approval stages and the 5-day rule follow the policy, and the status always reflects the latest decision.',
    'The actual approver (including a deputy) is recorded, and approvals that get no answer escalate instead of silently expiring.',
    'Duplicate trigger deliveries do not create duplicate approvals.',
    'The security model enforces row access in Dataverse, not only by hiding views in the app.',
  ],
  artifacts: [
    {
      id: 'leave-request-table',
      title: 'Dataverse table: Leave Request (cr_leaverequest)',
      description: 'Columns, with their logical names and choice values.',
      snippet: plain(`Column (display)     Logical name        Type
Employee             ownerid             Owner (user; the employee who submits)
Start date           cr_startdate        Date only
End date             cr_enddate          Date only
Working days         cr_workingdays      Whole number (calculated by the app)
Leave type           cr_leavetype        Choice: Annual, Unpaid, Medical, Other
Status               cr_status           Choice:
                                           100000000 Draft
                                           100000001 Submitted
                                           100000002 Pending approval
                                           100000003 Approved
                                           100000004 Rejected
                                           100000005 Cancelled
Approval id          cr_approvalid       Text (100)
Approved by          cr_approvedby       Lookup (User)
Decision comments    cr_comments         Multiple lines of text`),
    },
    {
      id: 'pilot-flow',
      title: 'The pilot flow',
      description: 'The flow as built for the pilot, described step by step.',
      snippet: plain(`Trigger   Microsoft Dataverse: When a row is added, modified or deleted
          Change type: Added or Modified    Table: Leave Requests    Scope: Organization
          Select columns: (empty)           Filter rows: (empty)     Trigger conditions: (none)
1  Get manager (V2) for the row's owner (Office 365 Users)
2  Start and wait for an approval
     Type: Approve/Reject - Everyone must approve
     Assigned to: manager; hr-leave@haldenrowe.example
3  Condition: outcome is Approve
     yes: Update a row (Leave Requests): Status = Approved
     no:  Update a row (Leave Requests): Status = Rejected
Settings  Concurrency control: off`),
    },
    {
      id: 'run-history',
      title: 'Run history for one request',
      description: 'What the pilot produced for a single 3-day request.',
      snippet: plain(`Request LR-00412 (3 working days), submitted 09:02
09:02:11  Run 1  trigger: modified (cr_status Draft -> Submitted)         approval sent to manager + HR
09:02:13  Run 2  trigger: modified (same change, delivered again)        approval sent to manager + HR
09:47:30  Run 1  outcome Approve -> Update a row (Status = Approved)
09:47:32  Run 3  trigger: modified (cr_status Submitted -> Approved)      approval sent to manager + HR
...       (the employee received an "approved" email, then two new approval requests went out)`),
    },
    {
      id: 'security-matrix',
      title: 'Required access to Leave Request rows',
      description: 'Agreed with HR and the works council.',
      snippet:
        plain(`Role                 Create   Read                          Write                     Delete
Employee             own      own rows                      own rows while Draft      none
Line manager         -        direct reports' rows          approval decision only    none
HR leave team        -        all rows                      all rows                  none
Everyone else        -        none                          none                      none
Note: Medical leave rows must never be visible to colleagues.`),
    },
  ],
  tasks: [
    questionTask(
      'stop-self-triggering',
      'Stop the flow from triggering itself',
      single({
        id: `${ID}-self-trigger`,
        difficulty: 3,
        prompt:
          'Run 3 in the history was started by the flow’s own update to Status. Which change stops this while still starting the flow when an employee submits?',
        correct:
          'Set Select columns to `cr_status` and add a trigger condition that the status is Submitted (100000001), so the flow’s own updates to Pending approval, Approved or Rejected do not start a run',
        wrong: [
          'Turn on concurrency control with a degree of parallelism of 1',
          'Change the trigger’s Scope from Organization to User',
          'Change the trigger’s Change type from Added or Modified to Added, so only new rows start a run',
        ],
        hint: 'Which columns should be able to start the flow, and in which state should the row be?',
        why: 'With no Select columns, any change to any column starts the flow, including its own updates. Select columns (filtering attributes) limits the trigger to changes of `cr_status`; the trigger condition then ignores every status change except the one to Submitted. Rejected runs are skipped before they start and do not appear as failures. Concurrency control only serialises runs, and Scope decides whose rows are watched (the flow owner’s, their business unit’s or the whole organization’s), not who changed them. Added would miss every request created as a Draft and submitted later.',
      }),
    ),
    questionTask(
      'trigger-condition',
      'Write the trigger condition',
      blanks({
        id: `${ID}-trigger-condition`,
        difficulty: 3,
        prompt:
          'Complete the trigger condition (Settings, Trigger conditions) so the flow only runs when the row’s Status is Submitted. Use the logical name and the choice value from the table definition.',
        template: plain(`@equals(triggerOutputs()?['body/{{blank:column}}'], {{blank:value}})`),
        accepted: { column: ['cr_status'], value: ['100000001'] },
        hint: 'The Dataverse trigger returns the row’s columns under `body`, by logical name; a choice column’s value is its number.',
        why: "Trigger conditions are expressions evaluated before a run starts; the flow runs only when they return true. The Dataverse trigger exposes the row as `triggerOutputs()?['body']`, keyed by logical names, and a choice column is its integer value (`100000001` for Submitted), not the label. Combined with Select columns, the flow starts once per submission and never on its own updates.",
      }),
    ),
    questionTask(
      'approval-stages',
      'Model the approval stages',
      single({
        id: `${ID}-approval-stages`,
        difficulty: 3,
        prompt:
          'The policy: the line manager approves every request; more than 5 working days also needs HR, after the manager. Which flow design implements it?',
        correct:
          'Set Status to Pending approval, then “Start and wait for an approval” (Approve/Reject - First to respond) for the manager; if approved and `cr_workingdays` is greater than 5, a second approval for the HR leave team; set Approved only after the last required approval, Rejected as soon as one stage rejects',
        wrong: [
          'One approval of type “Everyone must approve”, assigned to the manager and the HR team together',
          'One approval of type “First to respond”, assigned to the manager and the HR team, so whoever is available first decides',
          'Two approvals in parallel branches (manager and HR), and approve the request when both branches finish',
        ],
        hint: 'Stages are sequential and conditional: HR is involved only for long requests, and only after the manager.',
        why: 'Two sequential approval actions give two stages: the HR stage runs only when the manager approved and the request is longer than 5 days, and HR sees the manager’s decision. A single “Everyone must approve” approval involves HR in every request (the pilot design), “First to respond” lets HR approve without the manager, and parallel branches send HR requests the manager may still reject. Setting Pending approval first also makes the next task (duplicate prevention) possible.',
      }),
    ),
    questionTask(
      'rejection-and-delegation',
      'Handle rejection, delegation and silence',
      single({
        id: `${ID}-rejection-delegation`,
        difficulty: 4,
        prompt:
          'A manager reassigns an approval to her deputy while on holiday; another manager never answers. What should the flow do?',
        correct:
          'Record the responder from the approval’s responses output (it can be the deputy, not the manager), store the comments on rejection, and set a timeout on the approval action with a branch that runs after it times out to escalate or remind, because a flow run cannot wait more than 30 days',
        wrong: [
          'Nothing: reassigning an approval cancels it and the flow fails, so the employee must submit again',
          'Store the manager from step 1 as Approved by, since the approval was sent to the manager',
          'On rejection, delete the Leave Request row so the employee can create a fresh one',
        ],
        hint: 'Look at what the approval action returns, and at how long a cloud flow run can stay waiting.',
        why: 'Approvals can be reassigned by the approver, and the action’s output lists who actually responded, with their comments; that person is the approver of record for audit. A cloud flow run ends after 30 days, so an unanswered “Start and wait for an approval” eventually fails; a shorter timeout (for example `P5D`) and a branch configured to run after the action has timed out lets the flow escalate to the next manager or HR. Deleting rejected rows destroys the history HR needs.',
      }),
    ),
    questionTask(
      'prevent-duplicate-approvals',
      'Prevent duplicate approvals',
      multiple({
        id: `${ID}-duplicate-approvals`,
        difficulty: 4,
        prompt:
          'Runs 1 and 2 in the history were started by the same change, delivered twice. Which measures together guarantee one approval per submission? Select all that apply.',
        options: [
          {
            text: 'Set the trigger’s concurrency control to a degree of parallelism of 1, so runs for the table start one after another',
            correct: true,
          },
          {
            text: 'As the first actions, get the row again by its id and stop (Terminate, Succeeded) if its Status is no longer Submitted',
            correct: true,
          },
          {
            text: 'Then set Status to Pending approval and store the approval’s id in `cr_approvalid`, so any later run sees the request is already being handled',
            correct: true,
          },
          {
            text: 'Rely on Dataverse to deliver each change to the flow exactly once',
            correct: false,
          },
          {
            text: 'Add a 1-minute Delay at the start of the flow so duplicate runs give up',
            correct: false,
          },
        ],
        hint: 'Treat the trigger as at-least-once and make the flow idempotent: check the current state, then change it, and make sure two runs cannot check at the same time.',
        why: 'Trigger delivery is at least once, so the flow has to be idempotent. Re-reading the row (the trigger’s copy may be stale) and checking that it is still Submitted, then moving it to Pending approval, turns the status into a guard; storing the approval id leaves an audit trail. Without serialising runs, two runs could both read Submitted before either updates it, which is why concurrency control is part of the answer. A Delay only shifts both runs by a minute.',
      }),
    ),
    questionTask(
      'row-level-security',
      'Model who can see which requests',
      single({
        id: `${ID}-row-security`,
        difficulty: 4,
        prompt:
          'Which Dataverse security design matches the access matrix (employees their own rows, managers their direct reports’ rows, HR all rows)?',
        correct:
          'Employee role with User-level create, read and write on Leave Request (rows they own); hierarchy security using the manager hierarchy with depth 1 so managers get access to their direct reports’ rows; an HR role with Organization-level read and write',
        wrong: [
          'Business Unit-level read for every employee, and hide other people’s requests with a filtered view in the app',
          'One business unit per manager, with every employee moved into their manager’s business unit',
          'Organization-level read for everyone, and a Power Apps formula that hides rows whose owner is not the current user',
        ],
        hint: 'Views and app formulas only change what is displayed. Which features change what Dataverse returns to an API call?',
        why: 'Security roles decide access per table and depth: User level gives employees their own rows (the employee owns the row they create). The manager hierarchy model grants managers access to rows owned by the users who report to them, without restructuring the organization, and depth 1 limits it to direct reports. HR gets Organization level. Hiding rows in a view or formula is not security: the Web API, Excel export and Advanced Find still return them, which is how the pilot leaked medical leave requests. Business units model organizational boundaries, not reporting lines, and rebuilding them for every manager change is unmanageable.',
      }),
    ),
  ],
  limitations:
    'Structured assessment only: PracStack cannot run Power Automate or Dataverse, so the flow design, trigger behaviour and security model are graded through questions on the artifacts, not by executing a flow.',
};
