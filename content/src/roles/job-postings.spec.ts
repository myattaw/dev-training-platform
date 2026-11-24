import { analyzeJobDescription, type JobAnalysis } from '@pracstack/content-model';
import { describe, expect, it } from 'vitest';
import {
  ASSOCIATE_ENGINEER_POSTING,
  AWS_CLOUD_DEVELOPER_POSTING,
  ENTERPRISE_DOTNET_POSTING,
  JAVA_BACKEND_POSTING,
  POWER_PLATFORM_POSTING,
  SQL_SERVER_DEVELOPER_POSTING,
} from './fixtures/job-postings';
import { TAXONOMY } from './taxonomy';

/*
 * The analyzer on realistic postings with the real taxonomy. Several postings
 * of different kinds, so the rules are not tuned to a single one.
 */

const analyze = (text: string) => analyzeJobDescription(text, TAXONOMY);
const term = (a: JobAnalysis, id: string) => a.terms.find((t) => t.term.id === id);
const levelOf = (a: JobAnalysis, id: string) => term(a, id)?.requirement;

describe('enterprise C#/.NET posting (regression fixture)', () => {
  const a = analyze(ENTERPRISE_DOTNET_POSTING);

  it('finds the explicitly required technologies as required', () => {
    for (const id of [
      'csharp',
      'dotnet-framework',
      'aspnet-mvc',
      'aspnet',
      'sql-server',
      'ssis',
      'ssrs',
      'sql',
    ])
      expect(levelOf(a, id), id).toBe('required');
  });

  it('keeps preferred qualifications preferred, not mandatory', () => {
    for (const id of ['microservices', 'apis', 'bdd', 'tdd'])
      expect(levelOf(a, id), id).toBe('preferred');
  });

  it('recognizes testing, debugging, documentation, maintenance and design as responsibilities', () => {
    for (const id of [
      'software-testing',
      'debugging',
      'technical-documentation',
      'application-maintenance',
      'requirements-gathering',
      'software-design',
      'design-walkthroughs',
    ])
      expect(levelOf(a, id), id).toBe('responsibility');
  });

  it('detects the other competencies: agile, security, CI/CD, OS facilities, files, structured programming, SDLC, systems analysis', () => {
    for (const id of [
      'agile',
      'security',
      'cicd',
      'os-fundamentals',
      'file-organization',
      'structured-programming',
      'sdlc',
      'systems-analysis',
    ])
      expect(levelOf(a, id), id).toBe('required');
  });

  it('treats Azure and AWS as examples of cloud familiarity, not two mandatory platforms', () => {
    expect(levelOf(a, 'cloud')).toBe('familiarity');
    expect(levelOf(a, 'azure')).toBe('alternative');
    expect(levelOf(a, 'aws')).toBe('alternative');
    expect(a.alternatives).toContainEqual(
      expect.objectContaining({
        kind: 'examples',
        termIds: ['azure', 'aws'],
        parentTermId: 'cloud',
      }),
    );
  });

  it('treats ADO and GitHub as examples of source control', () => {
    expect(levelOf(a, 'git')).toBe('required');
    expect(levelOf(a, 'azure-devops')).toBe('alternative');
  });

  it('keeps legacy and modern .NET distinct, and MVC and ASP.NET ambiguous', () => {
    expect(term(a, 'dotnet')).toBeUndefined();
    expect(term(a, 'aspnet-core')).toBeUndefined();
    expect(term(a, 'dotnet-framework')).toMatchObject({ coverage: 'related', ambiguous: false });
    expect(term(a, 'aspnet-mvc')).toMatchObject({ ambiguous: true, coverage: 'related' });
    expect(term(a, 'aspnet')).toMatchObject({ ambiguous: true, coverage: 'partial' });
  });

  it('reflects SSIS and SSRS as knowledge practice only, with what is not covered', () => {
    for (const id of ['ssis', 'ssrs']) {
      expect(term(a, id)?.coverage, id).toBe('conceptual');
      expect(term(a, id)?.term.gap?.notCovered, id).toMatch(/not practiced/);
    }
  });

  it('separates degrees, eligibility and communication from technical requirements', () => {
    expect(a.qualifications.map((q) => q.kind).sort()).toEqual([
      'communication',
      'education',
      'eligibility',
    ]);
    expect(a.experience).toEqual([expect.objectContaining({ minYears: 3 })]);
  });
});

