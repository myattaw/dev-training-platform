import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { DifficultyBadge } from '../../components/difficulty-badge/difficulty-badge';
import { CodeEditor } from '../../editor/code-editor';
import { ExerciseService } from '../../services/exercise.service';
import { SolutionStorageService } from '../../services/solution-storage.service';
import type { RunOutcome } from '../../test-runner/test-runner.models';
import { TestRunnerService } from '../../test-runner/test-runner.service';
import { NotFound } from '../not-found/not-found';
import { ExerciseInstructions } from './instructions/exercise-instructions';
import { TestResults } from './test-results/test-results';

@Component({
  selector: 'app-exercise-page',
  imports: [RouterLink, DifficultyBadge, CodeEditor, ExerciseInstructions, TestResults, NotFound],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './exercise.html',
  styleUrl: './exercise.css',
})
export class ExercisePage {
  /** Bound from the `:id` route param via `withComponentInputBinding()`. */
  readonly id = input.required<string>();

  private readonly exercises = inject(ExerciseService);
  private readonly storage = inject(SolutionStorageService);
  private readonly runner = inject(TestRunnerService);
  private readonly editor = viewChild(CodeEditor);

  protected readonly exercise = computed(() => this.exercises.getById(this.id()));
  protected readonly neighbors = computed(() => this.exercises.neighborsOf(this.id()));

  /**
   * `linkedSignal` is a writable signal that resets whenever its source changes.
   * Navigating to another exercise reloads that exercise's saved draft (or starter code),
   * while typing in the editor still writes to it.
   */
  protected readonly code = linkedSignal(() => {
    const exercise = this.exercise();
    return exercise ? (this.storage.load(exercise.id) ?? exercise.starterCode) : '';
  });

  /** Test results also reset when the exercise changes. */
  protected readonly outcome = linkedSignal<unknown, RunOutcome | null>({
    source: this.exercise,
    computation: () => null,
  });

  protected readonly running = signal(false);

  constructor() {
    const title = inject(Title);
    effect(() => {
      const exercise = this.exercise();
      title.setTitle(exercise ? `${exercise.title} · typexercise` : 'Exercise not found · typexercise');
    });

    // Auto-save drafts. Unmodified starter code isn't stored, so starter updates still reach learners.
    effect(() => {
      const exercise = this.exercise();
      const code = this.code();
      if (!exercise) return;
      if (code === exercise.starterCode) this.storage.clear(exercise.id);
      else this.storage.save(exercise.id, code);
    });
  }

  protected async runTests(): Promise<void> {
    const exercise = this.exercise();
    const editor = this.editor();
    if (!exercise || !editor || this.running()) return;

    this.running.set(true);
    try {
      const compiled = await editor.compile();
      const outcome: RunOutcome = compiled.ok
        ? await this.runner.run(compiled.js, exercise.entryPoint, exercise.tests)
        : { status: 'compile-error', diagnostics: compiled.diagnostics };

      // Ignore stale results if the learner navigated away mid-run.
      if (this.exercise() === exercise) this.outcome.set(outcome);
    } finally {
      this.running.set(false);
    }
  }

  protected reset(): void {
    const exercise = this.exercise();
    if (!exercise) return;
    if (this.code() !== exercise.starterCode && !confirm('Reset your code to the starter template?')) return;
    this.code.set(exercise.starterCode);
    this.outcome.set(null);
  }
}
