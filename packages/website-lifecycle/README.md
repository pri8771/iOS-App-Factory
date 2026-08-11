# Website lifecycle module

Consumes an immutable `release.testflight-available` lifecycle event and plans
one deterministic, approval-required website pull request. The generated data
may describe an app as `private-beta`, but deliberately contains no internal
TestFlight URL, tester identity, credential, merge, or deployment instruction.

The module is dormant until an enrolled website supplies explicit configuration.
It never receives GitHub credentials and never writes a repository directly.
