# OpenSpec Instructions for AI Coding Assistants

This repository uses **OpenSpec** for Spec-Driven Development (SDD).

## Start here (handoff)

1. **`openspec/STATE.md`** — What is implemented, completed change IDs, spec↔code drift, test commands.
2. **`openspec/project.md`** — Architecture, trust boundaries, security spec index.
3. **`openspec/specs/<capability>/spec.md`** — Normative requirements (**source of truth**).

Do not begin large features without reading `STATE.md` and the relevant capability spec(s).

## Directory layout

- `openspec/project.md` — Project-wide context, architecture conventions, tech stack, and global constraints.
- `openspec/STATE.md` — Implementation snapshot and handoff notes for the next agent.
- `openspec/specs/<capability>/spec.md` — Source-of-truth behavioral specifications organized by capability domain.
- `openspec/changes/<change-id>/` — Proposed or **historical** modifications, containing:
  - `proposal.md` — Intent (`## Why`), scope (`## What Changes`), and impact (`## Impact`).
  - `design.md` — Technical approach, architectural decisions, data models, and trade-offs.
  - `tasks.md` — Ordered, checkable implementation steps (`- [ ] 1.1 ...`). When all `[x]`, implementation is done; see `STATE.md`.
  - `specs/<capability>/spec.md` — Delta specifications (`## ADDED Requirements`, `## MODIFIED Requirements`, `## REMOVED Requirements`).

## Working on a new change

1. Add or update `openspec/changes/<new-id>/` with `proposal.md`, `design.md`, `tasks.md`, and capability deltas.
2. Implement against **tasks.md**, then merge requirements into `openspec/specs/<capability>/spec.md` when the change is accepted.
3. Update `openspec/STATE.md` (drift table, verification date, capability index if needed).
4. Update `docs/security/COVERAGE_MATRIX.md` when security behavior changes.

## Spec formatting rules

1. Every `openspec/specs/<capability>/spec.md` file MUST include:
   - `# <Capability Title>`
   - `## Purpose` (concise description of the capability boundary)
   - `## Requirements`
2. Every requirement MUST use a level-3 heading:
   - `### Requirement: <Requirement Name>`
   - Followed immediately by a normative statement containing `SHALL` or `MUST`.
3. Every requirement MUST include at least one scenario using a level-4 heading:
   - `#### Scenario: <Scenario Description>`
   - Followed by `- **GIVEN** ...`, `- **WHEN** ...`, `- **THEN** ...`, and optional `- **AND** ...` bullet points.
4. Delta specs in `openspec/changes/<change-id>/specs/<capability>/spec.md` MUST group requirements under `## ADDED Requirements`, `## MODIFIED Requirements`, or `## REMOVED Requirements`.

## Security reviews

- Normative: `openspec/specs/security-hardening/spec.md`, `assistant-security/spec.md`, `assistant-feedback/spec.md`
- Operational: `docs/security/REVIEW_CHECKLIST.md`, `docs/security/COVERAGE_MATRIX.md` (`security-operations` spec)