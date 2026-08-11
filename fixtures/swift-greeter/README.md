# Swift Greeter fixture

This deterministic Swift Package is copied from a fixed file manifest into a
temporary standalone Git repository for runner, worktree, verification, and
recovery tests. The template itself is never an agent worktree. Materialization
uses fixed commit metadata, records the baseline commit and tree, and computes
content digests for every protected path.

The baseline package must pass `swift test`, but fixture materialization never
runs Swift. A test or verifier must call the testkit's explicit Swift-test
operation. The first bounded coding task asks the agent to add
`GreetingFormatter.farewell(for:)` by changing only
`Sources/Greeter/GreetingFormatter.swift`.

`FactoryAcceptance/FarewellAcceptanceTests.swift` deliberately lives outside
Swift Package Manager's `Tests/` tree, so it is not part of the baseline suite.
After the candidate's scope and protected-path digests have been checked, a
verifier-owned clean checkout copies that canonical file to
`Tests/GreeterTests/FarewellAcceptanceTests.swift` and runs `swift test`. The
acceptance source comes from the Factory template, never from agent output, and
the injection helper refuses to overwrite an existing file.

`.gitignore`, `Tests/`, `FactoryAcceptance/`, and `Package.swift` are protected
paths. An implementation attempt that changes them must fail even if its tests
pass. The authorized write scope is the single formatter source file; every
other repository path is outside scope.
