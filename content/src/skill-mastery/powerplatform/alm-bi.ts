import type { QuestionSource } from '@pracstack/content-model';
import { plain } from '../helpers';
import { ppChoiceFamily, ppSelectFamily } from './builders';

/*
 * Application lifecycle management and governance, and Power BI modelling and DAX.
 * Scenario reasoning only.
 */

// ---------------------------------------------------------------- ALM and governance

export const almFamilies: readonly QuestionSource[] = [
  ...ppChoiceFamily(
    'pp-alm-environment-types',
    1,
    'Match the environment type to who uses it and how disposable it is.',
    [
      {
        key: 'default-env',
        question:
          'A team plans to run its business-critical order-processing app and flows in the tenant’s default environment, because it already exists. Why is this a poor choice?',
        correct:
          'Every licensed user in the tenant can create resources in the default environment, so it is hard to secure and govern; critical solutions belong in dedicated environments',
        wrong: [
          'The default environment cannot contain Dataverse',
          'Apps in the default environment are deleted after 30 days',
          'The default environment can only run canvas apps, not flows',
        ],
        why: 'The default environment is shared by everyone in the tenant, who can all build there; it is meant for personal productivity, not for business-critical workloads that need controlled access, ALM and dedicated DLP policies. It is not short-lived and supports apps and flows.',
      },
      {
        key: 'developer-env',
        question:
          'Each of four makers needs a personal place to build and experiment with solutions without affecting colleagues. Which environment type is designed for this?',
        correct: 'A developer environment for each maker',
        wrong: [
          'One shared production environment with a solution per maker',
          'The default environment',
          'A trial environment shared by the team for the whole project',
        ],
        why: 'Developer environments are personal environments for building and testing, owned by a single maker. Sharing a production environment risks breaking live work, the default environment is shared by everyone, and trial environments expire, so they do not suit long-lived development.',
      },
      {
        key: 'sandbox',
        difficulty: 2,
        question:
          'Testers want an environment where they can try releases against a copy of production data, and wipe it to start over when needed. Which environment type fits?',
        correct: 'A sandbox environment, which can be copied from production and reset',
        wrong: [
          'A production environment, because only production can hold real data',
          'The default environment',
          'A developer environment owned by the release manager',
        ],
        why: 'Sandbox environments are for non-production work such as testing, and support operations like copy and reset. Production is for live use, the default environment is shared by everyone, and a developer environment is a single maker’s workspace.',
      },
    ],
  ),
  ...ppChoiceFamily(
    'pp-alm-publisher',
    2,
    'The publisher’s prefix becomes part of the schema name of every component created in its solutions.',
    [
      {
        key: 'prefix',
        question:
          'A team creates a solution with its own publisher (prefix `ctso`) and adds a new table named "Project". What is the table’s schema name?',
        correct: '`ctso_Project`',
        wrong: ['`new_Project`', '`Project`', '`cr123_Project`'],
        why: 'New components get the prefix of the publisher of the solution they are created in, so the table becomes `ctso_Project`. Prefixes like `new_` or a generated `cr…_` appear when the default publisher is used. Choosing your own publisher up front matters because a component’s schema name cannot be changed later.',
      },
      {
        key: 'own-publisher',
        question:
          'Why should a team create its own solution publisher instead of building in the default solution with the default publisher?',
        correct:
          'Its prefix identifies the team’s components, avoids name collisions with other solutions, and the publisher owns the components through ALM',
        wrong: [
          'Components with the default publisher cannot be exported',
          'The default publisher is limited to 100 components',
          'Only custom publishers can create managed solutions for production',
        ],
        why: 'A publisher gives components a recognisable prefix and identifies who owns them, which keeps layering and upgrades understandable when several solutions touch the same environment. The other options are not real limits; the point is clean ownership and naming, which cannot be fixed afterwards.',
      },
    ],
  ),
  ...ppChoiceFamily(
    'pp-alm-managed',
    2,
    'Unmanaged solutions are for development; managed solutions are deployed artefacts that can be upgraded and removed cleanly.',
    [
      {
        key: 'prod-managed',
        question: 'Which solution type should be imported into test and production, and why?',
        correct:
          'Managed: its components cannot be edited there directly, and it can be upgraded or uninstalled as a unit',
        wrong: [
          'Unmanaged: it keeps the solution editable in production for quick fixes',
          'Unmanaged: managed solutions cannot contain flows',
          'Either: the solution type only affects the export file size',
        ],
        why: 'Managed solutions are the deployable, locked form of what was built in development. Editing production directly bypasses source control and testing, and leaves unmanaged changes that override later deployments. Managed solutions can contain flows, apps, tables and the rest.',
      },
      {
        key: 'delete-unmanaged',
        difficulty: 3,
        question:
          'An unmanaged solution containing a custom table was imported into production by mistake. An admin deletes that solution. What happens to the table?',
        correct:
          'The table stays: deleting an unmanaged solution only deletes the solution container',
        wrong: [
          'The table and its data are deleted with the solution',
          'The table becomes managed',
          'The table is moved to the default publisher’s prefix',
        ],
        why: 'Components of an unmanaged solution live in the environment itself; the solution is just a grouping. Deleting it leaves every component behind, and each must be removed individually. This is one reason production should receive managed solutions.',
      },
      {
        key: 'uninstall-managed',
        difficulty: 3,
        question:
          'A managed solution that created the table `ctso_Inspection` is uninstalled from production. What happens to the table and its rows?',
        correct: 'The table is removed together with all its rows',
        wrong: [
          'The table is kept and becomes unmanaged',
          'The rows are moved to a recycle bin table',
          'Only the table’s forms and views are removed',
        ],
        why: 'Uninstalling a managed solution removes the components it introduced; for a table, that includes all data in it. Plan uninstalls carefully (and back up data first). Components are not converted to unmanaged on uninstall.',
      },
    ],
  ),
  ...ppChoiceFamily(
    'pp-alm-layering',
    4,
    'Solution layers stack: the active (unmanaged) layer is on top of all managed layers.',
    [
      {
        key: 'active-layer',
        question:
          'Version 1.3 of a managed solution changed the Case main form. After importing it into production, users still see the old form. Someone had once edited that form directly in production. Why, and how is it fixed?',
        correct:
          'The direct edit created an unmanaged active layer on top of the managed layers, which still wins; remove the active customization for the form',
        wrong: [
          'Managed solutions never update existing forms; delete the form and import again',
          'The import must be repeated as an unmanaged solution',
          'Users must clear their browser cache; nothing in the environment is wrong',
        ],
        why: 'Unmanaged customizations form the top (active) layer, so they override every managed layer underneath, including the new version. Viewing the form’s solution layers shows the cause, and removing the active customization lets the managed version show. Importing unmanaged would add more unmanaged changes, the opposite of the fix.',
      },
      {
        key: 'top-managed',
        difficulty: 5,
        question:
          'Two managed solutions change the display name of the same column. Solution A was installed first, then solution B. There are no unmanaged customizations. Which display name is shown?',
        code: plain(`Solution A (installed 1st):  ctso_region display name = "Sales region"
Solution B (installed 2nd):  ctso_region display name = "Territory"`),
        correct: '"Territory", because the most recently installed managed layer is on top',
        wrong: [
          '"Sales region", because the solution that created the column always wins',
          'Both names are shown, separated by a slash',
          'The import of B fails because A owns the column',
        ],
        why: 'For a property like a display name, the top layer wins, and managed layers stack in install order, so B’s value is used. (Some components such as forms and the site map are merged across layers rather than replaced.) Solutions can legitimately layer changes on another solution’s components, so B’s import does not fail.',
      },
    ],
  ),
  ...ppChoiceFamily(
    'pp-alm-config',
    3,
    'Anything that differs between dev, test and production should not be hard-coded in the solution.',
    [
      {
        key: 'env-variable',
        question:
          'A solution-aware flow calls `https://api-dev.contoso.example/orders`. In test and production it must call different URLs, without editing the flow after each deployment. What should you use?',
        correct:
          'An environment variable for the base URL, given its value in each target environment',
        wrong: [
          'A Compose action at the start of the flow holding the URL',
          'Three copies of the flow, one per environment',
          'A trigger condition that checks the environment name',
        ],
        why: 'Environment variables are solution components whose values are set per environment, typically at import or in a deployment settings file, so the same managed solution works everywhere. A Compose value is still hard-coded, and copies of the flow drift apart.',
      },
      {
        key: 'connection-reference',
        question:
          'A solution with three flows uses the SharePoint and Office 365 Outlook connectors. On import into production, how should the flows get production connections?',
        correct:
          'Through connection references in the solution, mapped to production connections during import (or in deployment settings)',
        wrong: [
          'The developer’s connections are exported with the solution and reused',
          'Each flow must be edited after import to pick a connection for every action',
          'Production flows run without connections because the solution is managed',
        ],
        why: 'Connection references decouple flows from specific connections: actions point to the reference, and each environment maps the reference to its own connection. Connections themselves (with credentials) are never exported, and editing managed flows action by action defeats ALM.',
      },
      {
        key: 'current-value',
        difficulty: 5,
        question:
          'An environment variable `ctso_ApiUrl` has a default value pointing to dev and a current value set during testing in the dev environment. The solution is exported as managed and imported into production. What is the risk, and the good practice?',
        correct:
          'If the dev current value is still part of the solution it is imported too, so production calls dev; remove the current value from the solution and set it per environment at import or in deployment settings',
        wrong: [
          'There is no risk: current values are never exported',
          'Production ignores both values until the flow is turned off and on',
          'Default values are discarded on import, so production gets an empty URL',
        ],
        why: 'A value contained in the solution travels with it, so a dev-specific URL can end up in production. Keep environment-specific values out of the solution and provide them per environment, so the import asks for them or a deployment settings file supplies them. The default value is the fallback when no current value exists; it should be safe or deliberately empty.',
      },
    ],
  ),
  ...ppChoiceFamily(
    'pp-alm-pipelines',
    4,
    'Source control holds what developers changed; deployments promote one tested managed artefact.',
    [
      {
        key: 'unpack',
        question:
          'In an Azure DevOps or GitHub pipeline using the Power Platform Build Tools, why is the exported solution unpacked before it is committed?',
        correct:
          'Unpacking splits the solution zip into individual component files, so changes can be reviewed, diffed and merged in source control',
        wrong: [
          'Unpacking converts the solution from unmanaged to managed',
          'Dataverse can only import unpacked solutions',
          'Unpacking removes the connection references so secrets are not committed',
        ],
        why: 'A solution zip is a binary blob to source control. Unpacking (for example with `pac solution unpack` or the Unpack Solution task) produces a folder of files per component, so pull requests show what changed. A pack step rebuilds the zip for import. Unpacking does not change the solution type or its contents.',
      },
      {
        key: 'promote-artifact',
        question:
          'Which release design gives the most confidence that production receives exactly what was tested?',
        correct:
          'Build one managed solution artefact, run solution checker, deploy it to test, and after approval deploy the same artefact to production',
        wrong: [
          'Export a fresh managed solution from dev just before deploying to production',
          'Import the unmanaged solution into production and publish all customizations',
          'Deploy to production first and to test afterwards, so testers see the live version',
        ],
        why: 'Promoting the same artefact through stages means production gets the bits that passed testing; re-exporting from dev later may include untested changes. Unmanaged imports into production create an active layer and lose clean upgrades, and testing after production misses the point of a test stage.',
      },
      {
        key: 'service-principal',
        difficulty: 5,
        question:
          'The pipeline that imports solutions into production currently signs in with a release manager’s personal account. What is the recommended alternative?',
        correct:
          'A service principal (Microsoft Entra app registration) added to each environment as an application user with an appropriate security role',
        wrong: [
          'A shared mailbox account whose password is stored in the pipeline YAML',
          'The tenant’s Global Administrator account, so imports never fail on permissions',
          'Anonymous access, because Build Tools tasks do not need authentication',
        ],
        why: 'A service principal is a non-human identity the pipeline can use with a secret or certificate stored in the pipeline’s secret store; as an application user it gets only the roles it needs in each environment. Personal or shared accounts break when people leave or change passwords and are hard to audit, a password in YAML leaks into source control, and Global Administrator is far more privilege than an import needs.',
      },
    ],
  ),
  ...ppChoiceFamily(
    'pp-alm-dlp',
    3,
    'A DLP policy sorts connectors into Business, Non-business and Blocked; one app or flow cannot combine Business and Non-business connectors.',
    [
      {
        key: 'mixed-groups',
        question:
          'Under this DLP policy, a maker builds a flow that reads new SharePoint list items and copies each item’s attachment to Dropbox. What happens?',
        code: plain(`DLP policy (applies to the Marketing environment)
Business:      SharePoint, Office 365 Outlook, Microsoft Dataverse
Non-business:  Dropbox, RSS
Blocked:       (none)`),
        correct:
          'The flow violates the policy, because it combines a Business and a Non-business connector, so it cannot be turned on',
        wrong: [
          'It works, because neither connector is blocked',
          'It works, but the files are held for admin review',
          'Only the Dropbox action is skipped; the SharePoint part runs',
        ],
        why: 'DLP prevents data from flowing between the Business and Non-business groups: an app or flow may use connectors from one of them, not both. Neither connector being blocked is not enough. The flow is not partially run; it is not allowed to run (existing flows that come to violate a policy are suspended).',
      },
      {
        key: 'new-connector',
        difficulty: 4,
        question:
          'Microsoft adds a new connector to the platform. The tenant’s DLP policy was created with default settings. Which group is the new connector placed in?',
        correct: 'The policy’s default group, which is Non-business unless the admin changed it',
        wrong: [
          'Blocked, until an admin classifies it',
          'Business, because Microsoft publishes it',
          'None: new connectors are not covered by existing policies',
        ],
        why: 'Each policy has a default group for connectors it does not classify explicitly, including ones added later. By default that is Non-business, and admins can make Blocked the default for stricter governance. Being published by Microsoft does not make a connector Business.',
      },
      {
        key: 'multiple-policies',
        difficulty: 5,
        question:
          'Two DLP policies apply to the Finance environment. A flow uses SQL Server and the HTTP connector. Which statement is true?',
        code: plain(`Policy 1 (tenant-wide)
  Business:      SQL Server, HTTP
Policy 2 (Finance environment only)
  Business:      SQL Server
  Non-business:  HTTP`),
        correct:
          'The flow violates Policy 2, so it cannot run: every applicable policy must be satisfied',
        wrong: [
          'Policy 1 wins because tenant-wide policies override environment policies',
          'Policy 2 wins only for flows created after it was published',
          'The flow is allowed because at least one policy permits the combination',
        ],
        why: 'When several DLP policies apply to an environment, an app or flow must comply with all of them, so effectively the most restrictive combination applies. Under Policy 2, SQL Server and HTTP are in different groups, so the flow cannot run, even though Policy 1 alone would allow it.',
      },
    ],
  ),
  ...ppChoiceFamily(
    'pp-alm-governance',
    2,
    'Governance starts with knowing what exists, then setting guardrails.',
    [
      {
        key: 'coe-inventory',
        question:
          'An IT team has no idea how many apps and flows exist across 40 environments, who owns them, or which are abandoned. What is the Center of Excellence (CoE) Starter Kit mainly used for here?',
        correct:
          'Collecting an inventory of environments, apps, flows and makers, with dashboards and processes to clean up and govern them',
        wrong: [
          'Blocking every connector until apps are reviewed',
          'Automatically converting all apps to managed solutions',
          'Replacing DLP policies with a single central policy',
        ],
        why: 'The CoE Starter Kit is a set of components that gathers inventory and usage, shows it in dashboards, and supports processes such as archiving unused apps or reaching out to makers. It complements, not replaces, DLP policies and admin settings, and does not change how apps are packaged.',
      },
      {
        key: 'managed-env',
        difficulty: 3,
        question:
          'Production environments should get extra admin controls, such as limits on how widely canvas apps can be shared and usage insights for admins. Which feature provides these as a group?',
        correct: 'Turning the environments into Managed Environments',
        wrong: [
          'Creating a new business unit for each production environment',
          'Adding a security role called "Managed" to all makers',
          'Exporting all solutions as managed',
        ],
        why: 'Managed Environments are a set of governance capabilities switched on per environment, including sharing limits and admin insights. Business units and security roles control data access inside Dataverse, and "managed solution" is an unrelated packaging term despite the similar name.',
      },
    ],
  ),
];

