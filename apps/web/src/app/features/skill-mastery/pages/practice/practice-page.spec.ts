import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { AnswerResponse, NextQuestionResponse } from '@pracstack/api-contracts';
import { ApiClientError } from '../../../../core/api/api-client';
import { provideTestContent } from '../../../../../testing/content-fixtures';
import { FakeApiClient, provideFakeApi } from '../../../../../testing/fake-api';
import { PracticePage } from './practice-page';

const TOKEN = '11111111-1111-1111-1111-111111111111';

const served = (overrides: Partial<NextQuestionResponse> = {}): NextQuestionResponse => ({
  token: TOKEN,
  question: {
    id: 'q1',
    version: 1,
    skillId: 'primitives',
    familyId: 'q1',
    difficulty: 2,
    format: 'multiple-choice',
    prompt: [{ kind: 'paragraph', text: 'Which type is `5`?' }],
    options: [
      { id: 'a', text: '`number`' },
      { id: 'b', text: '`string`' },
    ],
    selection: 'single',
    hintCount: 2,
  },
  skill: { skillId: 'primitives', score: 20, tier: 2, mastered: false, attempts: 3 },
  hintsRevealed: [],
  expiresAt: '2026-11-21T13:00:00Z',
  selection: { reason: 'new' },
  ...overrides,
});

const answered: AnswerResponse = {
  result: 'correct',
  correctAnswer: { format: 'multiple-choice', correct: ['a'] },
  explanation: [{ kind: 'paragraph', text: 'Numbers are `number`.' }],
  scoreBefore: 20,
  scoreAfter: 29,
  xpAwarded: 20,
  masteredNow: false,
  skill: { skillId: 'primitives', score: 29, tier: 2, mastered: false, attempts: 4 },
  tierBefore: 2,
  tierAfter: 2,
  repeat: false,
  cappedByTier: false,
};

async function setup(api: FakeApiClient) {
  await TestBed.configureTestingModule({
    imports: [PracticePage],
    providers: [provideRouter([]), provideTestContent(), provideFakeApi(api)],
  }).compileComponents();
  const fixture = TestBed.createComponent(PracticePage);
  fixture.componentRef.setInput('technologyId', 'typescript');
  fixture.componentRef.setInput('skillId', 'primitives');
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const button = (text: string) =>
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
      b.textContent?.includes(text),
    );
  const settle = async () => {
    // Let pending promises resolve, then render.
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
  };
  return { fixture, el, button, settle };
}

