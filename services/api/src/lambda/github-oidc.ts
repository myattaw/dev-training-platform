/**
 * Lambda entry point of the GitHub sign-in bridge (see ../github-oidc/bridge.ts).
 * Routed by API Gateway at /oidc/github/* without an authorizer: Cognito and
 * the browser call it before anyone is signed in.
 *
 * Environment:
 *   OIDC_ISSUER            public URL, e.g. https://<api>.execute-api.<region>.amazonaws.com/oidc/github
 *   OIDC_REDIRECT_URIS     JSON list of allowed redirect URIs (Cognito's /oauth2/idpresponse)
 *   SIGNING_KEY_PARAMETER  SSM SecureString parameter with the RSA private key (PEM)
 */
import { createPrivateKey } from 'node:crypto';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { createGithubBridge, keyIdOf, type SigningKey } from '../github-oidc/bridge';

const PREFIX = '/oidc/github';
const MAX_BODY = 16 * 1024;

const issuer = required('OIDC_ISSUER');
const redirectUris = JSON.parse(required('OIDC_REDIRECT_URIS')) as string[];
const parameter = required('SIGNING_KEY_PARAMETER');
const ssm = new SSMClient({});

let key: Promise<SigningKey> | undefined;
/** Read once per container; a failure is retried on the next request. */
function signingKey(): Promise<SigningKey> {
  key ??= ssm
    .send(new GetParameterCommand({ Name: parameter, WithDecryption: true }))
    .then((res) => {
      const pem = res.Parameter?.Value;
      if (!pem) throw new Error('The signing key parameter is empty.');
      const privateKey = createPrivateKey(pem);
      return { privateKey, kid: keyIdOf(privateKey) };
    })
    .catch((err: unknown) => {
      key = undefined;
      throw err;
    });
  return key;
}

const bridge = createGithubBridge({
  issuer,
  allowedRedirectUris: redirectUris,
  signingKey,
  fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(8000) }),
  now: () => Date.now(),
});

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const raw = event.body ?? '';
  const body = event.isBase64Encoded ? Buffer.from(raw, 'base64').toString('utf8') : raw;
  if (body.length > MAX_BODY) return { statusCode: 413, body: '' };
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(event.headers ?? {})) {
    if (value !== undefined) headers[name.toLowerCase()] = value;
  }
  const path = event.rawPath.startsWith(PREFIX)
    ? event.rawPath.slice(PREFIX.length)
    : event.rawPath;
  const response = await bridge({
    method: event.requestContext.http.method,
    path: path || '/',
    query: Object.fromEntries(
      Object.entries(event.queryStringParameters ?? {}).flatMap(([k, v]) =>
        v === undefined ? [] : [[k, v]],
      ),
    ),
    headers,
    body,
  });
  return {
    statusCode: response.status,
    headers: { ...response.headers, 'x-content-type-options': 'nosniff' },
    body: response.body,
  };
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}
