import { computed } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { RunOutcome } from '../runner/runner.models';
import { ChallengeProgressService } from './challenge-progress.service';

const passed: RunOutcome = { status: 'passed', results: [], logs: [], durationMs: 3 };
const failed: RunOutcome = {
  status: 'failed',
  logs: [],
  durationMs: 3,
  results: [
    { description: 'a', passed: true, input: '', expected: '' },
    { description: 'b', passed: false, input: '', expected: '' },
  ],
};

describe('ChallengeProgressService', () => {
  let service: ChallengeProgressService;

  beforeEach(() => {
    localStorage.clear();
    service = TestBed.inject(ChallengeProgressService);
  });

  it('starts every challenge as not started', () => {
    expect(service.record('pangram')).toMatchObject({
      status: 'not-started',
      hasDraft: false,
      lastRun: undefined,
    });
  });

  it('lists every practice draft for import, including legacy ones, but not timed-session drafts', () => {
    service.saveDraft('pangram', 'typescript', 'ts code', 'starter');
    service.saveDraft('lru-cache', 'java', 'java code', 'starter');
    service.saveDraft('pangram', 'typescript', 'timed code', 'starter', 'session-1');
    localStorage.setItem('typexercise:solution:reverse-string', 'old code');
    expect(service.listDrafts().map((d) => [d.challengeId, d.language, d.code])).toEqual([
      ['lru-cache', 'java', 'java code'],
      ['pangram', 'typescript', 'ts code'],
      ['reverse-string', 'typescript', 'old code'],
    ]);
  });

  it('keeps timed-session drafts apart from practice drafts', () => {
    service.saveDraft('pangram', 'typescript', 'practice', 'starter');
    service.saveDraft('pangram', 'typescript', 'timed', 'starter', 'session-1');
    expect(service.loadDraft('pangram', 'typescript')).toBe('practice');
    expect(service.loadDraft('pangram', 'typescript', 'session-1')).toBe('timed');
    expect(service.loadDraft('pangram', 'typescript', 'session-2')).toBeNull();
  });

  it('saves and loads drafts, and marks the challenge in progress', () => {
    service.saveDraft('pangram', 'typescript', 'my code', 'starter');
    expect(service.loadDraft('pangram', 'typescript')).toBe('my code');
    expect(service.record('pangram').status).toBe('in-progress');
  });

  it('does not store unmodified starter code, and removes a draft reset to the starter', () => {
    service.saveDraft('pangram', 'typescript', 'starter', 'starter');
    expect(service.loadDraft('pangram', 'typescript')).toBeNull();

    service.saveDraft('pangram', 'typescript', 'edited', 'starter');
    service.saveDraft('pangram', 'typescript', 'starter', 'starter');
    expect(service.loadDraft('pangram', 'typescript')).toBeNull();
    expect(service.record('pangram').status).toBe('not-started');
  });

  it('records runs and derives status from the latest one', () => {
    service.recordRun('pangram', 'typescript', failed, 2);
    expect(service.record('pangram')).toMatchObject({
      status: 'in-progress',
      lastRun: { status: 'failed', passed: 1, total: 2 },
    });

    service.recordRun('pangram', 'typescript', passed, 2);
    expect(service.record('pangram').status).toBe('visible-passed');
  });

  it('re-evaluates computed signals after writes', () => {
    const status = computed(() => service.record('reverse-string').status);
    expect(status()).toBe('not-started');
    service.recordRun('reverse-string', 'typescript', passed, 6);
    expect(status()).toBe('visible-passed');
  });

  it('migrates drafts saved under the old typexercise key', () => {
    localStorage.setItem('typexercise:solution:pangram', 'legacy code');
    expect(service.record('pangram').hasDraft).toBe(true);
    expect(service.loadDraft('pangram', 'typescript')).toBe('legacy code');
    expect(localStorage.getItem('typexercise:solution:pangram')).toBeNull();
    expect(service.loadDraft('pangram', 'typescript')).toBe('legacy code');
  });

  it('ignores corrupted stored values', () => {
    localStorage.setItem('pracstack:challenge:pangram:typescript:last-run', '{not json');
    localStorage.setItem('pracstack:challenge:pangram:typescript:draft', '{"code": 42}');
    expect(service.record('pangram').status).toBe('not-started');
    expect(service.loadDraft('pangram', 'typescript')).toBeNull();
  });
});
