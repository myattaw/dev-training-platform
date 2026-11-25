# Execution costs: web application runs (estimates)

**Nothing here is measured on AWS.** No web-execution infrastructure is deployed and no resources
were created to measure cost. These are estimates from public list prices (us-east-2, on-demand,
late 2026; check the AWS pricing pages before deciding) and from **local** timings measured on the
development machine. AWS execution is not free.

## Measured locally (development machine, 16 cores, Docker Desktop)

| Framework                        | Build                   | Start → first HTTP answer | Full grading run (build, start, 15 tests, stop) |
| -------------------------------- | ----------------------- | ------------------------- | ----------------------------------------------- |
| ASP.NET Core 10                  | ~5–11 s                 | ~1 s                      | ~6–17 s                                         |
| Spring Boot 4.1 (javac + Tomcat) | ~2 s                    | ~2–3 s                    | ~5–22 s                                         |
| Django 5.2 + DRF                 | ~2 s (checks + migrate) | ~3 s                      | ~6–23 s                                         |

Ranges: the low end is an idle machine; the high end is with several builds in parallel.

## Proposed AWS model (not built): one Fargate task per run

Assumptions:

- One ECS Fargate task (x86, Linux) per graded run or interactive session: **2 vCPU, 4 GB** for
  .NET builds (1 vCPU / 2 GB is enough for Django), app container + probe sidecar.
- Fargate list price ≈ **$0.0404 per vCPU-hour** and **$0.00444 per GB-hour**; one-minute minimum
  billing; task start ≈ 30–60 s (image pull from ECR in the same region, cached layers help).
- A graded run is billed ≈ **1.5 minutes** (start + build + tests), a session ≈ **its lifetime**
  (capped at 10 minutes, stopped after 3 idle minutes; assume 6 minutes on average).
- Images in ECR: ~0.2–1.5 GB each, ≈ $0.10 per GB-month → ≈ **$0.30/month** for the four images.
- No NAT gateway and no VPC endpoints are needed for the tasks themselves (no egress by design);
  pulling images needs either ECR VPC endpoints (≈ $7.30/month per interface endpoint per AZ, two
  needed plus S3 gateway) or tasks in a subnet that can reach ECR only. **This fixed cost
  (≈ $15–25/month) dominates at low volume.**

Cost per execution (2 vCPU / 4 GB):

|                     | vCPU cost                      | Memory cost                     | Total         |
| ------------------- | ------------------------------ | ------------------------------- | ------------- |
| Graded run, 1.5 min | 2 × 0.0404 × 1.5/60 = $0.00202 | 4 × 0.00444 × 1.5/60 = $0.00044 | **≈ $0.0025** |
| Session, 6 min      | $0.00808                       | $0.00178                        | **≈ $0.0099** |

## Scenarios (variable cost only, plus the fixed ≈ $15–25/month)

Assume each active user, on a day they practice, does 6 graded runs and 2 sessions
(≈ $0.035 per user-day), and practices 10 days a month.

| Active users | Executions/month | Variable cost/month | With fixed cost |
| ------------ | ---------------- | ------------------- | --------------- |
| 100          | 8,000            | ≈ $35               | ≈ $50–60        |
| 1,000        | 80,000           | ≈ $350              | ≈ $365–375      |
| 10,000       | 800,000          | ≈ $3,500            | ≈ $3,515–3,525  |

Heavier users (the free quota is 40 builds/day) can cost up to ≈ $0.40/day each, which is why the
quota and the per-user concurrency limit exist.

## Cheaper alternatives (trade-offs)

- **Smaller tasks for Django** (1 vCPU / 2 GB): about half the cost per run.
- **A warm pool of workers** (EC2 Spot with Firecracker or gVisor): lower per-run cost and start
  time, but an always-on cost (≈ $15–60/month for a small pool) and more operations work.
- **Lambda** is not a fit for applications: 15-minute limit is fine, but no sidecar, a read-only
  filesystem except `/tmp`, and .NET SDK builds exceed comfortable memory/time for the price.

## Controls that bound cost (implemented, server-side)

- Daily execution quota per user (free 40, Pro 200; configurable), counted atomically in the store.
- One test run in progress + one application session per user.
- Per-minute rate limit on starting builds (6/min by default).
- Global concurrency and queue limits in the runner (`maxConcurrent`, `maxQueue`).
- Session lifetime (10 min), idle stop (3 min) and request cap (200 per session).
- Kill switch: `PRACSTACK_WEB_EXECUTION=off` (browse-only).
- On AWS (when built): reuse the existing budget action that stops runner invocations when actual
  spend passes the budget.
