#!/bin/sh
# PHASE 0 SPIKE. Removes the function role's credentials (as docker/entrypoint.sh),
# then starts the custom runtime; locally, under the Runtime Interface Emulator.
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_SECURITY_TOKEN \
  AWS_CONTAINER_CREDENTIALS_FULL_URI AWS_CONTAINER_CREDENTIALS_RELATIVE_URI \
  AWS_CONTAINER_AUTHORIZATION_TOKEN AWS_WEB_IDENTITY_TOKEN_FILE AWS_ROLE_ARN
NODE="${PRACSTACK_NODE:-/var/lang/bin/node}"
if [ -z "${AWS_LAMBDA_RUNTIME_API:-}" ]; then
  exec /usr/local/bin/aws-lambda-rie --runtime-interface-emulator-address 0.0.0.0:9000 "$NODE" /opt/pracstack/bootstrap.mjs
fi
exec "$NODE" /opt/pracstack/bootstrap.mjs
