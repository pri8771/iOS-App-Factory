# Proof

Build mode: **MVP build**.
Build priority: **4**.

## App Name

Proof

## Category

Maker & Small-Batch Business Tools

## One-Sentence Promise

Log what a batch actually costs you in materials and time, and know the price that keeps you from secretly losing money.

## Target User

Side-hustle makers and small-batch sellers who price intuitively and have never calculated true per-unit cost including their own labor time.

## Painful Moment Solved

Finishing a batch of product and having no real answer to 'am I actually making money on this.'

## Why It Is Different

Calculates true landed cost per unit including labor at a user-set rate, and derives a defensible minimum price.

## Why Users Would Pay

Unlimited products, a reusable material cost library, and profit-trend reporting versus a single-product free tier.

## Subscription Model

Free: 1 tracked product. Paid (~$5.99/mo or $44/yr): unlimited products, shared material cost library, batch profit-trend history.

## Local-First MVP Scope

Local product/recipe records, reusable material cost entries, labor time entry with user-set hourly rate, per-batch true-cost calculation, suggested pricing, local profit-history tracking.

## Future Backend Roadmap

Repository protocol boundary now; later, optional cloud backup/sync and a marketplace sales-import point behind the same interface.

## AR / Local ML / Local LLM Fit

None — deliberately no bonus tech; the value is disciplined cost accounting done well.

## Design Direction

Warm, craft-market aesthetic with honest, ledger-like data presentation.

## App Store Positioning

The true cost of what you make, finally in plain numbers.

## Invalidation Criteria

If users stop logging labor time within the first few batches, the promise collapses to materials-only and needs repositioning.

## v1 Build Scope

Single-user local product/recipe and cost tracking, labor-time entry, true-cost calculation with suggested pricing, profit-trend history, full state coverage, StoreKit 2 paywall.

## Core Workflows

- define a product/recipe with materials and quantities
- log labor time per batch
- calculate true per-unit cost
- get a suggested minimum price for a target margin
- track profit trend across batches

## iOS-Native Features

- Local persistence via SwiftData
- Widgets showing last batch's margin
- Share sheet export of a priced product card
- Dynamic Type/VoiceOver accessible data-entry forms

## Key Risks

- Users may resist entering honest labor time, undermining the core calculation
- Material entry could feel tedious for makers with many small inputs
