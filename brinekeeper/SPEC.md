# Brinekeeper

Build mode: **MVP build**.
Build priority: **1**.

## App Name

Brinekeeper

## Category

Reef aquarium chemistry & livestock management

## One-Sentence Promise

Turns a water test into an exact dosing plan and warns you before a new fish or coral wrecks your tank.

## Target User

Serious saltwater reef aquarium hobbyists who test water parameters weekly and actively manage coral/fish stocking.

## Painful Moment Solved

After a water test you have raw numbers (Ca, Mg, Alk, NO3, PO4) but have to hand-calculate reef chemistry to know exactly how much of which product to dose without overshooting and crashing the tank, and you're guessing whether a new species will fight or chemically poison something already in there.

## Why It Is Different

A real deterministic dosing-optimization solver (tank volume + current + target parameters + product concentration → exact dose) and a livestock compatibility graph that reasons about bioload, aggression, and allelopathy instead of a static compatibility list; bioluminescent glass-morphism visual language with glowing coral-accent gradients, distinct from any tracker template and from existing single-purpose dosing calculators.

## Why Users Would Pay

Reef hobbyists already spend heavily on test kits and equipment; subscription unlocks multi-tank management, parameter-trend analytics over time, and unlimited livestock graph size.

## Subscription Model

Free tier: one tank, basic dosing calculator, manual logging. Paid: multi-tank support, trend analytics, unlimited livestock compatibility graph, data export.

## Local-First MVP Scope

SwiftData models for tanks, water tests, dosing products, livestock, and compatibility rules; dosing solver and compatibility engine run fully on-device; local notification/BGTask reminders for test/dose schedule.

## Future Backend Roadmap

CloudKit sync across a hobbyist's devices; optional shared tank profiles for clubs — no rewrite required since the solver and data model stay local-first.

## AR / Local ML / Local LLM Fit

On-device Vision for optional test-strip colorimetric reading; no LLM use — chemistry and compatibility logic must stay deterministic and auditable.

## Design Direction

Bioluminescent depths: near-black abyssal backgrounds, glowing coral-reef accent gradients (teal/violet/coral), glass-morphism data cards, luminous line graphs for parameter trends.

## App Store Positioning

The reef tank app that does the chemistry math for you and stops you from an incompatible-livestock mistake before you make it.

## Invalidation Criteria

If the dosing solver can't be made deterministic and explainable without external chemistry APIs, or if the compatibility graph can't be seeded with enough real relational data to feel non-trivial, cut back to a single-tank calculator and drop the compatibility graph rather than fake either.

## v1 Build Scope

Single and multi-tank dosing solver, water-test logging with trend charts, livestock roster with compatibility warnings, local reminders — no photo/Vision test-strip reading in v1.

## Core Workflows

- Log a water test
- Get a computed dosing recommendation
- Track parameter trends over time
- Build a livestock roster
- Get compatibility warnings before adding a new species
- Maintenance/testing schedule reminders

## iOS-Native Features

- Home screen widget: days since last test / next dose due
- BGTaskScheduler for test and dosing reminders
- Live Activity for an in-progress dosing session
- Optional Vision-based test-strip color reading as a stretch capability

## Key Risks

- Dosing math must be genuinely correct — a wrong solver output has real financial/livestock consequences, so it needs conservative, explainable output, not a black box
- Compatibility rules graph could feel thin if not seeded with enough real species data
- Niche audience size caps ceiling relative to a mass-market pick