// ---------------------------------------------------------------- Power BI

const SALES_ROWS = `Sales
Product   Quantity   UnitPrice
A         2          10
B         3          5
C         1          20`;

const COLOR_TOTALS = `Total Sales by Product[Color] (no other filters)
Red     100
Blue     50
Green    30
Total   180`;

export const powerBiFamilies: readonly QuestionSource[] = [
  ...ppChoiceFamily(
    'pp-bi-star-schema',
    1,
    'Facts are events with numbers to aggregate; dimensions describe the who, what, when and where.',
    [
      {
        key: 'identify-fact',
        question: 'Which of these tables is the fact table in a star schema?',
        code: plain(`Customer(CustomerKey, Name, City, Segment)
Product(ProductKey, Name, Category, Color)
Date(Date, Month, Quarter, Year)
OrderLine(OrderDate, CustomerKey, ProductKey, Quantity, Amount)`),
        correct: '`OrderLine`',
        wrong: ['`Customer`', '`Product`', '`Date`'],
        why: '`OrderLine` records business events (lines sold) with numeric columns to aggregate and keys to every dimension. Customer, Product and Date describe those events and are used to filter and group; they are the dimensions.',
      },
      {
        key: 'flat-table',
        difficulty: 2,
        question:
          'A model has one wide table with every order line repeating the customer’s name, city and segment and the product’s name and category. Which is the main benefit of reshaping it into a star schema?',
        correct:
          'Dimensions filter the fact table through one-to-many relationships, which keeps the model smaller, DAX simpler and filtering behaviour predictable',
        wrong: [
          'A star schema lets Power BI skip data refresh',
          'Only star schemas can be published to the Power BI service',
          'Star schemas store every value twice for faster queries',
        ],
        why: 'Separating descriptive attributes into dimensions removes repetition, gives one place to filter from, and is the shape Power BI’s engine and DAX are designed around. Flat tables work but become large and make measures harder. Refresh and publishing do not depend on the schema shape.',
      },
    ],
  ),
  ...ppChoiceFamily(
    'pp-bi-measure-column',
    2,
    'Calculated columns are computed per row at refresh and stored; measures are computed at query time for the current filters.',
    [
      {
        key: 'price-band',
        question:
          'Report users want to slice sales by price band (Budget, Standard, Premium) based on each product’s list price. Should Price band be a calculated column or a measure?',
        correct:
          'A calculated column on Product, because a slicer or axis needs a value stored per row',
        wrong: [
          'A measure, because measures are always faster than columns',
          'A measure, because calculated columns cannot use IF',
          'Either works the same in a slicer',
        ],
        why: 'Slicers, rows and axes group by column values, so a per-product classification belongs in a calculated column (or in Power Query). Measures return one value for the current filter context and cannot be put on a slicer. Columns are evaluated in row context and can use any DAX, including IF or SWITCH.',
      },
      {
        key: 'margin-ratio',
        difficulty: 3,
        question:
          'Each Sales row has a calculated column `Margin % = DIVIDE(Sales[Profit], Sales[Revenue])`. A card showing this column for the year displays 2,350%. What should the card use instead?',
        correct: '`Margin % = DIVIDE(SUM(Sales[Profit]), SUM(Sales[Revenue]))` as a measure',
        wrong: [
          '`AVERAGE(Sales[Margin %])`, so every row counts equally',
          'The same column with the summarization changed to Maximum',
          '`SUMX(Sales, Sales[Margin %])` as a measure',
        ],
        why: 'A ratio must be computed from the aggregated parts: total profit divided by total revenue. Summing per-row percentages gives nonsense like 2,350%, and averaging them treats a 10 € order like a 10,000 € one. SUMX over the column is the same sum, and Maximum shows one row’s value.',
      },
    ],
  ),
  ...ppChoiceFamily(
    'pp-bi-iterators',
    2,
    'SUM adds up one column; SUMX evaluates an expression for each row, then adds the results.',
    [
      {
        key: 'sumx',
        question:
          'With this data and no filters, what does `SUMX(Sales, Sales[Quantity] * Sales[UnitPrice])` return?',
        code: plain(SALES_ROWS),
        correct: '55',
        wrong: ['210', '35', '70'],
        why: 'SUMX multiplies per row (2×10 = 20, 3×5 = 15, 1×20 = 20) and sums them: 55. Multiplying the column totals, `SUM(Quantity) * SUM(UnitPrice)` = 6 × 35, gives 210, a meaningless number; 35 is just the sum of prices and 70 is quantity times the average price.',
      },
      {
        key: 'sum-times-sum',
        difficulty: 3,
        question:
          'A measure `Revenue = SUM(Sales[Quantity]) * SUM(Sales[UnitPrice])` shows the right value for each product row in a table visual, but the total is far too high. Why?',
        code: plain(SALES_ROWS),
        correct:
          'At product level each total covers one row, so the product is right; at the total level it multiplies the grand totals (6 × 35 = 210) instead of adding per-row amounts',
        wrong: [
          'Table visuals always add the rows up, so the total should match; the data must contain duplicates',
          'SUM ignores filters in the total row',
          'Multiplication is not allowed between two aggregations',
        ],
        why: 'A visual’s total is the measure evaluated in the total’s filter context, not the sum of the visible rows. With one row per product, SUM × SUM equals Quantity × Price, but at the total it multiplies the aggregates. `SUMX(Sales, Sales[Quantity] * Sales[UnitPrice])` is correct at every level (55 here).',
      },
    ],
  ),
  ...ppChoiceFamily(
    'pp-bi-relationships',
    3,
    'Filters flow along relationships from the one side to the many side, unless cross-filtering is set to both directions.',
    [
      {
        key: 'direction',
        question:
          'Customer and Product both have single-direction one-to-many relationships to Sales. A user selects one product in a slicer, but the Customer slicer still lists every customer. Why?',
        code: plain(`Customer (1) ──► (*) Sales (*) ◄── (1) Product
cross-filter direction: Single on both relationships`),
        correct:
          'The product filter flows from Product to Sales, but not from Sales on to Customer, because filters only travel from the one side to the many side',
        wrong: [
          'Slicers never filter other slicers',
          'The Product relationship is inactive',
          'Customer needs a relationship to Product for any filter to apply to Sales',
        ],
        why: 'With single direction, Product filters Sales, and Customer filters Sales, but Sales does not filter Customer. Options include a measure-based visual-level filter on the Customer slicer, or bidirectional filtering used sparingly. Slicers do cross-filter each other when the model allows it.',
      },
      {
        key: 'role-playing',
        difficulty: 4,
        question:
          'Sales has OrderDate and ShipDate, both related to Date[Date]; the OrderDate relationship is active and the ShipDate one is inactive. Which measure returns sales by ship date when Date is on the axis?',
        correct:
          "`Sales by Ship Date = CALCULATE([Total Sales], USERELATIONSHIP(Sales[ShipDate], 'Date'[Date]))`",
        wrong: [
          "`Sales by Ship Date = CALCULATE([Total Sales], Sales[ShipDate] = 'Date'[Date])`",
          "`Sales by Ship Date = CALCULATE([Total Sales], RELATED('Date'[Date]))`",
          'Make both relationships active, then use `[Total Sales]`',
        ],
        why: 'Only one relationship between two tables can be active; USERELATIONSHIP activates the inactive one for the duration of a CALCULATE. A comparison between columns of two tables is not a valid boolean filter, RELATED needs row context, and Power BI does not allow two active relationships between the same tables.',
      },
      {
        key: 'both-directions',
        difficulty: 4,
        question:
          'To make slicers narrow each other, a developer sets every relationship in a model with several fact tables to cross-filter in both directions. Which problem is most likely?',
        correct:
          'Ambiguous filter paths and unexpected results or slower queries, because filters can now reach tables through several routes',
        wrong: [
          'Measures stop working because DAX requires single-direction relationships',
          'The model can no longer be refreshed',
          'Row-level security is automatically disabled',
        ],
        why: 'Bidirectional relationships let filters flow from fact tables back to dimensions and onward to other facts, which can create ambiguous paths (Power BI then refuses some relationships or makes them inactive), confusing numbers and performance costs. Prefer single direction and enable both directions selectively, or use CROSSFILTER inside specific measures.',
      },
    ],
  ),
  ...ppChoiceFamily(
    'pp-bi-calculate',
    4,
    'A boolean filter in CALCULATE replaces any existing filter on that column; KEEPFILTERS intersects with it instead.',
    [
      {
        key: 'replace-filter',
        question:
          'A matrix has Product[Color] on rows and this measure as values. What does the Blue row show?',
        code: plain(`${COLOR_TOTALS}

Red Sales = CALCULATE([Total Sales], Product[Color] = "Red")`),
        correct: '100',
        wrong: ['Blank', '50', '180'],
        why: '`Product[Color] = "Red"` replaces the filter on Color that the Blue row sets, so every row (and the total) shows Red sales: 100. That is useful for comparisons, but surprising if you expected an intersection, which would give blank for Blue. 180 would require removing the color filter entirely.',
      },
      {
        key: 'keepfilters',
        difficulty: 5,
        question:
          'The measure is changed as below. What do the Blue row and the Total row show now?',
        code: plain(`${COLOR_TOTALS}

Red Sales = CALCULATE([Total Sales], KEEPFILTERS(Product[Color] = "Red"))`),
        correct: 'Blue: blank. Total: 100',
        wrong: ['Blue: 100. Total: 100', 'Blue: 50. Total: 180', 'Blue: blank. Total: 180'],
        why: 'KEEPFILTERS intersects the new filter with the existing one: on the Blue row, Blue AND Red matches nothing, so the result is blank. The total row has no color filter, so the intersection is just Red: 100. Without KEEPFILTERS the filter would replace the row’s color and Blue would show 100.',
      },
      {
        key: 'percent-of-total',
        question:
          'A matrix shows Product[Category] on rows, and a Date slicer is set to 2026. Which measure returns each category’s share of all products’ sales for the selected period?',
        correct: '`DIVIDE([Total Sales], CALCULATE([Total Sales], REMOVEFILTERS(Product)))`',
        wrong: [
          '`DIVIDE([Total Sales], SUM(Sales[Amount]))`',
          '`DIVIDE([Total Sales], CALCULATE([Total Sales], Product[Category] = "All"))`',
          '`DIVIDE([Total Sales], COUNTROWS(Product))`',
        ],
        why: 'The denominator must be total sales with the product filters removed but the date filter kept: `REMOVEFILTERS(Product)` (or `ALL(Product)`) inside CALCULATE does exactly that. `SUM(Sales[Amount])` is evaluated in the same filter context as the numerator, so every row shows 100%. No category is called "All", so that version divides by blank, and dividing by a product count is not a share of sales.',
      },
    ],
  ),
  ...ppChoiceFamily(
    'pp-bi-context-transition',
    5,
    'In row context, CALCULATE (and any measure reference, which is wrapped in CALCULATE) turns the current row into a filter.',
    [
      {
        key: 'calculated-column',
        question:
          'Two calculated columns are added to the Customer table, which has a one-to-many relationship to Sales. What do they return?',
        code: plain(`Customer[Sales A] = SUM(Sales[Amount])
Customer[Sales B] = CALCULATE(SUM(Sales[Amount]))`),
        correct:
          'Sales A shows the total of all sales on every row; Sales B shows each customer’s own sales',
        wrong: [
          'Both show each customer’s own sales',
          'Both show the total of all sales on every row',
          'Sales A shows each customer’s sales; Sales B shows the total',
        ],
        why: 'A calculated column has a row context but no filter context, and a row context does not filter other tables, so `SUM(Sales[Amount])` sums every sale. CALCULATE performs context transition: the current Customer row becomes a filter, which flows to Sales through the relationship. Referencing a measure such as `[Total Sales]` would do the same, because measure references are implicitly wrapped in CALCULATE.',
      },
      {
        key: 'filter-customers',
        question:
          'Both measures should count customers with more than 1,000 in sales. With a year slicer set, measure A works, but measure B returns either 0 or the number of all customers. Why?',
        code: plain(`[Total Sales] = SUM(Sales[Amount])

Big customers A = COUNTROWS(FILTER(Customer, [Total Sales] > 1000))
Big customers B = COUNTROWS(FILTER(Customer, SUM(Sales[Amount]) > 1000))`),
        correct:
          'In B, `SUM` is not wrapped in CALCULATE, so there is no context transition: every customer row sees the same overall total',
        wrong: [
          'FILTER cannot iterate a dimension table, so B ignores the condition',
          'B ignores the year slicer because SUM always ignores filters',
          'A only works because measures are cached between rows',
        ],
        why: 'FILTER creates a row context for each customer. A measure reference triggers context transition, so `[Total Sales]` is that customer’s sales. In B, `SUM(Sales[Amount])` sees only the outer filter context (the year), the same value for every row, so the condition is true for all customers or none. The year filter does apply in both measures.',
      },
    ],
  ),
  ...ppChoiceFamily(
    'pp-bi-time-intelligence',
    4,
    'Time intelligence functions need a proper date table: one row per day, no gaps, marked as the date table.',
    [
      {
        key: 'gaps',
        question:
          "The model’s Date table was built with `DISTINCT(Sales[OrderDate])`, so it only contains days with sales. `CALCULATE([Total Sales], SAMEPERIODLASTYEAR('Date'[Date]))` returns wrong values. What fixes it?",
        correct:
          'A date table with every day of each year covered (for example built with `CALENDAR` or in Power Query), marked as the date table and related to Sales',
        wrong: [
          'Replace SAMEPERIODLASTYEAR with DATEADD, which tolerates gaps',
          'Set the relationship between Date and Sales to both directions',
          'Sort the Date table by date descending',
        ],
        why: 'Time intelligence functions shift and build date ranges inside the date column, so they need contiguous dates covering whole years. A date table derived from sales misses days, and shifted periods silently lose them. DATEADD has the same requirement, and relationship direction or sort order does not create missing dates.',
      },
      {
        key: 'fiscal-ytd',
        difficulty: 3,
        question:
          'The company’s fiscal year ends on 30 June. Which measure returns fiscal year-to-date sales?',
        correct: '`TOTALYTD([Total Sales], \'Date\'[Date], "6-30")`',
        wrong: [
          "`TOTALYTD([Total Sales], 'Date'[Date])`",
          '`TOTALYTD([Total Sales], \'Date\'[Date], "7-1")`',
          "`TOTALYTD([Total Sales], 'Date'[Date] >= DATE(2026, 7, 1))`",
        ],
        why: 'TOTALYTD takes an optional year-end date as its last argument, here "6-30", so the year to date restarts each 1 July. Without it, the calendar year (ending 31 December) is used. The year-end argument is the last day of the year, not the first day of the next one, and the second argument must be the date column itself, not a condition.',
      },
    ],
  ),
  ...ppChoiceFamily(
    'pp-bi-storage-refresh',
    2,
    'Import copies data into the model; DirectQuery sends queries to the source every time a visual needs data.',
    [
      {
        key: 'import-vs-dq',
        difficulty: 1,
        question:
          'A report over a 2 GB sales database must be fast, and data that is up to a day old is acceptable. Which storage mode fits best?',
        correct: 'Import, with a scheduled refresh each night',
        wrong: [
          'DirectQuery, because it is always faster than Import',
          'DirectQuery, because Import cannot be refreshed automatically',
          'Import with no refresh, because the data is loaded once at publish',
        ],
        why: 'Import stores a compressed copy in the model, which gives the fastest visuals, and scheduled refresh keeps it current enough for daily data. DirectQuery is for data that must be near real time or is too large to import, at the cost of query speed that depends on the source. Without refresh an imported model never changes.',
      },
      {
        key: 'gateway',
        difficulty: 3,
        question:
          'A report published to the Power BI service imports data from a SQL Server in the company’s own data centre. Scheduled refresh fails because the service cannot reach the server. What is needed?',
        correct:
          'An on-premises data gateway that can reach the SQL Server, configured for the data source',
        wrong: [
          'Switching the report to DirectQuery, which does not need connectivity',
          'Republishing the report from Power BI Desktop every day',
          'Adding the report viewers to the SQL Server’s logins',
        ],
        why: 'The Power BI service runs in the cloud, so it reaches on-premises sources through an on-premises data gateway. DirectQuery to that server also needs the gateway, republishing by hand is not refresh, and viewer logins do not let the service connect.',
      },
    ],
  ),
  ...ppChoiceFamily(
    'pp-bi-rls',
    4,
    'Row-level security filters a table with a DAX rule per role, and the filter then flows along relationships like any other filter.',
    [
      {
        key: 'workspace-roles',
        question:
          'Row-level security works when "View as" is used in Power BI Desktop. In the service, regional managers who are Members of the workspace see all regions. Why?',
        correct:
          'RLS restricts only users who view content (for example workspace Viewers or app users); workspace Admins, Members and Contributors can edit the semantic model and are not restricted',
        wrong: [
          'RLS only works in Power BI Desktop',
          'The roles must be recreated in the service after every publish',
          'RLS rules are ignored when the model uses Import mode',
        ],
        why: 'People who can edit the semantic model bypass RLS. Managers who should be filtered should get Viewer access or use an app, with their accounts (or groups) assigned to the role on the semantic model. RLS applies to Import and DirectQuery models, and roles defined in Desktop are published with the model.',
      },
      {
        key: 'dynamic-rls',
        difficulty: 5,
        question:
          'A role has this rule on the Region table. Region and Customer each have a single-direction one-to-many relationship to Sales. A regional manager opens a table visual listing only Customer[Name] (no measure). What does she see?',
        code: plain(`Role: Regional manager
Table: Region
Rule:  [ManagerEmail] = USERPRINCIPALNAME()

Region (1) ──► (*) Sales (*) ◄── (1) Customer`),
        correct:
          'All customers, because the role filters Region and Sales, but the filter does not flow from Sales back to Customer',
        wrong: [
          'Only customers with sales in her region',
          'No customers, because Customer has no RLS rule',
          'An error, because USERPRINCIPALNAME cannot be used in roles',
        ],
        why: 'The rule filters Region to her rows and the filter flows to Sales, so her sales figures are restricted. Customer is on the one side of its relationship and is not filtered by Sales, so the list of names is complete. If customer names are sensitive, secure Customer too (its own rule, or a relationship that applies the security filter in both directions).',
      },
    ],
  ),
];

// ---------------------------------------------------------------- multi-select checks

export const powerBiSelectFamilies: readonly QuestionSource[] = ppSelectFamily(
  'pp-bi-date-table',
  4,
  'Think about what a function that shifts dates needs from the date column.',
  [
    {
      key: 'requirements',
      question:
        'Which of these are requirements or strong recommendations for a date table used with DAX time intelligence?',
      options: [
        ['One row per day, with no missing days in the range', true],
        ['It covers complete years for the periods in the data', true],
        ['It is marked as the date table, with its date column unique', true],
        ['It contains only the dates on which there were sales', false],
        ['Its relationship to the fact table uses both cross-filter directions', false],
      ],
      why: 'Time intelligence works on a contiguous date column with unique values, ideally whole years, and marking the table tells Power BI which column to use. A table of sales dates has gaps, which shifted periods silently lose, and bidirectional filtering is unrelated to time intelligence (and has costs of its own).',
    },
  ],
);
