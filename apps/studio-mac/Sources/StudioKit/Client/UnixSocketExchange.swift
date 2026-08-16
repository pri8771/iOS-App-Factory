import Foundation
import Network

// MARK: - ExchangeSession
//
// One request frame → one connection → read until the peer half-closes. Mirrors the Node client's
// `#exchange`: the server writes exactly one response line then ends the stream, so "complete" is the
// EOF, and anything after the first newline must be whitespace (checked by the caller).
//
// The mutable state is guarded by a lock because Network.framework calls back on its own queue while
// the owning task may cancel, time out, or close the client concurrently.

final class ExchangeSession: @unchecked Sendable {
    private let lock = NSLock()
    private let socketPath: String
    private let queue: DispatchQueue
    private let frame: Data
    private let maxResponseBytes: Int

    private var connection: NWConnection?
    private var continuation: CheckedContinuation<Data, any Error>?
    private var timeoutTask: Task<Void, Never>?
    private var buffer = Data()
    private var dispatched = false
    private var settled = false

    init(socketPath: String, queue: DispatchQueue, frame: Data, maxResponseBytes: Int) {
        self.socketPath = socketPath
        self.queue = queue
        self.frame = frame
        self.maxResponseBytes = maxResponseBytes
    }

    /// Sends the frame and returns every byte the peer wrote before EOF.
    func run(timeout: Duration) async throws -> Data {
        try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Data, any Error>) in
                start(continuation: continuation, timeout: timeout)
            }
        } onCancel: {
            cancelByCaller()
        }
    }

    private func start(continuation: CheckedContinuation<Data, any Error>, timeout: Duration) {
        let connection = NWConnection(to: .unix(path: socketPath), using: .tcp)
        lock.lock()
        self.continuation = continuation
        self.connection = connection
        lock.unlock()

        timeoutTask = Task { [weak self] in
            try? await Task.sleep(for: timeout)
            guard !Task.isCancelled else { return }
            self?.finish(.failure(DaemonClientError.timeout))
        }

        connection.stateUpdateHandler = { [weak self] state in
            guard let self else { return }
            switch state {
            case .ready:
                self.markDispatched()
                connection.send(content: self.frame, completion: .contentProcessed { [weak self] error in
                    if error != nil {
                        self?.finish(.failure(DaemonClientError.connectionFailed))
                    }
                })
                self.receiveNext(on: connection)
            case .failed:
                self.finish(.failure(DaemonClientError.connectionFailed))
            case .waiting:
                // A Unix socket that is not there now will not appear by waiting.
                self.finish(.failure(DaemonClientError.connectionFailed))
            case .cancelled:
                self.finish(.failure(DaemonClientError.connectionFailed))
            default:
                break
            }
        }
        connection.start(queue: queue)
    }

    private func receiveNext(on connection: NWConnection) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 1 << 16) { [weak self] content, _, isComplete, error in
            guard let self else { return }
            var overflow = false
            self.lock.lock()
            if let content { self.buffer.append(content) }
            if self.buffer.count > self.maxResponseBytes { overflow = true }
            let snapshot = self.buffer
            self.lock.unlock()
            if overflow {
                self.finish(.failure(DaemonClientError.responseTooLarge))
                return
            }
            if error != nil {
                self.finish(.failure(DaemonClientError.connectionFailed))
                return
            }
            if isComplete {
                self.finish(.success(snapshot))
                return
            }
            self.receiveNext(on: connection)
        }
    }

    private func markDispatched() {
        lock.lock()
        dispatched = true
        lock.unlock()
    }

    private var isDispatched: Bool {
        lock.lock()
        defer { lock.unlock() }
        return dispatched
    }

    /// The owning task was cancelled.
    func cancelByCaller() {
        finish(.failure(isDispatched ? DaemonClientError.cancelledAfterDispatch : DaemonClientError.cancelled))
    }

    /// The client is closing.
    func cancelByClose() {
        finish(.failure(isDispatched ? DaemonClientError.closedAfterDispatch : DaemonClientError.closed))
    }

    private func finish(_ result: Result<Data, any Error>) {
        lock.lock()
        guard !settled, let continuation else {
            lock.unlock()
            return
        }
        settled = true
        self.continuation = nil
        let connection = self.connection
        let timeoutTask = self.timeoutTask
        self.timeoutTask = nil
        lock.unlock()
        timeoutTask?.cancel()
        connection?.stateUpdateHandler = nil
        connection?.cancel()
        continuation.resume(with: result)
    }
}
