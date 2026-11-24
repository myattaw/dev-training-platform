import type { TrackSource } from '@pracstack/content-model';
import { almFamilies, powerBiFamilies, powerBiSelectFamilies } from './alm-bi';
import { powerAppsFamilies, powerAutomateFamilies } from './apps-automate';
import { dataverseFamilies, dataverseSelectFamilies, dynamicsFamilies } from './dataverse-d365';

/**
 * Microsoft Power Platform. PracStack has no connection to a Microsoft tenant, so
 * every question is a scenario-based assessment: the learner reasons about Power Fx
 * formulas, flow definitions, expressions, Dataverse designs, security role
 * matrices and DAX shown as text. Nothing is executed; answer keys are reviewed by hand.
 */
export const powerPlatformTrack: TrackSource = {
  id: 'power-platform',
  name: 'Power Platform',
  category: 'enterprise',
  description:
    'Scenario-based assessments for Microsoft Power Platform: Power Apps and Power Fx, Power Automate cloud flows, Dataverse data modeling and security, ALM and governance, Dynamics 365 extensibility and Power BI modeling with DAX. You reason about formulas, flow definitions, designs and DAX shown in each question; nothing runs in a Microsoft environment. Hands-on labs would need a Microsoft tenant, which PracStack does not provide.',
  topics: [
    {
      id: 'pp-apps-automation',
      name: 'Apps and automation',
      description:
        'Build canvas and model-driven apps with Power Fx, and automate processes with cloud flows.',
      skills: [
        {
          id: 'pp-power-apps',
          name: 'Power Apps and Power Fx',
          description:
            'Canvas versus model-driven apps, variables and collections, forms and `Patch`, delegation, error handling with `IfError`, performance and components.',
          questions: powerAppsFamilies,
        },
        {
          id: 'pp-power-automate',
          name: 'Power Automate cloud flows',
          description:
            'Trigger types and trigger conditions, expressions, approvals, loops and concurrency, Try/Catch/Finally with run-after, retries, idempotency and child flows.',
          questions: powerAutomateFamilies,
        },
      ],
    },
    {
      id: 'pp-data-platform',
      name: 'Dataverse and Dynamics 365',
      description: 'Model data in Dataverse, secure it, and extend Dynamics 365 apps built on it.',
      skills: [
        {
          id: 'pp-dataverse',
          prerequisites: ['pp-power-apps'],
          name: 'Dataverse data modeling and security',
          description:
            'Columns, choices, relationships and cascade behavior, where business logic runs, security roles and access levels, teams, hierarchy and column security, environment roles and auditing.',
          questions: [...dataverseFamilies, ...dataverseSelectFamilies],
        },
        {
          id: 'pp-dynamics-365',
          prerequisites: ['pp-dataverse'],
          name: 'Dynamics 365 customization and extensibility',
          description:
            'Model-driven forms and business process flows, Sales and Customer Service concepts, plug-in stages and modes versus Power Automate, the Dataverse Web API and integration patterns.',
          questions: dynamicsFamilies,
        },
      ],
    },
    {
      id: 'pp-alm',
      name: 'ALM and governance',
      description:
        'Move solutions safely from development to production and keep the platform governed.',
      skills: [
        {
          id: 'pp-alm-governance',
          prerequisites: ['pp-power-automate', 'pp-dataverse'],
          name: 'ALM and governance',
          description:
            'Environment strategy, publishers, managed and unmanaged solutions and layering, environment variables and connection references, pipelines, DLP policies and the Center of Excellence.',
          questions: almFamilies,
        },
      ],
    },
    {
      id: 'pp-analytics',
      name: 'Power BI',
      description: 'Model data and write DAX that gives the right numbers.',
      skills: [
        {
          id: 'pp-power-bi',
          name: 'Power BI modeling and DAX',
          description:
            'Star schemas, relationships and filter direction, measures versus calculated columns, SUMX, CALCULATE and context transition, time intelligence, storage modes and row-level security.',
          questions: [...powerBiFamilies, ...powerBiSelectFamilies],
        },
      ],
    },
  ],
};
