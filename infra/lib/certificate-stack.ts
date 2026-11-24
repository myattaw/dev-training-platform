import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import type { Construct } from 'constructs';

export interface CertificateStackProps extends StackProps {
  /** The site's domain, e.g. `pracstack.com`. */
  readonly domainName: string;
  /** Other names on the same certificate, e.g. `www.pracstack.com`, `auth.pracstack.com`. */
  readonly alternateNames: readonly string[];
}

/**
 * The TLS certificate for a stage's custom domain. It must be in us-east-1:
 * CloudFront and Cognito custom domains only use certificates from there,
 * whatever the region of the main stack.
 *
 * DNS is not in Route 53 (it is hosted at Cloudflare), so validation is
 * manual: while this stack is being created, ACM shows one CNAME record per
 * name (`aws acm describe-certificate`); once they exist in DNS ("DNS only",
 * not proxied) the certificate is issued and the stack completes. ACM renews
 * it automatically as long as those records stay.
 */
export class CertificateStack extends Stack {
  readonly certificate: acm.Certificate;

  constructor(scope: Construct, id: string, props: CertificateStackProps) {
    super(scope, id, props);
    this.certificate = new acm.Certificate(this, 'Certificate', {
      domainName: props.domainName,
      subjectAlternativeNames: [...props.alternateNames],
      validation: acm.CertificateValidation.fromDns(),
      certificateName: `PracStack ${props.domainName}`,
    });
    new CfnOutput(this, 'CertificateArn', { value: this.certificate.certificateArn });
  }
}
