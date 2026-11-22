#!/usr/bin/env bash
# Prints the `-c key=value` arguments for `cdk diff` / `cdk deploy` from the
# GitHub environment's settings (see .github/workflows/deploy.yml). Every value
# is checked against a strict character set, because the output is word-split
# into the cdk command line.
set -euo pipefail

fail() { echo "cdk-context: $*" >&2; exit 1; }
check() { # name value regex
  [[ "$2" =~ $3 ]] || fail "$1 has an unexpected value (check the GitHub environment settings)."
}

: "${STAGE:?STAGE is not set}"
: "${ALERT_EMAIL:?Set the ALERT_EMAIL secret on the GitHub environment}"
check STAGE "$STAGE" '^(staging|production)$'
check ALERT_EMAIL "$ALERT_EMAIL" '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+$'

args=(-c "stage=$STAGE" -c "alertEmail=$ALERT_EMAIL")

if [[ -n "${BUDGET_USD:-}" ]]; then
  check BUDGET_USD "$BUDGET_USD" '^[0-9]{1,5}(\.[0-9]{1,2})?$'
  args+=(-c "budgetUsd=$BUDGET_USD")
fi
if [[ -n "${SIGN_UP_ALLOWLIST:-}" ]]; then
  check SIGN_UP_ALLOWLIST "$SIGN_UP_ALLOWLIST" '^[A-Za-z0-9@._+,-]+$'
  args+=(-c "signUpAllowlist=$SIGN_UP_ALLOWLIST")
fi
if [[ -n "${RUNNER_CONCURRENCY:-}" ]]; then
  check RUNNER_CONCURRENCY "$RUNNER_CONCURRENCY" '^[0-9]{1,2}$'
  args+=(-c "runnerConcurrency=$RUNNER_CONCURRENCY")
fi
if [[ -n "${GOOGLE_CLIENT_ID:-}" ]]; then
  check GOOGLE_CLIENT_ID "$GOOGLE_CLIENT_ID" '^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$'
  args+=(-c "googleClientId=$GOOGLE_CLIENT_ID")
fi
# Production keeps users and progress if the stack is ever deleted.
if [[ "$STAGE" == production ]]; then args+=(-c retainData=true); fi

echo "${args[@]}"
