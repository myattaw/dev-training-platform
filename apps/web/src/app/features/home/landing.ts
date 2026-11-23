import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { asyncResource } from '../../shared/async/async-state';
import { ChallengeCatalogService } from '../challenges/data-access/challenge-catalog.service';
import { SkillCatalog } from '../skill-mastery/data-access/skill-catalog';
import { TrackMark } from './track-mark';

/**
 * Home page for signed-out visitors: what PracStack is, the tracks, and how to
 * start. Signed-in learners (and local mode) see the dashboard instead.
 */
@Component({
  selector: 'app-landing',
  imports: [RouterLink, TrackMark],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="hero" aria-labelledby="hero-heading">
      <div class="hero-inner">
        <p class="eyebrow">Developer practice, graded for real</p>
        <h1 id="hero-heading">Get interview-ready, one skill at a time.</h1>
        <p class="lede">
          Solve coding challenges graded against hidden tests, and build mastery in TypeScript, SQL
          and Angular with adaptive practice that tracks how well you really know each skill.
        </p>
        <div class="actions">
          <button type="button" class="btn btn--primary btn--lg" (click)="createAccount()">
            Create a free account
          </button>
          <button type="button" class="btn btn--on-dark btn--lg" (click)="signIn()">Sign in</button>
        </div>
        <p class="hint">
          Or <a routerLink="/challenges">try a challenge</a> first: no account needed.
        </p>
      </div>
    </section>

    <section class="section" aria-labelledby="features-heading">
      <h2 id="features-heading">Three ways to practise</h2>
      <div class="features">
        <article class="feature">
          <h3>Coding Challenges</h3>
          <p>
            Solve problems in TypeScript, Java or C# in a real code editor. Run the visible tests as
            often as you like, then submit: your code is graded on the server against hidden tests.
          </p>
          <a routerLink="/challenges">Browse challenges</a>
        </article>
        <article class="feature">
          <h3>Skill Mastery</h3>
          <p>
            Short, adaptive questions for one concept at a time. Every skill gets a 0–100 mastery
            score, and SQL answers run on real PostgreSQL and Oracle databases.
          </p>
          <a routerLink="/skills">Explore skills</a>
        </article>
        <article class="feature">
          <h3>Company Interview Prep</h3>
          <p>
            See what companies ask, then practise it in timed sessions that feel like the real
            interview, with a summary of how you did.
          </p>
          <button type="button" class="btn--link" (click)="createAccount()">
            Sign up to start
          </button>
        </article>
      </div>
    </section>

    <section class="section" aria-labelledby="tracks-heading">
      <h2 id="tracks-heading">Tracks</h2>
      <ul class="tracks">
        <li>
          <a class="track" routerLink="/challenges">
            <app-track-mark trackId="challenges" />
            <span>
              <strong>Coding Challenges</strong>
              <span class="text-secondary">{{ challengeCount() }}</span>
            </span>
          </a>
        </li>
        @let techs = technologies.state();
        @if (techs.status === 'ready') {
          @for (tech of techs.value; track tech.id) {
            <li>
              <a class="track" [routerLink]="['/skills', tech.id]">
                <app-track-mark [trackId]="tech.id" />
                <span>
                  <strong>{{ tech.name }}</strong>
                  <span class="text-secondary"
                    >{{ tech.skillCount }} {{ tech.skillCount === 1 ? 'skill' : 'skills' }}</span
                  >
                </span>
              </a>
            </li>
          }
        }
      </ul>
    </section>

    <section class="section" aria-labelledby="how-heading">
      <h2 id="how-heading">How it works</h2>
      <ol class="steps">
        <li>
          <strong>Pick a track</strong>
          <span class="text-secondary">Start with a language, a database, or a company.</span>
        </li>
        <li>
          <strong>Practise</strong>
          <span class="text-secondary"
            >Questions adapt to you: harder after correct answers, easier after misses.</span
          >
        </li>
        <li>
          <strong>Track your mastery</strong>
          <span class="text-secondary"
            >Your dashboard shows what you have mastered and what to do next.</span
          >
        </li>
      </ol>
    </section>

    <section class="cta" aria-labelledby="cta-heading">
      <h2 id="cta-heading">Ready to start?</h2>
      <p class="text-secondary">Free account. Sign up with Google or your email.</p>
      <button type="button" class="btn btn--primary btn--lg" (click)="createAccount()">
        Create a free account
      </button>
    </section>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--space-8);
      max-width: 1120px;
      margin: 0 auto;
    }
    .hero {
      border-radius: var(--radius-md);
      background: var(--color-hero-bg);
      color: var(--color-hero-text);
    }
    .hero-inner {
      max-width: 720px;
      padding: 56px var(--space-8);
    }
    .eyebrow {
      margin: 0 0 var(--space-3);
      color: var(--color-hero-text-secondary);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-bold);
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    h1 {
      margin: 0;
      font-size: 36px;
      line-height: 1.15;
      letter-spacing: -0.02em;
    }
    .lede {
      margin: var(--space-4) 0 var(--space-6);
      color: var(--color-hero-text-secondary);
      font-size: var(--font-size-md);
      line-height: 1.5;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-3);
    }
    .btn--lg {
      min-height: 40px;
      padding: 0 var(--space-5);
      font-size: var(--font-size-md);
    }
    .btn--on-dark {
      border-color: var(--color-hero-text-secondary);
      background: transparent;
      color: var(--color-hero-text);
    }
    .btn--on-dark:hover {
      background: var(--color-hero-surface-hover);
    }
    .hint {
      margin: var(--space-4) 0 0;
      color: var(--color-hero-text-secondary);
    }
    .hint a {
      color: var(--color-hero-text);
      text-decoration: underline;
    }
    .section h2,
    .cta h2 {
      margin: 0 0 var(--space-4);
      font-size: var(--font-size-xl);
    }
    .features {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: var(--space-4);
    }
    .feature {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      padding: var(--space-5);
      border: 1px solid var(--color-border-divider);
      border-radius: var(--radius-md);
      background: var(--color-surface);
    }
    .feature h3 {
      margin: 0;
      font-size: var(--font-size-md);
    }
    .feature p {
      flex: 1;
      margin: 0;
      color: var(--color-text-secondary);
      line-height: 1.5;
    }
    .feature .btn--link {
      align-self: flex-start;
    }
    .tracks {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: var(--space-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .track {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      height: 100%;
      padding: var(--space-3) var(--space-4);
      border: 1px solid var(--color-border-divider);
      border-radius: var(--radius-md);
      background: var(--color-surface);
      color: var(--color-text);
    }
    .track:hover {
      border-color: var(--color-border-strong);
      text-decoration: none;
    }
    .track > span {
      display: flex;
      flex-direction: column;
    }
    .track .text-secondary {
      font-size: var(--font-size-sm);
    }
    .steps {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: var(--space-4);
      margin: 0;
      padding: 0;
      list-style: none;
      counter-reset: step;
    }
    .steps li {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      counter-increment: step;
    }
    .steps li::before {
      content: counter(step);
      display: grid;
      place-items: center;
      width: 28px;
      height: 28px;
      margin-bottom: var(--space-2);
      border-radius: 50%;
      background: var(--color-primary-subtle);
      color: var(--color-primary);
      font-weight: var(--font-weight-bold);
    }
    .cta {
      padding: var(--space-8);
      border: 1px solid var(--color-border-divider);
      border-radius: var(--radius-md);
      background: var(--color-surface);
      text-align: center;
    }
    .cta p {
      margin: 0 0 var(--space-4);
    }
    @media (max-width: 640px) {
      .hero-inner {
        padding: var(--space-8) var(--space-5);
      }
      h1 {
        font-size: 28px;
      }
    }
  `,
})
export class Landing {
  private readonly auth = inject(AuthService);
  private readonly catalog = inject(ChallengeCatalogService);
  private readonly skills = inject(SkillCatalog);

  protected readonly technologies = asyncResource(
    () => 0,
    () => this.skills.technologies(),
  );
  protected readonly challengeCount = computed(() => {
    const state = this.catalog.summaries();
    if (state.status !== 'ready') return 'TypeScript, Java and C#';
    const n = state.value.length;
    return `${n} ${n === 1 ? 'challenge' : 'challenges'}`;
  });

  protected createAccount(): void {
    void this.auth.signIn('/', { signUp: true });
  }

  protected signIn(): void {
    void this.auth.signIn('/');
  }
}
