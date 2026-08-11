# Recovery manager

Creates and verifies an integrity-bound control-plane recovery bundle. The
bundle contains an online SQLite backup and an index of required evidence
digests; it never contains credentials. Restore is allowed only into a new,
empty, private runtime directory and only after every indexed evidence object
can be located and verified by the caller.

Provider reconciliation remains a distinct post-restore step. A restore never
redispatches external effects or claims that an unknown provider mutation
succeeded.
