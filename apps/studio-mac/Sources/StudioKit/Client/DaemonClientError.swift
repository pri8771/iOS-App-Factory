import Foundation

// MARK: - DaemonClientError
//
// One error type for everything the client can surface, mirroring the Node client's
// CommandClientError / CommandRemoteError split via `origin`. `retryable` says whether the outcome is
// unknown and the same durable command may be re-sent; when it is, `retryIdentity` carries the
// commandId + issuedAt to preserve so the daemon can replay rather than re-execute.

public struct DaemonClientError: Error, Sendable, Equatable, CustomStringConvertible {
    public enum Origin: Sendable, Equatable {
        /// Raised locally: transport, protocol validation, cancellation, configuration.
        case client
        /// The daemon answered `ok: false`. `requestId` is what it echoed (may be null).
        case remote(requestId: RequestID?)
    }

    public let origin: Origin
    /// Namespaced code, e.g. "transport.timeout", "protocol.unauthorized", "client.closed".
    public let code: String
    public let message: String
    public let retryable: Bool
    public let retryIdentity: RetryableCommandIdentity?

    public init(origin: Origin = .client, code: String, message: String, retryable: Bool,
                retryIdentity: RetryableCommandIdentity? = nil) {
        self.origin = origin
        self.code = code
        self.message = message
        self.retryable = retryable
        self.retryIdentity = retryIdentity
    }

    public var isRemote: Bool {
        if case .remote = origin { return true }
        return false
    }

    /// True when this looks like "the daemon doesn't know this operation" rather than a real failure
    /// of a supported one — the feature-detection signal Studio Phase 2 uses to fall back from
    /// `studio.snapshot` / `studio.assistant.*` / `project.milestones.*` to the pre-Phase-2 path.
    ///
    /// `protocol.unsupported-operation` is the dedicated wire code the daemon now emits for a
    /// syntactically well-formed frame naming an operation this protocol version does not
    /// recognize at all (`apps/daemon/src/unix-command-server.ts`), distinct from
    /// `protocol.invalid-request` (a frame that fails to parse for any other reason — a malformed
    /// payload for a *known* operation, a bad protocol version, and so on). Earlier revisions of
    /// this client treated both codes as "unsupported operation" because no dedicated code existed
    /// yet; grep for `isUnsupportedOperation` to find every call site that depends on this.
    public var isUnsupportedOperation: Bool {
        isRemote && code == "protocol.unsupported-operation"
    }

    /// The same error with a retry identity attached (only when retryable).
    func attaching(_ identity: RetryableCommandIdentity) -> DaemonClientError {
        guard retryable else { return self }
        return DaemonClientError(origin: origin, code: code, message: message, retryable: true,
                                 retryIdentity: identity)
    }

    public var description: String {
        let kind = isRemote ? "daemon" : "client"
        return "[\(kind)] \(code): \(message)\(retryable ? " (retryable)" : "")"
    }

    // MARK: Well-known local errors (codes and copy match packages/command-client/src/index.ts)

    static let invalidSocketPath = DaemonClientError(
        code: "client.invalid-socket-path",
        message: "The command socket path must be absolute and at most 100 UTF-8 bytes.", retryable: false)
    static let closed = DaemonClientError(
        code: "client.closed", message: "The command client is closed.", retryable: false)
    static let closedAfterDispatch = DaemonClientError(
        code: "client.closed-after-dispatch",
        message: "The command client closed after dispatch; the command outcome is unknown.", retryable: true)
    static let cancelled = DaemonClientError(
        code: "client.cancelled", message: "The command request was cancelled before dispatch.", retryable: false)
    static let cancelledAfterDispatch = DaemonClientError(
        code: "client.cancelled-after-dispatch",
        message: "The command request was cancelled after dispatch; its outcome is unknown.", retryable: true)
    static let requestTooLarge = DaemonClientError(
        code: "client.request-too-large",
        message: "The command request exceeds the configured byte limit.", retryable: false)
    static let timeout = DaemonClientError(
        code: "transport.timeout", message: "The command request timed out.", retryable: true)
    static let connectionFailed = DaemonClientError(
        code: "transport.connection-failed", message: "The command socket connection failed.", retryable: true)
    static let remoteClosed = DaemonClientError(
        code: "transport.remote-closed",
        message: "The command server closed before returning a complete response.", retryable: true)
    static let responseTooLarge = DaemonClientError(
        code: "protocol.response-too-large",
        message: "The dispatched command returned an oversized response; its outcome is unknown.", retryable: true)
    static let multipleResponses = DaemonClientError(
        code: "protocol.multiple-responses",
        message: "The dispatched command returned multiple response frames; its outcome is unknown.", retryable: true)
    static let malformedResponse = DaemonClientError(
        code: "protocol.malformed-response",
        message: "The dispatched command returned malformed JSON; its outcome is unknown.", retryable: true)
    static let invalidResponse = DaemonClientError(
        code: "protocol.invalid-response",
        message: "The dispatched command returned an invalid protocol response; its outcome is unknown.", retryable: true)
    static let responseIdMismatch = DaemonClientError(
        code: "protocol.response-id-mismatch",
        message: "The command response ID does not match the dispatched request; its outcome is unknown.", retryable: true)
    static let responseOperationMismatch = DaemonClientError(
        code: "protocol.response-operation-mismatch",
        message: "The command response operation does not match the dispatched request; its outcome is unknown.",
        retryable: true)
    static let portfolioDigestMismatch = DaemonClientError(
        code: "protocol.portfolio-digest-mismatch",
        message: "The portfolio source digest does not match its contents.", retryable: false)
    static let studioSnapshotDigestMismatch = DaemonClientError(
        code: "protocol.studio-snapshot-digest-mismatch",
        message: "The studio snapshot source digest does not match its contents.", retryable: false)
    static let roomParticipantsDigestMismatch = DaemonClientError(
        code: "protocol.room-participants-digest-mismatch",
        message: "The room participants catalog source digest does not match its contents.", retryable: false)
}
