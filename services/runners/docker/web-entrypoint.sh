#!/bin/sh
# Entrypoint of the web runner images: removes the function role's credentials
# (as entrypoint.sh) before the Lambda runtime exists. Locally (no
# AWS_LAMBDA_RUNTIME_API) it starts the Runtime Interface Emulator on port 9000,
# not its default 8080: 8080 is the port every learner application listens on.
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_SECURITY_TOKEN \
  AWS_CONTAINER_CREDENTIALS_FULL_URI AWS_CONTAINER_CREDENTIALS_RELATIVE_URI \
  AWS_CONTAINER_AUTHORIZATION_TOKEN AWS_WEB_IDENTITY_TOKEN_FILE AWS_ROLE_ARN
if [ $# -ne 1 ]; then
  echo "entrypoint requires the handler name to be the first argument" 1>&2
  exit 142
fi
export _HANDLER="$1"
if [ -z "${AWS_LAMBDA_RUNTIME_API:-}" ]; then
  exec /usr/local/bin/aws-lambda-rie --runtime-interface-emulator-address 0.0.0.0:9000 /var/runtime/bootstrap
fi
exec /var/runtime/bootstrap
