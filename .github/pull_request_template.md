## What changed


## Checks

- [ ] CI is green (lint, typecheck, unit tests, build + leak check, e2e)
- [ ] `npm run verify` passed locally, **with Docker running**: CI skips the Docker security
      suites (code and Lambda runners, DynamoDB, Oracle), so they are only checked there
- [ ] Docs updated if behaviour, limits, costs or security boundaries changed
- [ ] No new AWS resource that bills while idle (the infra cost test enforces this)
