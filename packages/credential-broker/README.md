# Credential broker

Trusted, just-in-time reads of macOS Keychain generic-password items. Agent
processes receive neither provider credentials nor Keychain access. Callers can
use a credential only inside a callback; the broker zeroes its owned buffer on
success, failure, and cancellation.

The broker never retains or renders command output. Failures expose stable
codes, not `security` stdout/stderr, so a provider cannot place a secret into
Factory logs by returning it in an error.
