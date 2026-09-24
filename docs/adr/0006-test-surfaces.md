# ADR-0006: One gate, many test surfaces (web, API, mobile, desktop)

- Status: Accepted; tool choices per surface to be verified in Phase 0 (2026-09-24)

## Context
The products under test span web frontends, APIs/microservices, mobile apps and desktop apps.

## Decision
Every surface's tooling must emit **JUnit XML** (functional results) and/or **SARIF** (security/static). The gate and the agents then work unchanged across surfaces. The pipeline templates take test commands as parameters, so there are no per-surface templates.

| Surface | Functional | Security / quality | Notes |
|---|---|---|---|
| Web | Playwright (+ `@axe-core/playwright`, `toHaveScreenshot`), Lighthouse CI | ZAP (SARIF), Semgrep, Trivy | Playwright Test Agents (planner/generator/healer) for authoring |
| API | Playwright API tests or the stack's native runner; Schemathesis (OpenAPI fuzzing); Pact (contracts) | Semgrep, ZAP API scan (nightly, uat) | k6 / Azure Load Testing for performance (thresholds → exit code / JUnit) |
| Mobile | Maestro (YAML flows, `--format junit`); Appium for complex cases | MobSF (mobile SAST/DAST; convert to SARIF, verify) | Needs a device cloud (BrowserStack / Sauce Labs / AWS Device Farm). *Visual Studio App Center was retired in 2025.* macOS agents for iOS builds |
| Desktop | Windows: FlaUI or Appium Windows driver; Electron: Playwright `_electron` | Semgrep, Trivy | Needs Windows agents in the pool for UI automation |

## Consequences
- Phase 0 must confirm which surfaces the **pilot** app has. Start with web and API only, because they give the fastest proof.
- Mobile and desktop need extra agent-pool capacity (macOS or Windows machines, or a device cloud). Request it early; procurement is slow.
