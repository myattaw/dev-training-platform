import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { PROFILE_LIMITS, type DraftImportConflict } from '@pracstack/api-contracts';
import { LANGUAGE_LABELS, type LanguageId } from '@pracstack/content-model';
import { AuthService } from '../../../core/auth/auth.service';
import { RuntimeConfigService, type SocialProvider } from '../../../core/config/runtime-config';
import { SessionService } from '../../../core/session/session.service';
import { asyncResource, errorMessage } from '../../../shared/async/async-state';
import { Alert } from '../../../shared/ui/alert/alert';
import { Badge } from '../../../shared/ui/badge/badge';
import { Icon } from '../../../shared/ui/icon/icon';
import { ProviderIcon } from '../../../shared/ui/provider-icon/provider-icon';
import { LoadingState } from '../../../shared/ui/loading-state/loading-state';
import { PageHeader } from '../../../shared/ui/page-header/page-header';
import { Panel } from '../../../shared/ui/panel/panel';
import { ChallengeProgressService } from '../../challenges/data-access/challenge-progress.service';
import { AccountApi } from '../data-access/account-api';

/** A link waiting for the sign-in with the new method (sessionStorage; never the token in a URL). */
const PENDING_LINK_KEY = 'pracstack.pendingLink';

interface PendingLink {
  readonly token: string;
  readonly provider: SocialProvider;
  readonly expiresAt: string;
}

const FEATURE_LABELS: Readonly<Record<string, string>> = {
  'premium-recommendations': 'Premium recommended challenges',
  'advanced-preparation-plans': 'Deeper company preparation plans',
  'advanced-mock-interviews': 'Advanced mock interview sessions',
  'progress-analytics': 'Progress analytics',
};

/**
 * The signed-in user's account: profile, plan, sign-in methods, and copying
 * progress from this browser into the account.
 */
