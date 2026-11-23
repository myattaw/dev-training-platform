import { describe, expect, it } from 'vitest';
import {
  analyzeJobDescription,
  MAX_ANALYSIS_CHARS,
  MAX_EVIDENCE_CHARS,
  suggestPath,
} from './job-analysis';
import type { ActivityRef } from './roles';
import type { TaxonomyTerm } from './taxonomy';

const skill = (skillId: string): ActivityRef => ({ kind: 'skill', skillId });

/** A small taxonomy with the tricky cases (the real one is tested in content.spec.ts). */
const TAXONOMY: readonly TaxonomyTerm[] = [
  {
    id: 'csharp',
    label: 'C#',
    category: 'language',
    aliases: ['C Sharp'],
    practice: [skill('cs-oop'), { kind: 'challenge', challengeId: 'pangram', language: 'csharp' }],
  },
  { id: 'cpp', label: 'C++', category: 'language', aliases: [], practice: [] },
  { id: 'java', label: 'Java', category: 'language', aliases: [], practice: [] },
  {
    id: 'javascript',
    label: 'JavaScript',
    category: 'language',
    aliases: [],
    variants: ['JS'],
    matchCase: ['JS'],
    practice: [skill('ts-narrowing')],
  },
  {
    id: 'dotnet',
    label: '.NET',
    category: 'framework',
    aliases: ['.NET Core'],
    practice: [skill('cs-async'), skill('cs-oop')],
  },
  {
    id: 'dotnet-framework',
    label: '.NET Framework',
    category: 'framework',
    aliases: [],
    practice: [],
  },
  { id: 'aspnet-core', label: 'ASP.NET Core', category: 'framework', aliases: [], practice: [] },
  { id: 'aspnet-mvc', label: 'ASP.NET MVC', category: 'framework', aliases: [], practice: [] },
  {
    id: 'aspnet',
    label: 'ASP.NET (classic or Core)',
    category: 'framework',
    aliases: [],
    ambiguity: { aliases: ['ASP.NET'], note: 'Classic or Core.' },
    practice: [],
  },
  { id: 'ado-net', label: 'ADO.NET', category: 'framework', aliases: [], practice: [] },
  {
    id: 'react',
    label: 'React',
    category: 'framework',
    aliases: ['ReactJS'],
    matchCase: ['React'],
    practice: [],
  },
  {
    id: 'sql',
    label: 'SQL',
    category: 'database',
    aliases: [],
    practice: [skill('pg-select')],
  },
  {
    id: 'sql-server',
    label: 'SQL Server',
    category: 'database',
    aliases: ['Microsoft SQL Server'],
    variants: ['MSSQL', 'T-SQL'],
    practice: [],
  },
  {
    id: 'postgresql',
    label: 'PostgreSQL',
    category: 'database',
    aliases: [],
    variants: ['Postgres'],
    practice: [skill('pg-select'), skill('pg-joins')],
  },
  {
    id: 'rest',
    label: 'REST',
    category: 'architecture',
    aliases: ['RESTful'],
    matchCase: ['REST'],
    practice: [],
  },
  { id: 'azure', label: 'Azure', category: 'cloud', aliases: [], practice: [] },
  {
    id: 'azure-devops',
    label: 'Azure DevOps',
    category: 'devops',
    aliases: [],
    ambiguity: {
      aliases: ['ADO'],
      context: ['DevOps', 'pipeline', 'board'],
      note: 'Only with DevOps words.',
    },
    matchCase: ['ADO'],
    practice: [],
  },
  {
    id: 'power-automate',
    label: 'Power Automate',
    category: 'business-apps',
    aliases: [],
    variants: ['Microsoft Flow'],
    practice: [],
    note: 'Formerly Microsoft Flow.',
  },
  {
    id: 'dataverse',
    label: 'Dataverse',
    category: 'business-apps',
    aliases: [],
    variants: ['Common Data Service', 'CDS'],
    matchCase: ['CDS'],
    practice: [],
  },
  { id: 'scrum', label: 'Scrum', category: 'practice', aliases: [], practice: [] },
];

const analyze = (text: string) => analyzeJobDescription(text, TAXONOMY);
const ids = (text: string) => analyze(text).terms.map((t) => t.term.id);
const find = (text: string, id: string) => analyze(text).terms.find((t) => t.term.id === id);

