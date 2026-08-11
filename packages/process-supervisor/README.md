# Process supervisor

Per-attempt child-process entrypoint. It records process identity and fencing,
normalizes replayable events, controls process groups, and supports orphan
reconciliation without becoming a second scheduler.

