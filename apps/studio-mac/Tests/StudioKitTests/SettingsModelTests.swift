import Foundation
@testable import StudioKit
import XCTest

/// `SettingsModel` (Wave 9a) against `FakeDaemonServer`: the three-op load (`provider.list` +
/// `provider.health` + `settings.get`), the mutation round trips (`upsertProvider`/`removeProvider`/
/// `setCredential`/`makeDefault`), and the honest per-row error/busy tracking a daemon refusal
/// surfaces — mirroring `RoomsModelTests`'s fake-server dispatch style.
@MainActor
final class SettingsModelTests: XCTestCase {
    private let token = try! AuthorizationToken(validating: "studio-test-token-0123456789abcdefghijklmnop")

    private func makeModel(_ server: FakeDaemonServer) throws -> SettingsModel {
        let client = try DaemonClient(configuration: .init(socketPath: server.socketPath, authorization: token, timeout: .seconds(5)))
        return SettingsModel(client: client)
    }

    /// A remote refusal to script for one operation — built against the real per-request `requestId`
    /// (not a fixed placeholder: `CommandResponse.requestId` is a validated `RequestID`, so a
    /// hardcoded stand-in fails to decode as anything other than an honest `protocol.invalid-response`,
    /// masking the failure this override exists to script).
    private struct Refusal { var code: String; var message: String; var retryable: Bool }

    /// Dispatches every `provider.*`/`settings.*` operation to its recorded Wave 8 fixture, mirroring
    /// `ProviderClientTests.fixtureDispatchingServer()`; `overrides` replaces one operation's fixture
    /// reply with a scripted daemon refusal instead.
    private func fixtureServer(overrides: [String: Refusal] = [:]) throws -> FakeDaemonServer {
        try FakeDaemonServer { frame, _ in
            let requestId = frame["requestId"]?.stringValue ?? ""
            let operation = frame["request"]?["operation"]?.stringValue ?? ""
            if let refusal = overrides[operation] {
                return .reply(WireResponse.failure(requestId: requestId, code: refusal.code, message: refusal.message, retryable: refusal.retryable))
            }
            let file: String
            switch operation {
            case "provider.list": file = "provider-list.response.json"
            case "provider.health": file = "provider-health.response.json"
            case "settings.get": file = "settings-get-set.response.json"
            case "provider.upsert": file = "provider-upsert.response.json"
            case "provider.remove": file = "provider-remove.response.json"
            case "provider.credential.set": file = "provider-credential-set.response.json"
            case "settings.set": file = "settings-set.response.json"
            default:
                return .reply(WireResponse.failure(requestId: requestId, code: "protocol.unsupported-operation", message: operation, retryable: false))
            }
            return .reply(try! WireResponse.fixture(file, requestId: requestId))
        }
    }

    // MARK: load()

    func testLoadReadsProvidersHealthAndDefaultTogether() async throws {
        let server = try fixtureServer()
        defer { server.stop() }
        let model = try makeModel(server)
        XCTAssertTrue(model.providers.isEmpty, "nil-ish until actually read")

        await model.load()

        XCTAssertEqual(model.providers.count, 5)
        XCTAssertNil(model.providersError)
        XCTAssertEqual(model.health.count, 4)
        XCTAssertEqual(model.health[RoomProvider(unchecked: "codex")]?.status, .ok)
        XCTAssertEqual(model.health[RoomProvider(unchecked: "openrouter-fast")]?.status, .blocked)
        XCTAssertNil(model.healthError)
        XCTAssertEqual(model.defaultProviderKey?.rawValue, "codex")
        XCTAssertNil(model.defaultError)
        XCTAssertFalse(model.isLoadingProviders)
        XCTAssertFalse(model.isLoadingHealth)
        XCTAssertFalse(model.isLoadingDefault)

        let operations = server.frames.compactMap { $0["request"]?["operation"]?.stringValue }
        XCTAssertEqual(operations, ["provider.list", "provider.health", "settings.get"])
    }

    func testLoadKeepsPerOperationErrorsIndependently() async throws {
        let server = try fixtureServer(overrides: [
            "provider.health": Refusal(code: "test.unavailable", message: "health is down", retryable: true),
        ])
        defer { server.stop() }
        let model = try makeModel(server)
        await model.load()
        XCTAssertEqual(model.providers.count, 5, "a failing health probe must not blank the provider list")
        XCTAssertTrue(model.health.isEmpty)
        XCTAssertEqual(model.healthError, "[daemon] test.unavailable: health is down (retryable)")
        XCTAssertEqual(model.defaultProviderKey?.rawValue, "codex")
    }