@Component({
  selector: 'app-account-page',
  imports: [RouterLink, Alert, Badge, Icon, LoadingState, PageHeader, Panel, ProviderIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './account-page.html',
  styleUrl: './account-page.css',
})
export class AccountPage {
  protected readonly auth = inject(AuthService);
  protected readonly session = inject(SessionService);
  private readonly api = inject(AccountApi);
  private readonly local = inject(ChallengeProgressService);
  private readonly runtime = inject(RuntimeConfigService);

  protected readonly entitlements = asyncResource(
    () => this.session.me(),
    () => this.api.entitlements(),
  );
  protected readonly identities = asyncResource(
    () => this.session.me(),
    () => this.api.identities(),
  );
  // ---- sign-in methods ----
  /** Social providers this deployment offers that the account has not linked yet. */
  protected readonly linkable = computed<readonly SocialProvider[]>(() => {
    const auth = this.runtime.config().auth;
    const ids = this.identities.state();
    if (auth.mode !== 'cognito' || ids.status !== 'ready') return [];
    const linked = new Set(ids.value.identities.map((i) => i.provider));
    return (auth.providers ?? []).filter((p) => !linked.has(p));
  });
  protected readonly linking = signal(false);
  protected readonly linkMessage = signal<{ ok: boolean; text: string } | null>(null);

  constructor() {
    void this.finishPendingLink();
  }

  /**
   * Links another sign-in method with proof from both: a link token created
   * now (signed in to this account), redeemed after signing in with the new
   * method. Accounts are never joined because they share an email address.
   */
  protected async addSignInMethod(provider: SocialProvider): Promise<void> {
    this.linking.set(true);
    this.linkMessage.set(null);
    try {
      const intent = await this.api.createLinkIntent();
      const pending: PendingLink = { token: intent.token, provider, expiresAt: intent.expiresAt };
      sessionStorage.setItem(PENDING_LINK_KEY, JSON.stringify(pending));
      await this.auth.signIn('/account', { provider });
    } catch (err) {
      this.linkMessage.set({ ok: false, text: errorMessage(err) });
      this.linking.set(false);
    }
  }

  /** Back from signing in with the new method: redeem the link token once. */
  private async finishPendingLink(): Promise<void> {
    const raw = sessionStorage.getItem(PENDING_LINK_KEY);
    if (!raw || this.auth.status() !== 'signed-in') return;
    sessionStorage.removeItem(PENDING_LINK_KEY);
    let pending: PendingLink;
    try {
      pending = JSON.parse(raw) as PendingLink;
    } catch {
      return;
    }
    if (Date.parse(pending.expiresAt) < Date.now()) {
      this.linkMessage.set({
        ok: false,
        text: 'The link request expired. Add the sign-in method again.',
      });
      return;
    }
    this.linking.set(true);
    try {
      await this.api.completeLink(pending.token);
      this.linkMessage.set({
        ok: true,
        text: `${pending.provider} is now linked: signing in with it opens this account.`,
      });
      this.identities.reload();
    } catch (err) {
      this.linkMessage.set({ ok: false, text: errorMessage(err) });
    } finally {
      this.linking.set(false);
    }
  }

  private readonly reloadProgress = signal(0);
  protected readonly progress = asyncResource(
    () => this.reloadProgress(),
    () => this.api.progress(),
  );

  protected readonly featureLabels = FEATURE_LABELS;
  protected readonly languageLabels = LANGUAGE_LABELS;
  protected readonly maxName = PROFILE_LIMITS.maxDisplayName;

  // ---- profile ----
  protected readonly name = linkedSignal(() => this.session.me()?.user.displayName ?? '');
  protected readonly savingName = signal(false);
  protected readonly nameMessage = signal<{ ok: boolean; text: string } | null>(null);

  protected async saveName(): Promise<void> {
    this.savingName.set(true);
    this.nameMessage.set(null);
    try {
      await this.api.updateDisplayName(this.name());
      this.nameMessage.set({ ok: true, text: 'Saved.' });
    } catch (err) {
      this.nameMessage.set({ ok: false, text: errorMessage(err) });
    } finally {
      this.savingName.set(false);
    }
  }

  // ---- browser progress ----
  private readonly localVersion = signal(0);
  protected readonly localDrafts = computed(() => {
    this.localVersion();
    return this.local.listDrafts();
  });
  protected readonly importing = signal(false);
  protected readonly importResult = signal<{
    imported: number;
    unchanged: number;
    conflicts: readonly DraftImportConflict[];
  } | null>(null);
  protected readonly importError = signal<string | null>(null);

  protected async importLocal(overwrite: readonly string[] = []): Promise<void> {
    this.importing.set(true);
    this.importError.set(null);
    try {
      const drafts = this.localDrafts();
      const only =
        overwrite.length > 0
          ? drafts.filter((d) => overwrite.includes(`${d.challengeId}:${d.language}`))
          : drafts;
      const result = await this.api.importDrafts(only, overwrite);
      // Replacing one conflict keeps the other conflicts from the first import listed.
      const previous = this.importResult();
      this.importResult.set(
        overwrite.length > 0 && previous
          ? {
              imported: previous.imported + result.imported,
              unchanged: previous.unchanged + result.unchanged,
              conflicts: [
                ...previous.conflicts.filter(
                  (c) => !overwrite.includes(`${c.challengeId}:${c.language}`),
                ),
                ...result.conflicts,
              ],
            }
          : result,
      );
      this.reloadProgress.update((n) => n + 1);
    } catch (err) {
      this.importError.set(errorMessage(err));
    } finally {
      this.importing.set(false);
    }
  }

  protected replaceAccountDraft(conflict: DraftImportConflict): Promise<void> {
    return this.importLocal([`${conflict.challengeId}:${conflict.language}`]);
  }

  // ---- account drafts back into this browser ----
  protected readonly restoreMessage = signal<string | null>(null);

  protected async restore(challengeId: string, language: LanguageId): Promise<void> {
    this.restoreMessage.set(null);
    try {
      const draft = await this.api.draft(challengeId, language);
      const current = this.local.loadDraft(challengeId, language);
      if (
        current !== null &&
        current !== draft.code &&
        !window.confirm('This browser has a different draft for this challenge. Replace it?')
      ) {
        return;
      }
      // An empty starter makes saveDraft always store the code.
      this.local.saveDraft(challengeId, language, draft.code, '');
      this.localVersion.update((n) => n + 1);
      this.restoreMessage.set(
        `Restored your ${LANGUAGE_LABELS[language]} draft of ${challengeId}.`,
      );
    } catch (err) {
      this.restoreMessage.set(errorMessage(err));
    }
  }

  protected signOut(): void {
    this.auth.signOut();
  }
}