describe('analyzeJobDescription: matching', () => {
  it('tells C# from C and C++', () => {
    expect(ids('We use C# daily.')).toEqual(['csharp']);
    expect(ids('Embedded C and C++ experience.')).toEqual(['cpp']);
    expect(ids('Write some C code.')).toEqual([]);
    expect(ids('c# and C Sharp')).toEqual(['csharp']);
    expect(find('c# and C Sharp', 'csharp')?.mentions).toBe(2);
  });

  it('never matches Java inside JavaScript', () => {
    expect(ids('JavaScript developer')).toEqual(['javascript']);
    expect(ids('Java and JavaScript')).toEqual(['java', 'javascript']);
  });

  it('does not find .NET inside ASP.NET or ADO.NET, and keeps .NET Framework distinct', () => {
    expect(ids('ASP.NET Core APIs')).toEqual(['aspnet-core']);
    expect(ids('Maintain ADO.NET data access')).toEqual(['ado-net']);
    expect(ids('Legacy .NET Framework apps and new .NET services.')).toEqual([
      'dotnet-framework',
      'dotnet',
    ]);
    expect(ids('Skills: C#/.NET.')).toEqual(['csharp', 'dotnet']);
  });

  it('maps "ASP.NET" alone to a low-confidence term that mentions both', () => {
    const asp = find('Experience with ASP.NET is required.', 'aspnet');
    expect(asp?.confidence).toBe('low');
    expect(asp?.term.ambiguity?.note).toBe('Classic or Core.');
    expect(ids('ASP.NET MVC and ASP.NET Core')).toEqual(['aspnet-mvc', 'aspnet-core']);
  });

  it('counts SQL Server once, and generic SQL only when mentioned separately', () => {
    expect(ids('Strong SQL Server skills.')).toEqual(['sql-server']);
    expect(ids('Write T-SQL and MSSQL procedures.')).toEqual(['sql-server']);
    expect(ids('MySQL and NoSQL stores.')).toEqual([]);
    expect(ids('SQL Server experience. Good SQL in general.')).toEqual(['sql-server', 'sql']);
    expect(ids('Microsoft SQL Server')).toEqual(['sql-server']);
  });

  it('keeps Azure DevOps and Azure apart, counting Azure only when named on its own', () => {
    expect(ids('CI in Azure DevOps.')).toEqual(['azure-devops']);
    expect(ids('Azure DevOps pipelines deploying to Azure.')).toEqual(['azure-devops', 'azure']);
  });

  it('counts "ADO" as Azure DevOps only with DevOps context, never ADO.NET', () => {
    expect(find('Manage work items on ADO boards.', 'azure-devops')?.confidence).toBe('low');
    expect(ids('ADO pipelines')).toEqual(['azure-devops']);
    expect(ids('Familiar with ADO.')).toEqual([]);
    expect(ids('ADO.NET and DevOps pipelines')).toEqual(['ado-net']);
    // Case matters for the acronym: "ado" is not ADO.
    expect(ids('much ado about pipelines')).toEqual([]);
  });

  it('respects case for words that are also English words', () => {
    expect(ids('Take the rest of the day; react quickly to incidents.')).toEqual([]);
    expect(ids('Build REST and RESTful APIs in React.')).toEqual(['react', 'rest']);
    expect(ids('ReactJS front end')).toEqual(['react']);
  });

  it('accepts Scrum anywhere, including "scrum master"', () => {
    expect(find('Work with the scrum master in a SCRUM team.', 'scrum')?.mentions).toBe(2);
  });

  it('understands historical names with medium confidence and notes', () => {
    const flow = find('Automate with Microsoft Flow.', 'power-automate');
    expect(flow).toMatchObject({ confidence: 'medium', mentions: 1 });
    expect(flow?.term.note).toBe('Formerly Microsoft Flow.');
    expect(find('Common Data Service (CDS)', 'dataverse')).toMatchObject({
      confidence: 'medium',
      mentions: 2,
    });
    expect(ids('Fill in the cds')).toEqual([]);
  });

  it('rates the canonical name high, abbreviations medium, and keeps the best per term', () => {
    expect(find('Postgres', 'postgresql')?.confidence).toBe('medium');
    expect(find('Postgres and PostgreSQL', 'postgresql')?.confidence).toBe('high');
    expect(find('JS', 'javascript')?.confidence).toBe('medium');
  });

  it('groups terms by category in display order, then by first mention', () => {
    const order = ids('Scrum, Azure, PostgreSQL, ASP.NET Core, Java and C#.');
    expect(order).toEqual(['java', 'csharp', 'aspnet-core', 'postgresql', 'azure', 'scrum']);
  });

  it('marks terms covered only when they have practice', () => {
    const terms = analyze('C# and Azure').terms;
    expect(terms.map((t) => [t.term.id, t.covered])).toEqual([
      ['csharp', true],
      ['azure', false],
    ]);
  });
});