describe('other postings', () => {
  it('associate engineer: one of several languages and frameworks; familiarity and nice-to-haves', () => {
    const a = analyze(ASSOCIATE_ENGINEER_POSTING);
    expect(a.alternatives.map((g) => [g.kind, g.level, g.termIds])).toEqual([
      ['or', 'required', ['java', 'python', 'javascript', 'typescript']],
      ['or', 'preferred', ['spring', 'angular', 'nodejs']],
    ]);
    expect(levelOf(a, 'git')).toBe('familiarity');
    expect(levelOf(a, 'unit-testing')).toBe('familiarity');
    expect(levelOf(a, 'docker')).toBe('familiarity');
    expect(levelOf(a, 'oop')).toBe('required');
  });

  it('Java backend: requirements, preferred cloud, and responsibilities', () => {
    const a = analyze(JAVA_BACKEND_POSTING);
    for (const id of ['java', 'sql', 'postgresql', 'docker', 'kubernetes', 'cicd'])
      expect(levelOf(a, id), id).toBe('required');
    for (const id of [
      'rest',
      'microservices',
      'integration-testing',
      'code-review',
      'troubleshooting',
      'production-support',
    ])
      expect(levelOf(a, id), id).toBe('responsibility');
    expect(levelOf(a, 'aws')).toBe('preferred');
    expect(term(a, 'csharp')).toBeUndefined();
  });

  it('Power Platform: the platform and Dynamics are required; C# or JavaScript is a preferred alternative', () => {
    const a = analyze(POWER_PLATFORM_POSTING);
    expect(levelOf(a, 'power-platform')).toBe('required');
    expect(levelOf(a, 'dynamics-365')).toBe('required');
    expect(levelOf(a, 'alm')).toBe('required');
    expect(levelOf(a, 'power-apps')).toBe('responsibility');
    expect(a.alternatives).toContainEqual(
      expect.objectContaining({ termIds: ['csharp', 'javascript'], level: 'preferred' }),
    );
  });

  it('SQL Server developer: T-SQL, SSIS and SSRS required; Power BI familiarity; ADF a plus', () => {
    const a = analyze(SQL_SERVER_DEVELOPER_POSTING);
    for (const id of ['sql-server', 'ssis', 'ssrs', 'data-modeling'])
      expect(levelOf(a, id), id).toBe('required');
    for (const id of [
      'stored-procedures',
      'data-integration',
      'report-development',
      'troubleshooting',
    ])
      expect(levelOf(a, id), id).toBe('responsibility');
    expect(levelOf(a, 'power-bi')).toBe('familiarity');
    expect(levelOf(a, 'azure-data-factory')).toBe('preferred');
  });

  it('AWS cloud developer: TypeScript or Python; monitoring is a responsibility and a gap', () => {
    const a = analyze(AWS_CLOUD_DEVELOPER_POSTING);
    expect(levelOf(a, 'aws')).toBe('required');
    expect(a.alternatives).toContainEqual(
      expect.objectContaining({ kind: 'or', termIds: ['typescript', 'python'], level: 'required' }),
    );
    expect(term(a, 'monitoring')).toMatchObject({
      requirement: 'responsibility',
      coverage: 'none',
    });
    expect(levelOf(a, 'docker')).toBe('preferred');
  });
});

describe('false positives', () => {
  it('does not read ordinary words as technologies', () => {
    const a = analyze(
      `About us
We react quickly to customer needs and rest easy knowing our node in the network is secure.
Our spring sale runs every year. The office has a gym and free lunch.`,
    );
    expect(a.terms.map((t) => t.term.id)).toEqual([]);
  });

  it('does not count MVC or ADO without the context that makes them .NET or Azure DevOps', () => {
    const a = analyze(
      'Experience with MVC design patterns in any language. ADO is our internal acronym.',
    );
    expect(term(a, 'aspnet-mvc')).toBeUndefined();
    expect(term(a, 'azure-devops')).toBeUndefined();
  });
});
