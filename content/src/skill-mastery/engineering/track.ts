import type { TrackSource } from '@pracstack/content-model';
import { agileSdlcFamilies } from './agile';
import { ciCdFamilies } from './ci-cd';
import { gitWorkflowFamilies } from './git';
import { secureCodingFamilies } from './security';
import { testingFamilies } from './testing';

/**
 * Software engineering practices: scenario questions built around realistic
 * artifacts (git output, GitHub Actions workflows and run logs, test code, user
 * stories, vulnerable code). C# snippets are compiled and run by the real C#
 * runner; everything else is reviewed by hand. See builders.ts.
 */
export const engineeringTrack: TrackSource = {
  id: 'engineering-practices',
  name: 'Engineering practices',
  category: 'enterprise',
  description:
    'Practical scenarios from day-to-day development: Git workflows, CI/CD with GitHub Actions, testing, secure coding, and agile delivery.',
  topics: [
    {
      id: 'eng-version-control-delivery',
      name: 'Version control and delivery',
      description: 'Collaborate through Git and ship changes safely with automated pipelines.',
      skills: [
        {
          id: 'eng-git-workflow',
          name: 'Git workflow and code review',
          description:
            'Reading `git status` and `git log`, merge versus rebase, resolving conflicts, reverting versus resetting, cherry-pick, pull requests and branching strategies.',
          questions: gitWorkflowFamilies,
        },
        {
          id: 'eng-ci-cd',
          prerequisites: ['eng-git-workflow'],
          name: 'CI/CD with GitHub Actions',
          description:
            'Triggers, jobs and `needs`, least-privilege permissions, secrets and OIDC, environments, artifacts, caching, matrices, and release strategies such as canary and blue-green.',
          questions: ciCdFamilies,
        },
      ],
    },
    {
      id: 'eng-code-quality-security',
      name: 'Testing and secure coding',
      description: 'Write tests that catch real problems, and code that resists common attacks.',
      skills: [
        {
          id: 'eng-testing',
          name: 'Testing practices',
          description:
            'The test pyramid, Arrange-Act-Assert, test doubles, flaky tests, TDD and BDD, coverage limits and regression tests.',
          questions: testingFamilies,
        },
        {
          id: 'eng-secure-coding',
          name: 'Secure coding',
          description:
            'OWASP Top 10 risks in code: injection, XSS, CSRF, broken access control, secrets, vulnerable dependencies, password storage, logging, threat modeling and incident response.',
          questions: secureCodingFamilies,
        },
      ],
    },
    {
      id: 'eng-agile-delivery',
      name: 'Agile delivery and the SDLC',
      description: 'Plan, refine and improve the work as a team.',
      skills: [
        {
          id: 'eng-agile-sdlc',
          name: 'Agile practices and the SDLC',
          description:
            'Scrum events, accountabilities and commitments, Kanban flow, user stories and acceptance criteria, estimation, retrospectives, requirements, decision records and change management.',
          questions: agileSdlcFamilies,
        },
      ],
    },
  ],
};
