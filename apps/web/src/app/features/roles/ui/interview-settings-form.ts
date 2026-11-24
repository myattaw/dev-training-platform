import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import {
  daysBetween,
  INTERVIEW_FORMAT_LABELS,
  INTERVIEW_FORMATS,
  type InterviewFormat,
  LANGUAGE_LABELS,
  type LanguageId,
} from '@pracstack/content-model';
import {
  DATE_PRESETS,
  type InterviewSettings,
  presetDate,
  TIME_PRESETS,
} from '../data-access/study-plan';

/**
 * Optional interview details: job title, company, interview date, daily
 * study time, preferred language and interview format. Nothing is required;
 * without a date the plan is a prioritized path instead of a schedule.
 */
@Component({
  selector: 'app-interview-settings-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let s = settings();
    <div class="grid">
      <div class="field">
        <label class="field-label" [for]="id('title')"
          >Job title <span class="opt">(optional)</span></label
        >
        <input
          class="input"
          type="text"
          maxlength="80"
          autocomplete="off"
          [id]="id('title')"
          [value]="s.jobTitle ?? ''"
          (change)="setText('jobTitle', $event)"
        />
      </div>
      <div class="field">
        <label class="field-label" [for]="id('company')"
          >Company <span class="opt">(optional)</span></label
        >
        <input
          class="input"
          type="text"
          maxlength="80"
          autocomplete="off"
          [id]="id('company')"
          [value]="s.company ?? ''"
          (change)="setText('company', $event)"
        />
      </div>

      <fieldset class="field wide">
        <legend class="field-label">Interview date <span class="opt">(optional)</span></legend>
        <div class="chips" role="group" aria-label="Quick interview dates">
          @for (p of datePresets; track p.days) {
            <button
              type="button"
              class="chip"
              [attr.aria-pressed]="s.interviewDate === preset(p.days)"
              (click)="patch({ interviewDate: preset(p.days) })"
            >
              {{ p.label }}
            </button>
          }
          <label class="custom">
            <span class="sr-only">Custom interview date</span>
            <input
              class="input"
              type="date"
              [min]="today()"
              [value]="s.interviewDate ?? ''"
              (change)="setDate($event)"
            />
          </label>
          @if (s.interviewDate) {
            <button type="button" class="btn btn--link btn--sm" (click)="clear('interviewDate')">
              No date
            </button>
          }
        </div>
        <p class="hint text-secondary">{{ dateHint() }}</p>
      </fieldset>

      <fieldset class="field wide">
        <legend class="field-label">Daily study time <span class="opt">(optional)</span></legend>
        <div class="chips" role="group" aria-label="Daily study time">
          @for (p of timePresets; track p.minutes) {
            <button
              type="button"
              class="chip"
              [attr.aria-pressed]="s.dailyMinutes === p.minutes"
              (click)="patch({ dailyMinutes: p.minutes })"
            >
              {{ p.label }}
            </button>
          }
          <label class="custom">
            <span class="custom-label">Custom (minutes)</span>
            <input
              class="input minutes"
              type="number"
              min="15"
              max="720"
              step="5"
              [value]="s.dailyMinutes ?? ''"
              (change)="setMinutes($event)"
            />
          </label>
        </div>
      </fieldset>

      <div class="field">
        <label class="field-label" [for]="id('format')">Interview format</label>
        <select class="input" [id]="id('format')" (change)="setFormat($event)">
          @for (f of formats; track f) {
            <option [value]="f" [selected]="s.format === f">{{ formatLabels[f] }}</option>
          }
        </select>
        @if (s.format === 'unknown' && inferredFormat(); as f) {
          <p class="hint text-secondary">
            Planning for {{ formatLabels[f].toLowerCase() }} (inferred from the posting).
          </p>
        }
      </div>
      <div class="field">
        <label class="field-label" [for]="id('language')">Preferred programming language</label>
        <select class="input" [id]="id('language')" (change)="setLanguage($event)">
          <option value="" [selected]="!s.language">No preference</option>
          @for (l of languages; track l) {
            <option [value]="l" [selected]="s.language === l">{{ languageLabels[l] }}</option>
          }
        </select>
      </div>
    </div>
  `,
  styles: `
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-3) var(--space-4);
    }
    .wide {
      grid-column: 1 / -1;
    }
    @media (max-width: 640px) {
      .grid {
        grid-template-columns: 1fr;
      }
    }
    fieldset {
      border: none;
      margin: 0;
      padding: 0;
      min-width: 0;
    }
    .field .input {
      width: 100%;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2);
    }
    .chip {
      border: 1px solid var(--color-border-input, #8c8c94);
      background: var(--color-background-container, #fff);
      border-radius: 999px;
      padding: 4px 12px;
      font: inherit;
      font-size: var(--font-size-sm);
      cursor: pointer;
    }
    .chip[aria-pressed='true'] {
      background: var(--color-primary-subtle);
      border-color: var(--color-primary);
      color: var(--color-primary);
      font-weight: 600;
    }
    .chip:focus-visible {
      outline: 2px solid var(--color-primary);
      outline-offset: 2px;
    }
    .custom {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      font-size: var(--font-size-sm);
    }
    .chips .input {
      width: auto;
    }
    .minutes {
      width: 6rem !important;
    }
    .opt {
      font-weight: normal;
      color: var(--color-text-secondary);
    }
    .hint {
      margin: var(--space-1) 0 0;
      font-size: var(--font-size-sm);
    }
  `,
})
export class InterviewSettingsForm {
  readonly settings = model.required<InterviewSettings>();
  readonly today = input.required<string>();
  /** The format the planner uses when the learner is not sure. */
  readonly inferredFormat = input<InterviewFormat>();
  /** Prefix for element ids (two forms can be on a page). */
  readonly idPrefix = input('interview');

  protected readonly datePresets = DATE_PRESETS;
  protected readonly timePresets = TIME_PRESETS;
  protected readonly formats = INTERVIEW_FORMATS;
  protected readonly formatLabels = INTERVIEW_FORMAT_LABELS;
  protected readonly languages = Object.keys(LANGUAGE_LABELS) as LanguageId[];
  protected readonly languageLabels = LANGUAGE_LABELS;

  protected readonly dateHint = computed(() => {
    const date = this.settings().interviewDate;
    if (!date) return 'Without a date you get a prioritized path instead of a schedule.';
    const days = daysBetween(this.today(), date);
    if (days <= 0) return 'The interview is today or has passed: the plan covers today only.';
    return `${days} ${days === 1 ? 'day' : 'days'} to prepare (the interview day itself is not scheduled).`;
  });

  protected id(name: string): string {
    return `${this.idPrefix()}-${name}`;
  }

  protected preset(days: number): string {
    return presetDate(this.today(), days);
  }

  protected patch(change: Partial<InterviewSettings>): void {
    this.settings.update((s) => ({ ...s, ...change }));
  }

  protected clear(
    field: 'interviewDate' | 'dailyMinutes' | 'language' | 'jobTitle' | 'company',
  ): void {
    this.settings.update((s) => {
      const next = { ...s };
      delete next[field];
      return next;
    });
  }

  protected setText(field: 'jobTitle' | 'company', event: Event): void {
    const value = (event.target as HTMLInputElement).value.trim().slice(0, 80);
    if (value === '') this.clear(field);
    else this.patch({ [field]: value });
  }

  protected setDate(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) this.patch({ interviewDate: value });
    else this.clear('interviewDate');
  }

  protected setMinutes(event: Event): void {
    const n = Math.round(Number((event.target as HTMLInputElement).value));
    if (Number.isFinite(n) && n >= 15 && n <= 720) this.patch({ dailyMinutes: n });
    else if ((event.target as HTMLInputElement).value === '') this.clear('dailyMinutes');
  }

  protected setFormat(event: Event): void {
    this.patch({ format: (event.target as HTMLSelectElement).value as InterviewFormat });
  }

  protected setLanguage(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value === '') this.clear('language');
    else this.patch({ language: value as LanguageId });
  }
}
