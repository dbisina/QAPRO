# ADR-0007: laya / Jev as an optional System-1 triage layer, from Phase 3, in shadow mode

- Status: Accepted (2026-09-24)

## Context
The user asked to consider [receptron/laya](https://github.com/receptron/laya) and Jev.
- **Jev**: TypeSafe AI, launched 2026-09-15. A hosted, proprietary "System One" model. It does not generate text; it takes a state plus typed questions and returns calibrated probabilities (`choice` / `score` / `noul` yes-no).
- **laya**: receptron, created 2026-09-19, v0.1.1, MIT licence. An open-source, local ONNX model whose API is compatible with Jev. Node 20+, about 2 GB RAM. State is truncated at 512 tokens.
- Beware of look-alike "awesome-jev" repositories. Install only from official sources.

## Decision
- Not in the MVP (Phases 0–2).
- Phase 3: a `DecisionProvider` interface (`laya-local` | `jev-hosted` | `claude-haiku`) for high-volume typed decisions: failure category, failure dedup, PBI/PR risk tier, prod alert classification.
- **Shadow mode first**: laya answers and Claude decides; log agreement. Promote one question at a time, only after 2 sprints at or above the target accuracy on labelled data. A System-1 answer is acted on only when its probability ≥ τ (tuned per question). Anything lower escalates to Claude.
- `jev-hosted` needs a security and procurement review: data leaves the tenant for a very new vendor. laya keeps data on the VM.

## Consequences
The 512-token state limit means deterministic feature extraction first (test name, error type, top stack frames, changed files), with Haiku summarising only as a fallback.
