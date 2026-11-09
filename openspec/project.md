# Project Context: ContextDrop

## Core Design Principle
**ContextDrop owns its domain. The host application owns its identity and infrastructure.**

ContextDrop functions as an independent, self-contained subsystem inside the host Ruby on Rails application. It works without knowing whether the host application uses Devise, Sorcery, Authlogic, Rails 8 built-in authentication, or custom session logic.

## Purpose
**ContextDrop** (`context_drop`) is a self-hosted, open-source contextual feedback Ruby gem implemented as a **Mountable Rails Engine** (`isolate_namespace ContextDrop`) with an installation generator (`context_drop:install`), engine-owned database tables and migrations, a self-hosted feedback triage dashboard, a decoupled TypeScript frontend widget, and a built-in **Model Context Protocol (MCP) server** for IDEs and coding agents.

## Tech Stack
- **Backend Architecture:** Mountable Ruby on Rails Engine (`rails plugin new context_drop --mountable`, `isolate_namespace ContextDrop`) targeting Ruby >= 3.1 and Rails >= 7.1 (including Rails 8+).
- **Persistence & Storage:**
  - Engine-owned Active Record tables: `context_drop_feedbacks`, `context_drop_attachments`, and `context_drop_element_references`.
  - Binary file storage delegated to the host application's **Active Storage** (`has_one_attached :file` on `ContextDrop::Attachment`).
  - Database-portable JSON columns (`jsonb` on PostgreSQL, `json` on SQLite/MySQL).
- **Dashboard Views:** Server-rendered ERB views encapsulated inside the engine (`app/views/context_drop/dashboard/feedbacks/`) with isolated engine stylesheet.
- **Frontend Widget:** Decoupled TypeScript widget (`app/javascript/context_drop/`) compiled to a framework-free Web Component (`<context-drop-widget>`) with **Shadow DOM** style isolation, compatible with Importmaps, Propshaft, Sprockets, or JS bundlers.
- **MCP Server Integration:** Built-in Model Context Protocol (`JSON-RPC 2.0`) server supporting both local `stdio` (`bin/rails context_drop:mcp`) and token-authenticated Streamable HTTP (`POST /context_drop/mcp`).

## Domain Ownership Boundaries

| Component | Owner | Mechanism |
|---|---|---|
| `ContextDrop::Feedback` (`context_drop_feedbacks`) | ContextDrop Engine | Engine model & migration |
| `ContextDrop::Attachment` (`context_drop_attachments`) | ContextDrop Engine | Engine model & migration (`has_one_attached :file`) |
| `ContextDrop::ElementReference` (`context_drop_element_references`) | ContextDrop Engine | Engine model & migration |
| Feedback Dashboard Views & Controllers | ContextDrop Engine | Mounted under `/context_drop/dashboard` |
| Floating Widget (`<context-drop-widget>`) | ContextDrop Frontend | Decoupled TS Web Component with Shadow DOM |
| User / Submitter Model | Host Application | `belongs_to :submitter, polymorphic: true, optional: true` |
| Authentication | Host Application | `config.current_submitter = ->(controller) { ... }` |
| Authorization Policies | Configurable Integration | `config.authorize_submission`, `config.authorize_dashboard`, `config.authorize_mcp` |
| Database Connection & Active Storage Blobs | Host Application | Host database & `active_storage_blobs` / `active_storage_attachments` |

## Project Conventions

### Code Style
- **Ruby:** `frozen_string_literal: true` in all Ruby files, 2-space indentation, explicit table names (`self.table_name = "context_drop_..."`), models inheriting from `ContextDrop::ApplicationRecord`.
- **TypeScript:** Strict TypeScript (`"strict": true`), zero runtime dependencies on React/Vue/Angular, Shadow DOM encapsulation.
- **Installation:** `bin/rails generate context_drop:install` configures the initializer, mounts routes, and copies engine migrations (`rails context_drop:install:migrations`).

### Zero-Trust Privacy & Security
- Never capture raw `outerHTML` or form control `value` properties in `ContextDrop::ElementReference`.
- Recursively exclude `[data-feedback-ignore]`, `[data-feedback-sensitive]`, `input[type="password"]`, `input[type="hidden"]`, and configured `excluded_selectors` from both DOM element selection and screenshots (via pre-capture visual redaction).
- Verify uploaded binary MIME types server-side using magic bytes (`Marcel`), never trusting client-supplied `Content-Type` headers or filenames.
