import { Injectable } from '@angular/core';
import {
  type Challenge,
  challengeFile,
  MANIFEST_FILE,
  type PublicManifest,
  type RolesFile,
  type Scenario,
  scenarioFile,
  type ScenariosFile,
  SCHEMA_VERSION,
  type TaxonomyFile,
  trackFile,
  type TrackCatalog,
} from '@pracstack/content-model';

/**
 * Source of public content. The app depends on this abstraction so tests can
 * use in-memory fixtures and production can later load from a CDN or API.
 */
export abstract class ContentRepository {
  abstract manifest(): Promise<PublicManifest>;
  abstract challenge(id: string, version: number): Promise<Challenge>;
  abstract track(technologyId: string): Promise<TrackCatalog>;
  /** Job roles (Job Role Preparation). */
  abstract roles(): Promise<RolesFile>;
  /** Technology taxonomy for roles and the job description analyzer. */
  abstract taxonomy(): Promise<TaxonomyFile>;
  /** Enterprise Scenarios catalog. */
  abstract scenarios(): Promise<ScenariosFile>;
  /** One scenario (public part: no answers). */
  abstract scenario(id: string, version: number): Promise<Scenario>;
}

export class ContentLoadError extends Error {
  override readonly name = 'ContentLoadError';
}

/**
 * Loads the generated JSON under `/content/` (see `@pracstack/content-model`
 * manifest.ts for the layout). Responses are cached for the session; a
 * failed request is not cached, so it can be retried.
 */
@Injectable()
export class HttpContentRepository extends ContentRepository {
  private readonly cache = new Map<string, Promise<unknown>>();

  override async manifest(): Promise<PublicManifest> {
    // `no-cache` revalidates with the server: the manifest changes with every content release.
    const manifest = await this.get<PublicManifest>(MANIFEST_FILE, 'no-cache');
    if (manifest.schemaVersion !== SCHEMA_VERSION) {
      this.cache.delete(MANIFEST_FILE);
      throw new ContentLoadError(
        `Content schema ${manifest.schemaVersion} is not supported by this version of the app. Reload the page.`,
      );
    }
    return manifest;
  }

  override challenge(id: string, version: number): Promise<Challenge> {
    // Versioned file names never change content, so the browser cache can be used freely.
    return this.get<Challenge>(challengeFile(id, version), 'default');
  }

  override track(technologyId: string): Promise<TrackCatalog> {
    // Not versioned in the file name, so revalidate like the manifest.
    return this.get<TrackCatalog>(trackFile(technologyId), 'no-cache');
  }

  override async roles(): Promise<RolesFile> {
    const file = (await this.manifest()).preparation?.rolesFile;
    if (!file) throw new ContentLoadError('Job roles are not available in this content version.');
    return this.get<RolesFile>(file, 'no-cache');
  }

  override async taxonomy(): Promise<TaxonomyFile> {
    const file = (await this.manifest()).preparation?.taxonomyFile;
    if (!file) throw new ContentLoadError('Job roles are not available in this content version.');
    return this.get<TaxonomyFile>(file, 'no-cache');
  }

  override async scenarios(): Promise<ScenariosFile> {
    const file = (await this.manifest()).scenariosFile;
    if (!file)
      throw new ContentLoadError('Enterprise Scenarios are not available in this content version.');
    return this.get<ScenariosFile>(file, 'no-cache');
  }

  override scenario(id: string, version: number): Promise<Scenario> {
    // Versioned file names never change content.
    return this.get<Scenario>(scenarioFile(id, version), 'default');
  }

  private get<T>(path: string, cache: RequestCache): Promise<T> {
    let request = this.cache.get(path) as Promise<T> | undefined;
    if (!request) {
      request = this.fetchJson<T>(path, cache);
      request.catch(() => this.cache.delete(path));
      this.cache.set(path, request);
    }
    return request;
  }

  private async fetchJson<T>(path: string, cache: RequestCache): Promise<T> {
    // Resolve against <base href>, not the current route.
    const url = new URL(`content/${path}`, document.baseURI);
    let response: Response;
    try {
      response = await fetch(url, { cache });
    } catch {
      throw new ContentLoadError(
        'Could not reach the server. Check your connection and try again.',
      );
    }
    if (!response.ok) {
      throw new ContentLoadError(`Content request failed (${response.status}).`);
    }
    return (await response.json()) as T;
  }
}
