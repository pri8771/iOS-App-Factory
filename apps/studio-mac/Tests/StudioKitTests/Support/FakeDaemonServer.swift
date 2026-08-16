import Foundation
import Network
@testable import StudioKit

/// A scripted stand-in for `startUnixCommandServer`: listens on a Unix socket, reads one request line
/// per connection, hands the parsed frame to `respond`, writes whatever bytes come back, and
/// half-closes — exactly the daemon's frame discipline. Used to prove the client without a daemon.
final class FakeDaemonServer: @unchecked Sendable {
    typealias Responder = @Sendable (_ frame: JSONValue, _ rawLine: Data) -> Behaviour

    enum Behaviour: Sendable {
        /// Write these bytes verbatim, then end the stream.
        case reply(Data)
        /// End the stream without writing anything.
        case closeSilently
        /// Never answer (the client should time out).
        case hang
    }

    let socketPath: String
    private let queue = DispatchQueue(label: "studio.fake-daemon")
    private let listener: NWListener
    private let responder: Responder
    private let lock = NSLock()
    private var connections: [NWConnection] = []
    private(set) var receivedFrames: [JSONValue] = []

    init(responder: @escaping Responder) throws {
        // Unix socket paths are capped at ~100 bytes; the sandboxed temp dir is short enough.
        socketPath = NSTemporaryDirectory() + "afs-" + UUID().uuidString.lowercased().prefix(8) + ".sock"
        unlink(socketPath)
        let parameters = NWParameters.tcp
        parameters.requiredLocalEndpoint = .unix(path: socketPath)
        listener = try NWListener(using: parameters)
        self.responder = responder
        listener.newConnectionHandler = { [weak self] connection in self?.accept(connection) }
        let ready = DispatchSemaphore(value: 0)
        listener.stateUpdateHandler = { state in
            if case .ready = state { ready.signal() }
            if case .failed = state { ready.signal() }
        }
        listener.start(queue: queue)
        _ = ready.wait(timeout: .now() + 5)
    }

    deinit { stop() }

    func stop() {
        listener.cancel()
        lock.lock()
        let open = connections
        connections.removeAll()
        lock.unlock()
        open.forEach { $0.cancel() }
        unlink(socketPath)
    }

    var frames: [JSONValue] {
        lock.lock()
        defer { lock.unlock() }
        return receivedFrames
    }

    private func accept(_ connection: NWConnection) {
        lock.lock()
        connections.append(connection)
        lock.unlock()
        connection.start(queue: queue)
        readLine(connection, buffer: Data())
    }

    private func readLine(_ connection: NWConnection, buffer: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 1 << 16) { [weak self] content, _, isComplete, error in
            guard let self else { return }
            var buffer = buffer
            if let content { buffer.append(content) }
            if let newline = buffer.firstIndex(of: 0x0A) {
                let line = buffer[buffer.startIndex..<newline]
                let frame = (try? JSONValue.parse(line)) ?? .null
                self.lock.lock()
                self.receivedFrames.append(frame)
                self.lock.unlock()
                switch self.responder(frame, Data(line)) {
                case .reply(let data):
                    connection.send(content: data, contentContext: .finalMessage, isComplete: true,
                                    completion: .contentProcessed { _ in
                                        // Give the peer a moment to observe EOF, then release the socket.
                                        self.queue.asyncAfter(deadline: .now() + 0.2) { connection.cancel() }
                                    })
                case .closeSilently:
                    connection.send(content: nil, contentContext: .finalMessage, isComplete: true,
                                    completion: .contentProcessed { _ in
                                        self.queue.asyncAfter(deadline: .now() + 0.2) { connection.cancel() }
                                    })
                case .hang:
                    break
                }
                return
            }
            if isComplete || error != nil {
                connection.cancel()
                return
            }
            self.readLine(connection, buffer: buffer)
        }
    }
}

// MARK: - Response builders

enum WireResponse {
    static func success(requestId: String, result: JSONValue) -> Data {
        let value: JSONValue = ["protocolVersion": 1, "requestId": .string(requestId), "ok": true, "result": result]
        return Data((CanonicalJSON.serialize(value) + "\n").utf8)
    }

    static func failure(requestId: String?, code: String, message: String, retryable: Bool) -> Data {
        let value: JSONValue = [
            "protocolVersion": 1,
            "requestId": requestId.map { .string($0) } ?? .null,
            "ok": false,
            "error": ["code": .string(code), "message": .string(message), "retryable": .bool(retryable)],
        ]
        return Data((CanonicalJSON.serialize(value) + "\n").utf8)
    }

    /// The `result` object of a recorded `*.response.json` fixture, re-addressed to `requestId`.
    static func fixture(_ name: String, requestId: String) throws -> Data {
        let response = try JSONValue.parse(Fixtures.data(name))
        guard let result = response["result"] else { throw NSError(domain: "WireResponse", code: 1) }
        return success(requestId: requestId, result: result)
    }
}
