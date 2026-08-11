# Module SDK

Compile-time trusted extension points for website, analytics, feedback,
SEO/AEO, CRM, email, marketing, and social capabilities.

A module registers exactly the commands, lifecycle-event consumers, external
effect kinds, quality gates, and dashboard panel keys declared by its versioned
manifest. Handlers receive validated JSON configuration and immutable contracts;
they receive no database, provider credentials, approvals, or networking
capability from this SDK.

Modules return effect intents. The host derives a deterministic operation marker
and payload digest, then routes the intent through the normal approval/outbox
boundary. Every effect remains approval-bound. Dynamic third-party loading is
out of scope for V1; trusted modules are wired at build time.
