import type { QuestionSource } from '@pracstack/content-model';
import { plain } from '../helpers';
import { scenarioFamily, selectFamily } from './builders';

/*
 * Agile delivery and the SDLC: Scrum (Scrum Guide 2020 terms), Kanban flow,
 * user stories and acceptance criteria, estimation, retrospectives,
 * requirements, decision records and change management. Scenario questions,
 * reviewed by hand.
 */

export const agileSdlcFamilies: readonly QuestionSource[] = [
  // ---------------------------------------------------------------- Scrum
  ...scenarioFamily(
    'eng-scrum-in-practice',
    1,
    'Scrum separates accountabilities: who decides what is valuable, who decides how to do the work, and who helps the team work effectively.',
    [
      {
        key: 'backlog-ordering',
        question: 'Who is accountable for ordering the Product Backlog?',
        correct: 'The Product Owner',
        wrong: [
          'The Scrum Master',
          'The Developers, by majority vote',
          'The most senior stakeholder',
        ],
        why: "The Product Owner is accountable for the Product Backlog, including its ordering, and for maximising the value of the product. Others can influence it, but the decision is the Product Owner's. The Scrum Master serves the team and organisation by helping Scrum work; it is not a project-manager role that sets priorities.",
      },
      {
        key: 'stakeholder-request',
        difficulty: 2,
        question:
          'Mid-Sprint, a sales director asks two Developers to build an unrelated "quick" feature for a customer demo. What should happen?',
        correct:
          'The request goes to the Product Owner, who decides where it belongs in the Product Backlog; the Developers keep working toward the Sprint Goal',
        wrong: [
          'The Developers add it to the Sprint Backlog, since stakeholders fund the product',
          'The Scrum Master decides whether it is urgent enough to add',
          'The sales director adds it to the Sprint Backlog directly',
        ],
        why: "Work reaches the team through the Product Backlog, which the Product Owner orders. Bypassing that undermines the Sprint Goal and makes the Product Owner's ordering meaningless. If the request really is more valuable, the Product Owner can order it at the top for the next Sprint (or, in an extreme case, cancel the Sprint if the Sprint Goal becomes obsolete).",
      },
      {
        key: 'hardening-sprint',
        difficulty: 3,
        question:
          'A team proposes a "hardening sprint" every fourth Sprint, dedicated to testing and fixing bugs before release. How does this fit with Scrum?',
        correct:
          'It signals that Increments are not really Done; every Sprint should produce a usable Increment that meets the Definition of Done, so improve the Definition of Done and practices instead',
        wrong: [
          'It is fine; the Scrum Guide describes hardening sprints for stabilisation',
          'It is fine as long as the Product Owner agrees to it',
          'It is required whenever the team has more than nine members',
        ],
        why: 'Scrum has no hardening sprints (or "sprint zero"). Each Sprint must produce at least one Increment that meets the Definition of Done, meaning it is usable and could be released. Postponing testing to a special Sprint hides undone work and risk. The fix is to build quality into every Sprint and make the Definition of Done reflect that.',
      },
      {
        key: 'daily-scrum',
        difficulty: 3,
        question:
          'The Daily Scrum has turned into a 30-minute round where each Developer reports to the Scrum Master. What does Scrum intend instead?',
        correct:
          'A 15-minute event for the Developers to inspect progress toward the Sprint Goal and adapt their plan (the Sprint Backlog) for the next day',
        wrong: [
          'A daily status report to the Scrum Master, kept to 15 minutes',
          "A meeting run by the Product Owner to assign the day's tasks",
          'A 30-minute event is fine as long as everyone speaks',
        ],
        why: 'The Daily Scrum is for the Developers, about the Sprint Goal, and timeboxed to 15 minutes. It is planning, not reporting: the point is to adjust the work together. The Scrum Master makes sure it happens and stays useful but is not the audience, and nobody assigns tasks to the Developers.',
      },
      {
        key: 'scope-renegotiation',
        difficulty: 4,
        question:
          'Halfway through a Sprint, the Developers see that 2 of the 8 selected items will not be finished, although the Sprint Goal can still be met. What happens?',
        correct:
          'They clarify and renegotiate the Sprint Backlog with the Product Owner; the Sprint Goal stays, and the unfinished items return to the Product Backlog',
        wrong: [
          'The Sprint is extended until all 8 items are finished',
          'The Sprint is cancelled, because the forecast was wrong',
          'The 2 items are marked Done with a list of known gaps',
        ],
        why: 'The Sprint Goal is the commitment; the selected items are a forecast. Scope may be renegotiated with the Product Owner as more is learned, as long as the Sprint Goal is not endangered. Sprints have a fixed length, cancelling is only for an obsolete Sprint Goal, and "Done with gaps" is not Done.',
      },
      {
        key: 'not-done-at-review',
        difficulty: 4,
        question:
          'A story meets all its acceptance criteria, but has not passed the security scan that the Definition of Done requires. The Sprint Review is tomorrow. What happens to it?',
        correct:
          'It is not part of the Increment: it cannot be presented as done or released, and returns to the Product Backlog',
        wrong: [
          'It is presented as done, because the acceptance criteria are met',
          'It is released and the scan runs in the next Sprint',
          'The Product Owner can declare it done for this Sprint only',
        ],
        why: "The Definition of Done is the commitment for the Increment: an item that does not meet it is not part of the Increment, cannot be released, and should not be presented as finished at the Sprint Review. Acceptance criteria describe one item's behaviour; the Definition of Done is the quality bar for all of them.",
      },
    ],
  ),

  // ---------------------------------------------------------------- Kanban and flow
  ...scenarioFamily(
    'eng-kanban-flow',
    2,
    'In a pull system you finish work before starting more; limits make bottlenecks visible.',
    [
      {
        key: 'wip-limit-full',
        question:
          "A Developer finishes coding a card. The Review column is at its limit. Under the team's WIP limits, what should they do?",
        code: plain(`| Ready   | In progress (limit 3) | Review (limit 2) | Done |
|---------|-----------------------|------------------|------|
| 9 cards | 3 cards               | 2 cards          | 41   |`),
        correct: 'Help review the cards already in Review, so work flows again',
        wrong: [
          'Move the card into Review anyway, since the coding is finished',
          'Start a new card from Ready while waiting',
          'Raise the Review limit to 3',
        ],
        why: 'A full column is a signal: Review is the bottleneck. Starting new work adds to the queue and makes everything slower; swarming on the bottleneck finishes items. Raising the limit whenever it is reached removes the signal that makes WIP limits useful.',
      },
      {
        key: 'littles-law',
        difficulty: 4,
        question:
          'A team finishes about 4 items per week and has about 12 items in progress at any time. Roughly how long does an item take from start to finish, and which change shortens that most directly?',
        correct: 'About 3 weeks; reducing the number of items in progress',
        wrong: [
          'About 3 days; adding more columns to the board',
          'About 12 weeks; estimating items more carefully',
          'About 3 weeks; starting new items sooner',
        ],
        why: "Little's Law: average cycle time = average work in progress / average throughput = 12 / 4 = 3 weeks. With the same throughput, fewer items in progress means each one finishes sooner. Starting items sooner raises WIP and makes cycle time longer, which is the misconception WIP limits exist to counter.",
      },
      {
        key: 'carry-over',
        difficulty: 5,
        question:
          'The team keeps carrying stories over from Sprint to Sprint. Given this data, which change helps most?',
        code: plain(`Sprint  Points planned  Points done  Stories started  Stories done
14      40              22           9                4
15      38              20           10               4
16      40              24           9                5`),
        correct:
          'Plan around the roughly 22 points actually finished, split stories so each can finish within a few days, and limit how many are in progress at once',
        wrong: [
          'Ask the team to commit to more points so the pressure raises output',
          'Make Sprints four weeks long so the large stories fit',
          'Re-estimate the stories with larger numbers so the plan matches the work',
        ],
        why: "The data shows two problems: the plan ignores the team's actual throughput, and many stories are started but few finished, so work is spread too thin. Planning to real capacity, smaller stories and a WIP limit attack both. More pressure, longer Sprints and inflated estimates change the numbers, not the flow.",
      },
    ],
  ),

  // ---------------------------------------------------------------- User stories
  ...scenarioFamily(
    'eng-user-stories',
    1,
    'A good story names who benefits, what they can do and why it matters, and can be verified.',
    [
      {
        key: 'well-formed',
        question: 'Which is a well-formed user story?',
        correct:
          'As a returning customer, I want to save my delivery address so that checking out next time is faster',
        wrong: [
          'Add an `address` table to the database',
          'As a developer, I want to refactor the checkout controller',
          'The system shall be fast',
        ],
        why: 'A user story describes value from a user\'s point of view: who, what, and why. The "why" helps the team find the simplest solution and the Product Owner order the work. A database table is a technical task, the refactor names no user value, and "shall be fast" is an unmeasurable quality wish.',
      },
      {
        key: 'testable-criterion',
        difficulty: 2,
        question: 'Which acceptance criterion for a product search can be tested?',
        correct:
          'For a catalogue of 50,000 products, 95% of searches return results within 2 seconds',
        wrong: ['Search is fast', 'Search is user-friendly', 'Search works well on mobile devices'],
        why: 'A testable criterion states a measurable outcome and its conditions, so anyone can check it and get the same answer. "Fast", "user-friendly" and "works well" mean different things to different people and lead to arguments at the Sprint Review.',
      },
      {
        key: 'vertical-split',
        difficulty: 3,
        question:
          'The story "As a shopper, I want to pay for my order" covers cards, PayPal, gift cards and refunds, and is far too big for one Sprint. What is the best way to split it?',
        correct:
          'By slices of user value: "pay by card" end to end first, then gift cards, PayPal and refunds as separate stories',
        wrong: [
          'By layer: one story for the database, one for the API, one for the user interface',
          'By activity: a design story, an implementation story and a testing story',
          "By developer: one story for each person's part",
        ],
        why: 'Vertical slices each deliver something a user can do, can be finished and shown on their own, and give feedback early. Horizontal splits (layers or activities) produce pieces with no user value until all are done, so risk and integration problems surface late.',
      },
      {
        key: 'missing-criterion',
        difficulty: 3,
        question: [
          'Story: "As a customer, I want to reset my password by email, so that I can get back into my account."',
          "Acceptance criteria so far: (1) a reset link is emailed to the account's address; (2) the link opens a page where the customer sets a new password. Which criterion is most important to add?",
        ],
        correct: 'The link expires after a short time and works only once',
        wrong: [
          'The email shows the company logo',
          'The reset button on the page is blue',
          'The reset page has a link back to the home page',
        ],
        why: 'A reset link is a credential: if it never expires or can be reused, anyone who later gets hold of the email can take over the account. Criteria should capture the rules that matter, including security and edge cases, not cosmetic details that belong in a design.',
      },
    ],
  ),

  // ---------------------------------------------------------------- Estimation
  ...scenarioFamily(
    'eng-estimation',
    2,
    "Story points are relative to the team's own reference work; velocity describes the past to help forecast.",
    [
      {
        key: 'compare-teams',
        question:
          'Team A averages 45 points per Sprint and Team B averages 30. A manager concludes Team A is 50% more productive. What is wrong with this?',
        correct:
          "Points are relative to each team's own reference stories, so velocities are not comparable between teams; velocity is for a team's own forecasting",
        wrong: [
          'Nothing: points are a standard unit across teams',
          'The comparison is valid only if both teams use the Fibonacci scale',
          'The comparison is valid once points are converted into hours at 4 hours per point',
        ],
        why: "A point means whatever a team's reference stories make it mean, so 45 points for one team and 30 for another can be the same amount of work. Using velocity to compare or rank teams also invites inflation. It is a planning aid for the team that produced it, nothing more.",
      },
      {
        key: 'planning-poker-spread',
        question: 'In planning poker the votes are 3, 3, 5 and 13. What is the best next step?',
        correct:
          'Ask the people with the highest and lowest votes to explain their reasoning, discuss, and vote again',
        wrong: [
          'Take the average, 6',
          'Take the majority vote, 3',
          'Let the most senior developer decide',
        ],
        why: 'A wide spread means people see the work differently; the 13 may know about a risk, or the 3s may know a shortcut. The value of estimating together is that discussion, which surfaces assumptions. Averaging or outvoting hides exactly the information the spread revealed.',
      },
      {
        key: 'velocity-forecast',
        difficulty: 3,
        question:
          'The last five Sprints delivered 21, 25, 19, 24 and 21 points. About 110 points of work remain. What forecast should the team give?',
        correct: 'Around 5 Sprints, stated as a range of about 5 to 6, because velocity varies',
        wrong: [
          'Exactly 4.4 Sprints, based on the best Sprint, since the team is improving',
          'Exactly 5 Sprints, committed as a fixed date',
          'No forecast is possible until every item is estimated in hours',
        ],
        why: 'The average velocity is 22, so 110 points is about 5 Sprints; with the slowest recent pace (19) it is nearly 6. A range communicates the real uncertainty. Using only the best Sprint is optimistic, and a single fixed date gives false precision. Re-estimating in hours adds effort without adding accuracy.',
      },
      {
        key: 'velocity-target',
        difficulty: 4,
        question:
          'Management sets the team a target of 20% more velocity next quarter. What is the most likely result?',
        correct:
          'Estimates drift upwards, so velocity rises while the amount of value delivered stays about the same',
        wrong: [
          'The team delivers 20% more features, because targets focus effort',
          'Velocity stays the same, because points cannot change',
          'Quality improves, because the team works more efficiently',
        ],
        why: "When a measure becomes a target, people optimise the measure (Goodhart's law). Points are estimated by the team, so the easiest way to hit the target is to estimate higher, often unconsciously. To improve delivery, look at outcomes, cycle time and obstacles instead of setting point targets.",
      },
    ],
  ),

  // ---------------------------------------------------------------- Requirements, retrospectives and change
  ...scenarioFamily(
    'eng-sdlc-practices',
    1,
    'Ask what the practice is for, and what would happen without it.',
    [
      {
        key: 'non-functional',
        question: 'Which of these is a non-functional requirement?',
        correct:
          'The API responds within 300 ms at the 95th percentile under 500 requests per second',
        wrong: [
          'Users can export invoices as PDF',
          'An administrator can deactivate a user account',
          'The system emails a receipt after payment',
        ],
        why: 'Functional requirements say what the system does (export, deactivate, send). Non-functional requirements say how well it must do it: performance, availability, security, accessibility. They need numbers and conditions, like this one, to be testable.',
      },
      {
        key: 'retro-no-change',
        difficulty: 3,
        question:
          'The same three problems come up in every retrospective, but nothing changes. What is the best way to break the pattern?',
        correct:
          "Pick the one or two most important improvements, turn them into concrete actions with an owner, add them to the next Sprint's work, and check them at the next retrospective",
        wrong: [
          'Stop holding retrospectives, since they are not producing results',
          'Make the retrospective twice as long so all problems can be discussed',
          'Let the Scrum Master fix all three problems outside the meeting',
        ],
        why: 'Retrospectives fail when they produce discussion without follow-through. A small number of concrete, owned actions, planned as real work and reviewed later, turns talk into change. Scrum explicitly allows improvements to be added to the next Sprint Backlog. Longer meetings or delegating everything to one person do not create ownership.',
      },
      {
        key: 'decision-record',
        difficulty: 3,
        question:
          'After a long debate, the team chose PostgreSQL over a document database. Six months later, new team members keep asking why. What should have been recorded, and how?',
        correct:
          'An Architecture Decision Record in the repository with the context, the options considered, the decision and its consequences; a later change of mind gets a new record that supersedes it',
        wrong: [
          'A comment in the database configuration file saying "we use PostgreSQL"',
          'Nothing: the meeting recording is enough',
          'A wiki page that is edited in place whenever the decision changes',
        ],
        why: 'An ADR captures why a decision was made, which the code alone cannot show, next to the code where people will find it. Keeping old records and superseding them preserves the reasoning over time. A comment states the what without the why, recordings are rarely searched, and editing in place loses the history.',
      },
      {
        key: 'change-management',
        difficulty: 4,
        question:
          'A developer wants to add an index to a 200-million-row production table during business hours, saying "it is only an index". What reflects good change management?',
        correct:
          'Treat it as a planned change: test it on production-like data in staging, use an online index build if the database supports it, agree a time window, and have a rollback plan and approval as policy requires',
        wrong: [
          'Run it now: adding an index cannot affect a running application',
          'Wait until the next outage, so the change causes no extra downtime',
          'Skip staging, since only production has realistic data volumes',
        ],
        why: 'Building an index on a large table can lock it or load the server for a long time, which is an outage for users. Change management exists to make such risks visible and controlled: rehearse, choose a safe method and time, communicate, and know how to back out. Production-like data in staging is how you learn the duration and impact beforehand.',
      },
      {
        key: 'real-time-requirement',
        difficulty: 5,
        question:
          'A stakeholder says the new sales report "must be real-time". What is the best next step for the team?',
        correct:
          'Ask what decisions the report supports and how fresh the data must be for them (for example, whether 15-minute-old data is acceptable), and record the answer as a measurable requirement',
        wrong: [
          'Start building a streaming pipeline, since real-time was requested',
          'Write "real-time" into the specification as stated',
          'Tell the stakeholder real-time is impossible and offer a nightly report',
        ],
        why: '"Real-time" can mean sub-second or "updated during the day", and the cost differs by orders of magnitude. Requirements gathering means uncovering the underlying need and turning vague words into measurable, testable requirements. Building or rejecting without that conversation risks a costly or useless result.',
      },
      {
        key: 'late-misunderstanding',
        difficulty: 5,
        question:
          'During user acceptance testing, the business finds that a discount feature was built on a misunderstanding of the rules. The code is well tested and reviewed. Which practice would most likely have caught this earlier?',
        correct:
          'Agreeing concrete examples of the rules with the business before development, and showing working increments to them early',
        wrong: [
          'More unit tests on the discount code',
          'Stricter code review of the discount code',
          'A longer user acceptance testing phase',
        ],
        why: "Unit tests and code review check the code against the developer's understanding, so they confirm a misunderstanding instead of catching it. Discussing concrete examples with the business up front, and getting feedback on early increments, tests the understanding itself, when fixing it is cheapest.",
      },
    ],
  ),
  ...selectFamily(
    'eng-nfr-select',
    2,
    'Non-functional requirements constrain qualities such as performance, availability, compliance and accessibility.',
    [
      {
        key: 'pick-nfrs',
        question: 'Which of these are non-functional requirements?',
        right: [
          'The service is available 99.9% of each month',
          'Customer data is stored only in data centres inside the EU',
          'The user interface meets WCAG 2.2 level AA',
        ],
        wrong: [
          'Customers can filter their orders by date',
          "Expenses over 1,000 euros need a manager's approval",
        ],
        why: 'Availability, data residency and accessibility describe qualities and constraints of the whole system. Filtering orders and approving expenses are behaviours, so they are functional requirements, even though one of them is a business rule.',
      },
    ],
  ),
];
