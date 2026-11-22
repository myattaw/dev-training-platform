import { inject, Injectable } from '@angular/core';
import {
  type AccountProgressResponse,
  CODE_LIMITS,
  type DraftResponse,
  type EntitlementsResponse,
  type ImportedDraft,
  type MeResponse,
  PROFILE_LIMITS,
  type ProgressImportResponse,
} from '@pracstack/api-contracts';
import type { LanguageId } from '@pracstack/content-model';
import { ApiClient } from '../../../core/api/api-client';
import { SessionService } from '../../../core/session/session.service';

export interface IdentitiesResponse {
  readonly identities: readonly { readonly provider: string; readonly linkedAt: string }[];
}

/** Request bodies stay well below the API's 400 KB limit. */
const MAX_BATCH_CHARS = 200_000;

/** Splits drafts into import batches by count and size. */
export function batchDrafts(drafts: readonly ImportedDraft[]): ImportedDraft[][] {
  const batches: ImportedDraft[][] = [];
  let current: ImportedDraft[] = [];
  let size = 0;
  for (const draft of drafts) {
    if (draft.code.length > CODE_LIMITS.maxCodeLength) continue; // The API would refuse it.
    const full = current.length >= PROFILE_LIMITS.maxImportDrafts;
    if (current.length > 0 && (full || size + draft.code.length > MAX_BATCH_CHARS)) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(draft);
    size += draft.code.length;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/** Profile, plan and progress import. */
@Injectable({ providedIn: 'root' })
export class AccountApi {
  private readonly api = inject(ApiClient);
  private readonly session = inject(SessionService);

  entitlements(): Promise<EntitlementsResponse> {
    return this.api.get('/me/entitlements');
  }

  progress(): Promise<AccountProgressResponse> {
    return this.api.get('/me/progress');
  }

  identities(): Promise<IdentitiesResponse> {
    return this.api.get('/me/identities');
  }

  async updateDisplayName(displayName: string): Promise<MeResponse> {
    const me = await this.api.patch<MeResponse>('/me', { displayName });
    this.session.refresh();
    return me;
  }

  draft(challengeId: string, language: LanguageId): Promise<DraftResponse> {
    return this.api.get(
      `/me/drafts/${encodeURIComponent(challengeId)}/${encodeURIComponent(language)}`,
    );
  }

  /**
   * Imports drafts in batches. Importing again is safe: drafts the account
   * already has are reported as unchanged, and different ones as conflicts
   * (never overwritten unless listed in `overwrite`). Returns the combined result.
   */
  async importDrafts(
    drafts: readonly ImportedDraft[],
    overwrite: readonly string[] = [],
  ): Promise<Omit<ProgressImportResponse, 'importId' | 'replayed'>> {
    let imported = 0;
    let unchanged = 0;
    const conflicts: ProgressImportResponse['conflicts'][number][] = [];
    for (const batch of batchDrafts(drafts)) {
      const keys = new Set(batch.map((d) => `${d.challengeId}:${d.language}`));
      const result = await this.api.post<ProgressImportResponse>('/me/progress/import', {
        importId: crypto.randomUUID(),
        drafts: batch,
        overwrite: overwrite.filter((k) => keys.has(k)),
      });
      imported += result.imported;
      unchanged += result.unchanged;
      conflicts.push(...result.conflicts);
    }
    return { imported, unchanged, conflicts };
  }
}
