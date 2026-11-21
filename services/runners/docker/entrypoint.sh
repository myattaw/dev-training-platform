#!/bin/sh
# Entrypoint of every runner image. Lambda passes the function role's
# credentials to the runtime in its environment; learner programs run as the
# same OS user and could read that environment from /proc/<pid>/environ. The
# runners never call AWS, so the credentials are removed here, before the
# Lambda runtime (and anything it starts) exists. Then Lambda's own
# entrypoint takes over.
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_SECURITY_TOKEN \
  AWS_CONTAINER_CREDENTIALS_FULL_URI AWS_CONTAINER_CREDENTIALS_RELATIVE_URI \
  AWS_CONTAINER_AUTHORIZATION_TOKEN AWS_WEB_IDENTITY_TOKEN_FILE AWS_ROLE_ARN
exec /lambda-entrypoint.sh "$@"
