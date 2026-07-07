# Scope Guard

Build mode: **MVP build**.
Build priority: **2**.

## App Name

Scope Guard

## Category

Freelance & Consulting Tools

## One-Sentence Promise

Paste in client messages and get scope-creep flagged with a drafted change order before you do unpaid work.

## Target User

Independent freelancers and small consultancies who lose money to informal scope creep buried in message threads.

## Painful Moment Solved

A client casually asks for 'one more small thing' and the freelancer must decide, under time pressure, whether that's billable.

## Why It Is Different

Intervenes before the unpaid work happens, at the moment the ask lands, instead of tracking time after the fact.

## Why Users Would Pay

Unlimited projects/clients and unlimited LLM extractions versus a capped free tier.

## Subscription Model

Free: 1 active project, 10 extractions/month. Paid (~$9.99/mo): unlimited projects and extractions, change-order templates, PDF export.

## Local-First MVP Scope

Local project/client records, pasted-text ingestion, on-device LLM extraction of deliverables vs. new asks, manual scope baseline, change-order draft generation, local export.

## Future Backend Roadmap

Repository protocol boundary now; later, optional email/Slack ingestion via cloud connector behind the same interface.

## AR / Local ML / Local LLM Fit

LLM extraction is the entire value proposition; ships an explicit non-LLM manual-tagging fallback for ineligible devices.

## Design Direction

Sharp, contract-grade, no-nonsense — legal document meets modern productivity app.

## App Store Positioning

Stop doing unpaid work you didn't agree to.

## Invalidation Criteria

If freelancers stop pasting messages after week one, or flags are routinely wrong, the mechanic needs rework.

## v1 Build Scope

Single-user local project/client management, manual scope baseline, paste-and-extract with LLM and manual fallback, change-order draft + export, full state coverage, StoreKit 2 paywall.

## Core Workflows

- define project scope baseline
- paste in new client message
- LLM flags in-scope vs out-of-scope asks
- review and edit flagged items
- generate change-order draft

## iOS-Native Features

- On-device Foundation Models framework
- Share extension from Mail/Messages
- Local document export
- Accessibility-first form-heavy UI

## Key Risks

- Devices without Apple Intelligence eligibility need a genuinely usable manual fallback
- Extraction quality needs validation against messy real-world phrasing