    func testLoadIsANoOpWithoutADaemon() async {
        let model = SettingsModel(client: nil)
        await model.load()
        XCTAssertTrue(model.providers.isEmpty)
        XCTAssertNil(model.providersError)
    }

    // MARK: upsertProvider

    func testUpsertProviderRefreshesTheListOnSuccess() async throws {
        let server = try fixtureServer()
        defer { server.stop() }
        let model = try makeModel(server)
        let spec = ProviderUpsertSpec(key: try RoomProvider("openrouter-batch"), family: .openrouter,
                                      model: "meta-llama/llama-3.3-70b", displayName: "OpenRouter — batch")

        let result = await model.upsertProvider(spec)

        guard case .success(let instance) = result else { return XCTFail("expected the upsert to succeed") }
        XCTAssertEqual(instance.key.rawValue, "openrouter-batch")
        // upsertProvider() re-reads provider.list to refresh the roster.
        let operations = server.frames.compactMap { $0["request"]?["operation"]?.stringValue }
        XCTAssertEqual(operations, ["provider.upsert", "provider.list"])
        XCTAssertEqual(model.providers.count, 5, "the fixture provider.list stays the roster of record in this fake")
    }

    func testUpsertProviderRefusalIsSurfacedHonestly() async throws {
        let server = try fixtureServer(overrides: [
            "provider.upsert": Refusal(code: "provider.family-requires-local-configuration",
                                       message: "A new codex instance cannot be created over the wire.", retryable: false),
        ])
        defer { server.stop() }
        let model = try makeModel(server)
        let spec = ProviderUpsertSpec(key: try RoomProvider("codex"), family: .codex, model: "gpt-5-codex", displayName: "Codex")

        let result = await model.upsertProvider(spec)

        guard case .failure(let error) = result else { return XCTFail("expected the daemon's refusal") }
        XCTAssertEqual(error.description, "[daemon] provider.family-requires-local-configuration: A new codex instance cannot be created over the wire.")
        XCTAssertTrue(model.providers.isEmpty, "a failed upsert never refreshes the list")
    }

    // MARK: removeProvider

    func testRemoveProviderClearsHealthAndRefreshesTheList() async throws {
        let server = try fixtureServer()
        defer { server.stop() }
        let model = try makeModel(server)
        await model.load()
        let key = try RoomProvider("openrouter-fast")
        XCTAssertNotNil(model.health[key])

        let result = await model.removeProvider(key)

        guard case .success = result else { return XCTFail("expected the remove to succeed") }
        XCTAssertNil(model.health[key], "a removed instance's stale health is dropped immediately")
        XCTAssertNil(model.rowErrors[key])
        XCTAssertFalse(model.busyKeys.contains(key), "busyKeys clears once the mutation settles")
        let operations = server.frames.compactMap { $0["request"]?["operation"]?.stringValue }
        XCTAssertEqual(operations.suffix(2), ["provider.remove", "provider.list"])
    }

    func testRemoveProviderFailureIsKeptPerKeyNotSwallowed() async throws {
        let server = try fixtureServer(overrides: [
            "provider.remove": Refusal(code: "provider.not-found", message: "No provider is configured for key \"ghost\".", retryable: false),
        ])
        defer { server.stop() }
        let model = try makeModel(server)
        let key = try RoomProvider("ghost")

        let result = await model.removeProvider(key)

        guard case .failure = result else { return XCTFail("expected the daemon's refusal") }
        XCTAssertEqual(model.rowErrors[key], "[daemon] provider.not-found: No provider is configured for key \"ghost\".")
        XCTAssertFalse(model.busyKeys.contains(key))
    }

    // MARK: setCredential