describe('analyzeJobDescription: evidence', () => {
  it('quotes the sentence or line where each match occurs, without bullets', () => {
    const text = 'About us.\n- Build services in C#. Use PostgreSQL daily!\n* Azure is a plus';
    const result = analyze(text);
    const evidence = (id: string) =>
      result.terms.find((t) => t.term.id === id)?.evidence.map((e) => e.text);
    expect(evidence('csharp')).toEqual(['Build services in C#.']);
    expect(evidence('postgresql')).toEqual(['Use PostgreSQL daily!']);
    expect(evidence('azure')).toEqual(['Azure is a plus']);
    expect(result.terms.find((t) => t.term.id === 'csharp')?.evidence[0]?.matched).toBe('C#');
  });

  it('shortens long sentences around the match, to at most 160 characters', () => {
    const filler = 'lorem ipsum dolor sit amet '.repeat(20);
    const text = `${filler}we need Kotlin and C# here ${filler}`;
    const [evidence] = find(text, 'csharp')?.evidence ?? [];
    expect(evidence?.text.length).toBeLessThanOrEqual(MAX_EVIDENCE_CHARS);
    expect(evidence?.text).toContain('C#');
    expect(evidence?.text.startsWith('…')).toBe(true);
    expect(evidence?.text.endsWith('…')).toBe(true);
  });

  it('keeps at most three distinct snippets per term', () => {
    const text = ['C# one.', 'C# two.', 'C# two.', 'C# three.', 'C# four.'].join('\n');
    const csharp = find(text, 'csharp');
    expect(csharp?.mentions).toBe(5);
    expect(csharp?.evidence.map((e) => e.text)).toEqual(['C# one.', 'C# two.', 'C# three.']);
  });
});

describe('analyzeJobDescription: experience requirements', () => {
  it('extracts years of experience as information, with the terms in the same sentence', () => {
    const result = analyze(
      '5+ years of C# experience. 3-5 years working with SQL Server. Five years in Scrum teams.',
    );
    expect(result.experience).toEqual([
      { text: '5+ years of C# experience.', minYears: 5, termIds: ['csharp'] },
      {
        text: '3-5 years working with SQL Server.',
        minYears: 3,
        maxYears: 5,
        termIds: ['sql-server'],
      },
      { text: 'Five years in Scrum teams.', minYears: 5, termIds: ['scrum'] },
    ]);
  });

  it('ignores numbers of years that are not requirements', () => {
    expect(
      analyze('We have been in business for 20 years. Offices in 3 cities.').experience,
    ).toEqual([]);
  });
});

describe('analyzeJobDescription: input limits', () => {
  it('reports empty input', () => {
    expect(analyze('')).toMatchObject({ empty: true, terms: [], experience: [] });
    expect(analyze('   \n\t ').empty).toBe(true);
    expect(analyze('Nothing technical here.')).toMatchObject({ empty: false, terms: [] });
  });

  it('truncates input beyond 20,000 characters and says so', () => {
    const text = `${'x '.repeat(MAX_ANALYSIS_CHARS / 2)}C#`;
    const result = analyze(text);
    expect(result).toMatchObject({ truncated: true, inputLength: text.length });
    expect(result.terms).toEqual([]);
    expect(analyze('C#').truncated).toBe(false);
  });

  it('analyses 20,000 characters in under 50 ms', () => {
    const sentence =
      'Senior engineer: 5+ years of C#, .NET and ASP.NET Core; SQL Server, T-SQL and PostgreSQL; REST, Azure DevOps (ADO pipelines), React, JavaScript, Java, C++ and Scrum. ';
    const text = sentence
      .repeat(Math.ceil(MAX_ANALYSIS_CHARS / sentence.length))
      .slice(0, MAX_ANALYSIS_CHARS);
    analyze(text); // warm up: compiles the matchers once per taxonomy
    const times = [0, 1, 2].map(() => {
      const start = performance.now();
      analyze(text);
      return performance.now() - start;
    });
    expect(Math.min(...times)).toBeLessThan(50);
  });
});

describe('suggestPath', () => {
  it('orders steps by category, skips uncovered terms and lists shared practice once', () => {
    const steps = suggestPath(['postgresql', 'azure', 'dotnet', 'csharp', 'sql', 'nope'], TAXONOMY);
    expect(steps.map((s) => [s.term.id, s.activities.map((a) => JSON.stringify(a))])).toEqual([
      [
        'csharp',
        [
          JSON.stringify(skill('cs-oop')),
          JSON.stringify({ kind: 'challenge', challengeId: 'pangram', language: 'csharp' }),
        ],
      ],
      ['dotnet', [JSON.stringify(skill('cs-async'))]],
      ['postgresql', [JSON.stringify(skill('pg-select')), JSON.stringify(skill('pg-joins'))]],
    ]);
  });
});
