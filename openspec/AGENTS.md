# OpenSpec Instructions for AI Coding Assistants

This repository uses **OpenSpec** for Spec-Driven Development (SDD). Always consult `openspec/project.md` and `openspec/specs/` before planning or implementing changes.

## Directory Layout

- `openspec/project.md` — Project-wide context, architecture conventions, tech stack, and global constraints.
- `openspec/specs/<capability>/spec.md` — Source-of-truth behavioral specifications organized by capability domain.
- `openspec/changes/<change-id>/` — Proposed modifications, containing:
  - `proposal.md` — Intent (`## Why`), scope (`## What Changes`), and impact (`## Impact`).
  - `design.md` — Technical approach, architectural decisions, data models, and trade-offs.
  - `tasks.md` — Ordered, checkable implementation steps (`- [ ] 1.1 ...`).
  - `specs/<capability>/spec.md` — Delta specifications (`## ADDED Requirements`, `## MODIFIED Requirements`, `## REMOVED Requirements`).

## Spec Formatting Rules

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