    func testSetCredentialNeverRetainsTheSecretAndRefreshesHealthForThatInstance() async throws {
        let healthAfterCredential: JSONValue = [
            "operation": "provider.health",
            "reports": [[
                "key": "openrouter-fast",
                "report": ["status": "ok", "detail": .null, "latencyMs": 12, "version": .null],
            ]],
        ]
        // Thread-safe call counter (the responder runs off-main on `FakeDaemonServer`'s own queue —
        // mirrors `StudioStoreTests`'s lock-guarded `Flag`).
        final class Counter: @unchecked Sendable {
            private let lock = NSLock()
            private var value = 0
            func increment() -> Int { lock.withLock { value += 1; return value } }
            var current: Int { lock.withLock { value } }
        }
        let healthCalls = Counter()
        // A stateful health responder: the per-instance probe issued by `setCredential` (payload.key
        // != null) answers "now healthy"; the full `load()` probe (payload.key == null) is never
        // issued in this test, so any shape would do there.
        let statefulServer = try FakeDaemonServer { frame, _ in
            let requestId = frame["requestId"]?.stringValue ?? ""
            let operation = frame["request"]?["operation"]?.stringValue ?? ""
            switch operation {
            case "provider.credential.set":
                return .reply(try! WireResponse.fixture("provider-credential-set.response.json", requestId: requestId))
            case "provider.list":
                return .reply(try! WireResponse.fixture("provider-list.response.json", requestId: requestId))
            case "provider.health":
                _ = healthCalls.increment()
                return .reply(WireResponse.success(requestId: requestId, result: healthAfterCredential))
            default:
                return .reply(WireResponse.failure(requestId: requestId, code: "protocol.unsupported-operation", message: operation, retryable: false))
            }
        }
        let model = try makeModel(statefulServer)
        defer { statefulServer.stop() }
        let key = try RoomProvider("openrouter-fast")

        let result = await model.setCredential(key, secret: "sk-test-do-not-log-or-retain")

        guard case .success(let reference) = result else { return XCTFail("expected the credential set to succeed") }
        XCTAssertEqual(reference.account, "openrouter-fast")
        XCTAssertEqual(model.health[key]?.status, .ok, "health was re-probed for just this instance after the set")
        XCTAssertEqual(healthCalls.current, 1)
        let lastHealthPayload = try XCTUnwrap(statefulServer.frames.last { $0["request"]?["operation"]?.stringValue == "provider.health" }?["request"]?["payload"])
        XCTAssertEqual(lastHealthPayload["key"]?.stringValue, "openrouter-fast", "a single-instance probe, not a blanket re-probe of every instance")
        XCTAssertNil(model.rowErrors[key])
        XCTAssertFalse(model.busyKeys.contains(key))

        // The secret itself never appears anywhere the model or the wire retains: not in an error
        // string (there is none here), and the only response field is a reference (see
        // `ProviderClientTests.testProviderCredentialSetNeverEchoesTheSecretOnlyTheReference`).
        let credentialFrame = try XCTUnwrap(statefulServer.frames.first { $0["request"]?["operation"]?.stringValue == "provider.credential.set" })
        XCTAssertEqual(credentialFrame["request"]?["payload"]?["secret"]?.stringValue, "sk-test-do-not-log-or-retain",
                       "sent once, on the wire, exactly where it belongs — never anywhere else")
    }

    func testSetCredentialFailureIsKeptPerKey() async throws {
        let server = try fixtureServer(overrides: [
            "provider.credential.set": Refusal(code: "provider.credential-store-unverified",
                                               message: "The credential could not be read back.", retryable: true),
        ])
        defer { server.stop() }
        let model = try makeModel(server)
        let key = try RoomProvider("openrouter-fast")

        let result = await model.setCredential(key, secret: "sk-anything")

        guard case .failure = result else { return XCTFail("expected the daemon's refusal") }
        XCTAssertEqual(model.rowErrors[key], "[daemon] provider.credential-store-unverified: The credential could not be read back. (retryable)")
        XCTAssertFalse(model.busyKeys.contains(key))
    }

    // MARK: makeDefault

    func testMakeDefaultUpdatesTheStoredDefault() async throws {
        let server = try fixtureServer()
        defer { server.stop() }
        let model = try makeModel(server)
        XCTAssertNil(model.defaultProviderKey)

        let result = await model.makeDefault(try RoomProvider("codex"))

        guard case .success = result else { return XCTFail("expected the default to be set") }
        XCTAssertEqual(model.defaultProviderKey?.rawValue, "codex")
        let payload = try XCTUnwrap(server.frames.first?["request"]?["payload"])
        XCTAssertEqual(payload["key"]?.stringValue, "default-provider")
        XCTAssertEqual(payload["value"]?.stringValue, "codex")
    }

    /// A daemon that refuses the value (not a live catalog instance key, per `settings.ts`'s
    /// validation) surfaces its refusal honestly in `rowErrors`, exactly like every other mutation —
    /// never silently ignored, never a fabricated success.
    func testMakeDefaultValidationRefusalIsSurfacedHonestly() async throws {
        let server = try fixtureServer(overrides: [
            "settings.set": Refusal(code: "settings.invalid-value",
                                    message: "\"ghost\" is not a configured provider instance.", retryable: false),
        ])
        defer { server.stop() }
        let model = try makeModel(server)
        let key = try RoomProvider("ghost")

        let result = await model.makeDefault(key)

        guard case .failure = result else { return XCTFail("expected the daemon's refusal") }
        XCTAssertNil(model.defaultProviderKey, "a refused set must not be adopted locally")
        XCTAssertEqual(model.rowErrors[key], "[daemon] settings.invalid-value: \"ghost\" is not a configured provider instance.")
        XCTAssertFalse(model.busyKeys.contains(key))
    }
}
