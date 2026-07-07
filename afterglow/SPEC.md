# Afterglow

Build mode: **MVP build**.
Build priority: **6**.

## App Name

Afterglow

## Category

Travel

## One-Sentence Promise

Turns your trip's photos and notes into a beautiful, automatically organized travel journal you'll actually finish.

## Target User

People who take many trip photos but never organize them into anything meaningful afterward.

## Painful Moment Solved

Coming home with hundreds of photos, meaning to make something of them, and never doing it — the memory fades into an unsorted camera roll.

## Why It Is Different

On-device clustering of Photos-framework metadata into a day-by-day trip story the user captions, producing a polished exportable journal entirely offline, with no cloud photo processing.

## Why Users Would Pay

Premium layout themes, unlimited archived trips, printable photo-book export, richer on-device narrative generation from captions/voice notes.

## Subscription Model

Free: 1 trip journal, basic themes. Paid: unlimited trips, premium themes, print export, narrative generation.

## Local-First MVP Scope

Entirely on-device — reads Photos metadata with permission, clusters by day/location, exports as PDF/shareable images.

## Future Backend Roadmap

Optional cloud backup of finished journals; potential shared collaborative journal for co-travelers who also have the app.

## AR / Local ML / Local LLM Fit

On-device Vision for clustering and highlight-photo selection; optional on-device LLM to draft short narrative captions strictly from the user's own notes.

## Design Direction

Premium photo-book aesthetic — full-bleed imagery, elegant serif captions, a designed keepsake rather than a generic gallery.

## App Store Positioning

The travel journal that makes itself — from your own photos, entirely on your phone.

## Invalidation Criteria

If most users abandon the caption step after auto-clustering, ship a faster no-caption default output instead of assuming the concept fails.

## v1 Build Scope

Photo selection, auto day-clustering, captions/voice notes, one layout theme, export.

## Core Workflows

- Select a trip's date range/photos
- Review auto-generated day clusters
- Add captions or voice notes
- Choose a layout theme
- Export/share the finished journal

## iOS-Native Features

- Photos framework + on-device Vision for clustering
- Widgets showing last trip's cover photo
- Share Sheet export

## Key Risks

- Photos permission friction requires transparent handling
- Clustering quality degrades with sparse location metadata
- On-device narrative generation must never invent details the user didn't note
