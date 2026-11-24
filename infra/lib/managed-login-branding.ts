import { readFileSync } from 'node:fs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import type { Construct } from 'constructs';

/** The app's colors (apps/web theme). Cognito wants hex with an alpha byte: `rrggbbaa`. */
const color = {
  primary: '1769aaff',
  primaryHover: '105a93ff',
  primaryActive: '0b4878ff',
  page: 'f7f8faff',
  surface: 'ffffffff',
  text: '16191fff',
  textSecondary: '5f6b7aff',
  border: 'd5dbe3ff',
} as const;

/**
 * Managed login branding settings: only what differs from Cognito's defaults. Cognito
 * applies branding in a PATCH model, so settings left out keep their default values.
 * Key names follow the settings JSON in the AWS::Cognito::ManagedLoginBranding example
 * (https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-cognito-managedloginbranding.html)
 * and https://docs.aws.amazon.com/cognito/latest/developerguide/managed-login-brandingdesigner.html.
 * Cognito ignores keys that are not in its schema, so a typo fails silently: check the
 * style in the console's branding editor after a change.
 */
export const BRANDING_SETTINGS = {
  categories: {
    global: { colorSchemeMode: 'LIGHT' },
  },
  componentClasses: {
    focusState: { lightMode: { borderColor: color.primary } },
    input: { lightMode: { defaults: { borderColor: color.border } } },
    inputLabel: { lightMode: { textColor: color.text } },
    inputDescription: { lightMode: { textColor: color.textSecondary } },
    link: {
      lightMode: {
        defaults: { textColor: color.primary },
        hover: { textColor: color.primaryHover },
      },
    },
    optionControls: {
      lightMode: { selected: { backgroundColor: color.primary, foregroundColor: color.surface } },
    },
  },
  components: {
    pageBackground: {
      image: { enabled: false },
      lightMode: { color: color.page },
    },
    form: {
      lightMode: { backgroundColor: color.surface, borderColor: color.border },
      logo: { enabled: true, formInclusion: 'IN', location: 'CENTER', position: 'TOP' },
    },
    pageText: {
      lightMode: {
        headingColor: color.text,
        bodyColor: color.text,
        descriptionColor: color.textSecondary,
      },
    },
    primaryButton: {
      lightMode: {
        defaults: { backgroundColor: color.primary, textColor: color.surface },
        hover: { backgroundColor: color.primaryHover, textColor: color.surface },
        active: { backgroundColor: color.primaryActive, textColor: color.surface },
      },
    },
    secondaryButton: {
      lightMode: {
        defaults: {
          backgroundColor: color.surface,
          borderColor: color.primary,
          textColor: color.primary,
        },
        hover: {
          backgroundColor: color.page,
          borderColor: color.primaryHover,
          textColor: color.primaryHover,
        },
        active: {
          backgroundColor: color.page,
          borderColor: color.primaryActive,
          textColor: color.primaryActive,
        },
      },
    },
  },
} as const;

/** The PracStack mark and wordmark, shown at the top of the sign-in form. */
export function brandLogoBase64(): string {
  const file = new URL('../assets/brand/pracstack-logo.svg', import.meta.url);
  return readFileSync(file).toString('base64');
}

/**
 * The GitHub mark for the "Continue with GitHub" button (light and dark mode).
 * Cognito has built-in icons only for its own social providers; a custom OIDC
 * provider gets a generic icon unless an IDP_BUTTON_ICON with its name is set.
 * Glyph: Simple Icons (CC0); the mark is GitHub's, used per https://github.com/logos.
 */
export function githubMarkBase64(mode: 'light' | 'dark'): string {
  const name = mode === 'dark' ? 'github-mark-dark.svg' : 'github-mark.svg';
  return readFileSync(new URL(`../assets/brand/${name}`, import.meta.url)).toString('base64');
}

/**
 * The managed login style for one app client (Cognito allows one style per client;
 * changing the client replaces the style). Needs a domain on managed login (version 2)
 * and the Essentials plan or higher.
 */
export function addManagedLoginBranding(
  scope: Construct,
  id: string,
  userPool: cognito.IUserPool,
  client: cognito.IUserPoolClient,
  /** Custom identity providers with their own button icon (e.g. "GitHub"). */
  providerIcons: readonly 'GitHub'[] = [],
): cognito.CfnManagedLoginBranding {
  const branding = new cognito.CfnManagedLoginBranding(scope, id, {
    userPoolId: userPool.userPoolId,
    clientId: client.userPoolClientId,
    useCognitoProvidedValues: false,
    returnMergedResources: false,
    settings: BRANDING_SETTINGS,
    assets: [
      { category: 'FORM_LOGO', colorMode: 'LIGHT', extension: 'SVG', bytes: brandLogoBase64() },
      ...providerIcons.flatMap((resourceId) =>
        (['LIGHT', 'DARK'] as const).map((colorMode) => ({
          category: 'IDP_BUTTON_ICON',
          colorMode,
          extension: 'SVG',
          resourceId,
          bytes: githubMarkBase64(colorMode === 'DARK' ? 'dark' : 'light'),
        })),
      ),
    ],
  });
  branding.node.addDependency(client);
  return branding;
}