describe('PracticePage', () => {
  it('shows the served question, with the skill name from the catalog', async () => {
    const api = new FakeApiClient().on('POST /skill-mastery/practice/next', () => served());
    const { el } = await setup(api);
    expect(el.querySelector('h1')?.textContent).toContain('Primitive types');
    expect(el.textContent).toContain('Which type is');
    // Difficulty is a named tier, separate from mastery; no "Level X of 5".
    expect(el.querySelector('.question-meta')?.textContent).toContain('Elementary');
    expect(el.querySelector('.progress-bar')?.textContent).toContain('Elementary');
    expect(el.querySelector('.progress-bar')?.textContent).toContain('tier 2 of 5');
    expect(el.textContent).not.toContain('Level 2 of 5');
    expect(el.querySelectorAll('input[type="radio"]')).toHaveLength(2);
    expect(api.calls[1]).toEqual({
      route: 'POST /skill-mastery/practice/next',
      input: { skillId: 'primitives' },
    });
  });

  it('submits the selected answer and shows the server’s verdict', async () => {
    const api = new FakeApiClient()
      .on('POST /skill-mastery/practice/next', () => served())
      .on('POST /skill-mastery/practice/answer', () => answered);
    const { el, button, settle } = await setup(api);

    expect(button('Submit answer')?.disabled).toBe(true);
    el.querySelector<HTMLInputElement>('input[type="radio"]')!.click();
    await settle();
    expect(button('Submit answer')?.disabled).toBe(false);

    button('Submit answer')!.click();
    await settle();
    expect(api.calls.find((c) => c.route.endsWith('/answer'))).toEqual({
      route: 'POST /skill-mastery/practice/answer',
      input: { token: TOKEN, answer: { format: 'multiple-choice', selected: ['a'] } },
    });
    expect(el.querySelector('.feedback-title')?.textContent).toContain('Correct');
    expect(el.textContent).toContain('Mastery 20 → 29');
    expect(button('Next question')).toBeDefined();
    expect(
      [...el.querySelectorAll('button')].filter((b) => b.textContent?.includes('Next question')),
    ).toHaveLength(1);
    expect(el.textContent).toContain('Numbers are');
    expect(el.querySelector('.option.correct')).not.toBeNull();
    expect(button('Submit answer')).toBeUndefined();
    expect(button('Next question')).toBeDefined();
    // XP in the header is refreshed after answering.
    expect(api.calls.at(-1)?.route).toBe('GET /me');
  });

  it('announces a tier change and counts the session streak', async () => {
    const api = new FakeApiClient()
      .on('POST /skill-mastery/practice/next', () => served())
      .on('POST /skill-mastery/practice/answer', () => ({
        ...answered,
        tierAfter: 3,
        skill: { ...answered.skill, tier: 3 },
      }));
    const { el, button, settle } = await setup(api);
    el.querySelector<HTMLInputElement>('input[type="radio"]')!.click();
    await settle();
    button('Submit answer')!.click();
    await settle();
    expect(el.querySelector('.score-change')?.textContent).toContain('Up to Intermediate');
    expect(el.querySelector('.progress-bar')?.textContent).toContain('Intermediate');
    const streak = [...el.querySelectorAll('.session div')].find((d) =>
      d.textContent?.includes('Streak'),
    );
    expect(streak?.querySelector('dd')?.textContent?.trim()).toBe('1');
  });

  it('explains why a question was served when it is a review or a repeat', async () => {
    const api = new FakeApiClient().on('POST /skill-mastery/practice/next', () =>
      served({
        selection: {
          reason: 'repeat',
          note: "You have answered every question in this skill. Repeats earn reduced credit and don't count toward mastery.",
        },
      }),
    );
    const { el } = await setup(api);
    expect(el.querySelector('.question-meta')?.textContent).toContain('Repeat');
    expect(el.querySelector('.selection-note')?.textContent).toContain(
      'Repeats earn reduced credit',
    );
  });

  it('explains difficulty and mastery on request', async () => {
    const api = new FakeApiClient().on('POST /skill-mastery/practice/next', () => served());
    const { el, settle } = await setup(api);
    expect(el.querySelector('#difficulty-explainer')).toBeNull();
    el.querySelector<HTMLButtonElement>('button[aria-label="How difficulty works"]')!.click();
    await settle();
    expect(el.querySelector('#difficulty-explainer')?.textContent).toContain('two misses in a row');
  });

  it('reveals hints from the server and counts down', async () => {
    let hints = 0;
    const api = new FakeApiClient()
      .on('POST /skill-mastery/practice/next', () => served())
      .on('POST /skill-mastery/practice/hint', () => ({
        hint: `Hint ${++hints}`,
        index: hints - 1,
        remaining: 2 - hints,
      }));
    const { el, button, settle } = await setup(api);

    button('Hint (2 left)')!.click();
    await settle();
    expect(el.querySelector('.hints')?.textContent).toContain('Hint 1');
    button('Hint (1 left)')!.click();
    await settle();
    expect(button('No more hints')?.disabled).toBe(true);
  });

  it('resumes hints already revealed for an unanswered question', async () => {
    const api = new FakeApiClient().on('POST /skill-mastery/practice/next', () =>
      served({ hintsRevealed: ['Earlier hint'] }),
    );
    const { el, button } = await setup(api);
    expect(el.querySelector('.hints')?.textContent).toContain('Earlier hint');
    expect(button('Hint (1 left)')).toBeDefined();
  });

  it('shows an error with a retry when no question can be loaded', async () => {
    const api = new FakeApiClient();
    const { el, button, settle } = await setup(api);
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('could not be reached');

    api.on('POST /skill-mastery/practice/next', () => served());
    button('Try again')!.click();
    await settle();
    expect(el.textContent).toContain('Which type is');
  });

  it('keeps the question when an answer fails, and offers a new one if it expired', async () => {
    const api = new FakeApiClient()
      .on('POST /skill-mastery/practice/next', () => served())
      .on('POST /skill-mastery/practice/answer', () => {
        throw new ApiClientError('token-expired', 'This question has expired.');
      });
    const { el, button, settle } = await setup(api);
    el.querySelector<HTMLInputElement>('input[type="radio"]')!.click();
    await settle();
    button('Submit answer')!.click();
    await settle();

    expect(el.textContent).toContain('Which type is');
    expect(el.querySelector('.action-error')?.textContent).toContain('This question has expired.');
    expect(button('Load a new question')).toBeDefined();
  });
});
