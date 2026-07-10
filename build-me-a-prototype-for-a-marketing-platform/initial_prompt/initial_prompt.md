Build me something like ordinal. I want to copy their feature set. Here is the link: 

https://www.tryordinal.com


## Change requested

The current app misinterpreted Ordinal. VERIFIED feature set from the live site (https://www.tryordinal.com — fetched 2026-07-10): Ordinal is "a powerful end-to-end platform to draft, plan, and schedule social media content" for social media managers, agencies, and growth teams. Core modules: (1) Scheduling & posting — draft posts, cross-post to multiple channels from one composer, post previews, recurring posts; (2) Planning — rich content calendar with campaign management, ideas/drafts section, collaboration + approval workflows; (3) Auto-engagement — scheduled auto-likes/comments/reposts and "post is live" notifications; (4) Analytics — daily reporting on followers/engagement/impressions, insights filterable by post type and content label.

Rework this app toward that real shape while REUSING what exists: keep Campaign, Asset, the Draft → In Review → Approved / Needs Rework state machine (it maps directly to Ordinal's approval workflow), versioning, and status history. ADD, as local-first single-user features with simulated (never real) network activity:
1. POST as a first-class object: caption text, target channels (Instagram, TikTok, YouTube, LinkedIn), attached asset(s), per-channel preview cards, scheduled date/time. A post must reach Approved before it can be scheduled.
2. Content calendar screen: month view of scheduled/published posts, color-coded by channel; tap to open post.
3. Publish simulation: at/after the scheduled time (or via a "Publish now (simulated)" button), the post transitions Scheduled → Published with a fake permalink and timestamp in its history. No real network calls, no credentials — clearly label everything "Simulated".
4. Ideas/drafts inbox: quick-capture list that can be promoted to a full post.
5. Analytics screen: mock per-channel metrics (followers, impressions, engagement) as simple charts, filterable by channel and content label; label posts with free-form content labels.
6. Recurring posts: a repeat rule (weekly/biweekly/monthly) that materializes the next occurrence when one publishes.
Keep every existing hard requirement: offline, SwiftData persistence, real empty/loading/error states, accessibility, no real platform integrations. The app must compile cleanly for the iOS Simulator with the MarketingCampaignCockpit scheme.
