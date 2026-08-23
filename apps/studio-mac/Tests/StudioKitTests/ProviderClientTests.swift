import Foundation
@testable import StudioKit
import XCTest

/// Wave 8's wire layer: `provider.*`, `settings.*`, `usage.summary`, `signal.*`/`insight.list`, and
/// `room.update` — decode tests (every fixture recorded through the real contracts, mirroring
/// `Phase4ModelDecodingTests`) plus `DaemonClient` round trips against `FakeDaemonServer` (mirroring
/// `Phase4DaemonClientTests`), combined into one file per the Wave 8 plan's "new ProviderClientTests
/// or extend the Phase4-style suites" convention.
final class ProviderClientTests: XCTestCase {
    private let token = try! AuthorizationToken(validating: "studio-test-token-0123456789abcdefghijklmnop")

    private func decode(_ fixture: String) throws -> CommandResponse {
        try JSONDecoder().decode(CommandResponse.self, from: Fixtures.data(fixture))
    }

    private func makeClient(_ server: FakeDaemonServer, timeout: Duration = .seconds(5)) throws -> DaemonClient {
        try DaemonClient(configuration: .init(socketPath: server.socketPath, authorization: token,
                                              origin: .dashboard, timeout: timeout))
    }

    /// Dispatches by `request.operation` to a same-named fixture (`provider.list` ->
    /// "provider-list.response.json"), mirroring `Phase4DaemonClientTests`'s dispatcher.
    private func fixtureDispatchingServer() throws -> FakeDaemonServer {
        try FakeDaemonServer { frame, _ in
            let requestId = frame["requestId"]?.stringValue ?? ""
            let operation = frame["request"]?["operation"]?.stringValue ?? ""
            let fixtureName = operation.replacingOccurrences(of: ".", with: "-") + ".response.json"
            return .reply(try! WireResponse.fixture(fixtureName, requestId: requestId))
        }
    }

    private func namedFixtureServer(_ name: String) throws -> FakeDaemonServer {
        try FakeDaemonServer { frame, _ in
            .reply(try! WireResponse.fixture(name, requestId: frame["requestId"]?.stringValue ?? ""))
        }
    }

    // MARK: provider.list / .upsert / .remove / .credential.set / .health — decode

    func testProviderListDecodesFiveInstancesWithMixedCredentials() throws {
        guard case .success(_, .providerList(let providers)) = try decode("provider-list.response.json") else {
            return XCTFail("expected provider.list")
        }
        XCTAssertEqual(providers.count, 5)
        XCTAssertEqual(providers.map(\.key.rawValue), ["codex", "claude", "ollama", "openrouter-fast", "openrouter-deep"])
        XCTAssertEqual(providers.map(\.family), [.codex, .claude, .ollama, .openrouter, .openrouter])
        XCTAssertNil(providers[0].credentialReference, "codex authenticates via CLI session, never a Keychain reference")
        let openrouterFast = providers[3]
        XCTAssertEqual(openrouterFast.credentialReference?.kind, CredentialKindMacOSKeychain())
        XCTAssertEqual(openrouterFast.credentialReference?.service, "app-factory-provider")
        XCTAssertEqual(openrouterFast.credentialReference?.account, "openrouter-fast")
        XCTAssertNil(providers[4].credentialReference, "openrouter-deep is configured but not yet keyed")
        // maxOutputTokens: absent from codex/claude (no such config field for those families, the
        // schema's own default fills in an honest null), explicit on ollama/openrouter-fast, and the
        // honest "never configured" null on openrouter-deep -- never a fabricated 150.
        XCTAssertNil(providers[0].maxOutputTokens, "codex has no per-instance output-length knob")
        XCTAssertNil(providers[1].maxOutputTokens, "claude has no per-instance output-length knob")
        XCTAssertEqual(providers[2].maxOutputTokens, 1_000)
        XCTAssertEqual(openrouterFast.maxOutputTokens, 500)
        XCTAssertNil(providers[4].maxOutputTokens, "never explicitly configured")
    }

    func testProviderUpsertResultCarriesCreatedAndDigest() throws {
        guard case .success(_, .providerUpsert(let result)) = try decode("provider-upsert.response.json") else {
            return XCTFail("expected provider.upsert")
        }
        XCTAssertTrue(result.created)
        XCTAssertEqual(result.instance.key.rawValue, "openrouter-batch")
        XCTAssertTrue(result.digest.rawValue.hasPrefix("sha256:"))
        // A brand-new instance created without an explicit maxOutputTokens defaults to 1000
        // daemon-side (never the bare adapter fallback of 150) -- see provider-participants-config.ts.
        XCTAssertEqual(result.instance.maxOutputTokens, 1_000)
    }

    func testProviderRemoveResult() throws {
        guard case .success(_, .providerRemove(let result)) = try decode("provider-remove.response.json") else {
            return XCTFail("expected provider.remove")
        }
        XCTAssertTrue(result.removed)
        XCTAssertTrue(result.digest.rawValue.hasPrefix("sha256:"))
    }

    func testProviderCredentialSetNeverEchoesTheSecretOnlyTheReference() throws {
        guard case .success(_, .providerCredentialSet(let result)) = try decode("provider-credential-set.response.json") else {
            return XCTFail("expected provider.credential.set")
        }
        XCTAssertEqual(result.key.rawValue, "openrouter-fast")
        XCTAssertEqual(result.credentialReference.account, "openrouter-fast")
        // The wire shape itself has no field a secret could ride in — see `ProviderCredentialSetResult`.
        XCTAssertEqual(Set(Mirror(reflecting: result).children.map { $0.label ?? "" }), ["key", "credentialReference"])
    }

    func testProviderHealthDecodesEveryStatusHonestly() throws {
        guard case .success(_, .providerHealth(let reports)) = try decode("provider-health.response.json") else {
            return XCTFail("expected provider.health")
        }
        XCTAssertEqual(reports.map(\.report.status), [.ok, .unreachable, .notConfigured, .blocked])
        XCTAssertEqual(reports[0].report.latencyMs, 340)
        XCTAssertEqual(reports[0].report.version, "0.42.0")
        XCTAssertNil(reports[1].report.latencyMs, "unreachable never fabricates a latency")
        XCTAssertEqual(reports[3].report.detail, "containment-attestation-missing")
    }

    // MARK: settings.get / .set — decode

    func testSettingsGetUnsetIsHonestlyNull() throws {
        guard case .success(_, .settingsGet(let entry)) = try decode("settings-get-unset.response.json") else {
            return XCTFail("expected settings.get")
        }
        XCTAssertNil(entry.value)
        XCTAssertNil(entry.updatedAt)
    }

    func testSettingsGetReturnsTheStoredDefaultProvider() throws {
        guard case .success(_, .settingsGet(let entry)) = try decode("settings-get-set.response.json") else {
            return XCTFail("expected settings.get")
        }
        XCTAssertEqual(entry.key, .defaultProvider)
        XCTAssertEqual(entry.value?.rawValue, "codex")
        XCTAssertNotNil(entry.updatedAt)
    }

    func testSettingsSetResult() throws {
        guard case .success(_, .settingsSet(let entry)) = try decode("settings-set.response.json") else {
            return XCTFail("expected settings.set")
        }
        XCTAssertEqual(entry.value?.rawValue, "codex")
    }

    // MARK: usage.summary — decode, null-honest sums

    func testUsageSummaryRowsAreNullHonestNeverAFabricatedZero() throws {
        guard case .success(_, .usageSummary(let summary)) = try decode("usage-summary.response.json") else {
            return XCTFail("expected usage.summary")
        }
        XCTAssertEqual(summary.sinceDays, 7)
        XCTAssertEqual(summary.rows.count, 3)
        let claude = summary.rows[0]
        XCTAssertEqual(claude.inputTokens, 12_400)
        XCTAssertEqual(claude.costUsdMicros, 184_500)
        XCTAssertEqual(claude.unreportedCount, 0)
        let openrouter = summary.rows[1]
        XCTAssertNil(openrouter.inputTokens, "OpenRouter reports completion tokens only")
        XCTAssertEqual(openrouter.outputTokens, 5_600)
        XCTAssertNil(openrouter.costUsdMicros)
        let codex = summary.rows[2]
        XCTAssertNil(codex.inputTokens)
        XCTAssertNil(codex.outputTokens)
        XCTAssertNil(codex.costUsdMicros)
        XCTAssertEqual(codex.unreportedCount, 4, "codex hardcodes 0 today, so the ledger honestly reports nothing rather than a fake number")
    }

    // MARK: signal.* / insight.list — decode

    func testSignalCreateResultStartsAtZeroChecks() throws {
        guard case .success(_, .signalCreate(let signal)) = try decode("signal-create.response.json") else {
            return XCTFail("expected signal.create")
        }
        XCTAssertEqual(signal.name, "OpenRouter pricing changes")
        XCTAssertEqual(signal.checkCount, 0)
        XCTAssertNil(signal.lastCheckedAt)
        XCTAssertEqual(signal.checkIntervalMinutes, 60)
    }

    func testSignalListReturnsAScheduledAndAManualSignal() throws {
        guard case .success(_, .signalList(let signals)) = try decode("signal-list.response.json") else {
            return XCTFail("expected signal.list")
        }
        XCTAssertEqual(signals.count, 2)
        XCTAssertEqual(signals[0].status, .active)
        XCTAssertEqual(signals[0].checkIntervalMinutes, 60)
        XCTAssertEqual(signals[1].status, .paused)
        XCTAssertNil(signals[1].checkIntervalMinutes, "manual-only signal")
    }

    func testSignalPauseAndResumeResults() throws {
        guard case .success(_, .signalPause(let paused)) = try decode("signal-pause.response.json") else {
            return XCTFail("expected signal.pause")
        }
        XCTAssertEqual(paused.status, .paused)
        guard case .success(_, .signalResume(let resumed)) = try decode("signal-resume.response.json") else {
            return XCTFail("expected signal.resume")
        }
        XCTAssertEqual(resumed.status, .active)
    }

    func testSignalRescheduleResult() throws {
        guard case .success(_, .signalReschedule(let signal)) = try decode("signal-reschedule.response.json") else {
            return XCTFail("expected signal.reschedule")
        }
        XCTAssertEqual(signal.checkIntervalMinutes, 120)
    }

    func testSignalRunNowFoundCarriesAnInsightWithACitation() throws {
        guard case .success(_, .signalRunNow(let result)) = try decode("signal-run-now-found.response.json") else {
            return XCTFail("expected signal.run-now")
        }
        XCTAssertEqual(result.outcome, .found)
        let insight = try XCTUnwrap(result.insight)
        XCTAssertFalse(insight.citations.isEmpty)
        XCTAssertEqual(insight.confidence, .strong)
    }

    func testSignalRunNowNothingNewCarriesNoInsight() throws {
        guard case .success(_, .signalRunNow(let result)) = try decode("signal-run-now-nothing-new.response.json") else {
            return XCTFail("expected signal.run-now")
        }
        XCTAssertEqual(result.outcome, .nothingNew)
        XCTAssertNil(result.insight)
    }

    func testSignalRunNowScoutFailedCarriesTheTypedCodeAndMessage() throws {
        guard case .success(_, .signalRunNow(let result)) = try decode("signal-run-now-scout-failed.response.json") else {
            return XCTFail("expected signal.run-now")
        }
        guard case .scoutFailed(let code, let message) = result.outcome else {
            return XCTFail("expected a scout-failed outcome")
        }
        XCTAssertEqual(code, .scoutError)
        XCTAssertFalse(message.isEmpty)
        XCTAssertNil(result.insight)
    }

    func testInsightListReturnsBothRecordedInsights() throws {
        guard case .success(_, .insightList(let insights)) = try decode("insight-list.response.json") else {
            return XCTFail("expected insight.list")
        }
        XCTAssertEqual(insights.count, 2)
        XCTAssertEqual(insights.map(\.confidence), [.strong, .moderate])
    }

    // MARK: room.update / direct-flavor room.create — decode

    func testRoomUpdateResultCarriesThePatchedRoom() throws {
        guard case .success(_, .roomUpdate(let room)) = try decode("room-update.response.json") else {
            return XCTFail("expected room.update")
        }
        XCTAssertEqual(room.title, "Studio launch review — GA")
        XCTAssertTrue(room.unattendedEnabled)
        XCTAssertEqual(room.flavor, .room)
        XCTAssertNil(room.archivedAt)
    }

    func testDirectFlavorRoomCreateResult() throws {
        guard case .success(_, .roomCreate(let result)) = try decode("room-create-direct.response.json") else {
            return XCTFail("expected room.create")
        }
        XCTAssertEqual(result.room.flavor, .direct)
        XCTAssertTrue(result.room.isDirect)
        XCTAssertEqual(result.room.participants.count, 1)
    }

    // MARK: Payload encoding — nullable vs optional discipline

    func testProviderUpsertPayloadEncodesNullExpectedDigestExplicitly() throws {
        let spec = ProviderUpsertSpec(key: try RoomProvider("openrouter-batch"), family: .openrouter,
                                      model: "meta-llama/llama-3.3-70b", displayName: "OpenRouter — batch")
        let payload = ProviderUpsertPayload(instance: spec, expectedDigest: nil)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let text = String(decoding: try encoder.encode(payload), as: UTF8.self)
        XCTAssertTrue(text.contains(#""expectedDigest":null"#), text)
        // maxOutputTokens is nullable, not optional, on the wire -- omitted by the caller here, it
        // must still be encoded explicitly as null ("no preference"), never dropped from the payload.
        XCTAssertTrue(text.contains(#""maxOutputTokens":null"#), text)
    }

    func testProviderUpsertSpecEncodesAnExplicitMaxOutputTokens() throws {
        let spec = ProviderUpsertSpec(key: try RoomProvider("ollama-fast"), family: .ollama, model: "qwen2.5:3b",
                                      displayName: "Fast", maxOutputTokens: 1_000)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let text = String(decoding: try encoder.encode(spec), as: UTF8.self)
        XCTAssertEqual(text, #"{"displayName":"Fast","family":"ollama","key":"ollama-fast","maxOutputTokens":1000,"model":"qwen2.5:3b"}"#)
    }

    func testProviderInstanceEncodesMaxOutputTokensExplicitlyEvenWhenNil() throws {
        let instance = ProviderInstance(key: try RoomProvider("codex"), family: .codex, model: "gpt-5-codex",
                                        displayName: "Codex", credentialReference: nil)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let text = String(decoding: try encoder.encode(instance), as: UTF8.self)
        XCTAssertTrue(text.contains(#""maxOutputTokens":null"#), text)
    }

    func testProviderHealthPayloadEncodesNullKeyExplicitly() throws {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let text = String(decoding: try encoder.encode(ProviderHealthPayload(key: nil)), as: UTF8.self)
        XCTAssertEqual(text, #"{"key":null}"#)
    }

    func testSignalReschedulePayloadEncodesNullIntervalExplicitly() throws {
        let payload = SignalReschedulePayload(signalId: SignalID(unchecked: "90000001-0000-4000-8000-000000000001"), checkIntervalMinutes: nil)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let text = String(decoding: try encoder.encode(payload), as: UTF8.self)
        XCTAssertEqual(text, #"{"checkIntervalMinutes":null,"signalId":"90000001-0000-4000-8000-000000000001"}"#)
    }

    /// Deliberately the opposite discipline from every other payload above: `RoomUpdatePatch`'s
    /// fields are wire-`optional()`, not `nullable()`, so an unset field must be OMITTED, never sent
    /// as an explicit null.
    func testRoomUpdatePatchOmitsUnsetFieldsRatherThanEncodingNull() throws {
        let patch = RoomUpdatePatch(title: "New title")
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let text = String(decoding: try encoder.encode(patch), as: UTF8.self)
        XCTAssertEqual(text, #"{"title":"New title"}"#, "every other field must be omitted, not null")
    }

    func testRoomCreateSpecEncodesFlavorExplicitly() throws {
        let spec = RoomCreateSpec(roomId: RoomID.generate(), title: "Quick question", projectId: nil, flavor: .direct,
                                  unattendedEnabled: false, agentCooldownEvents: 4,
                                  participants: [RoomParticipantSpec(persona: try RoomPersona("codex"), provider: try RoomProvider("codex"), displayName: "Codex")],
                                  budget: RoomBudgetPolicy(dailyCeilingTokens: 200_000, unattendedDailyCeilingTokens: 0, maxTokensPerReply: 4_000))
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let text = String(decoding: try encoder.encode(spec), as: UTF8.self)
        XCTAssertTrue(text.contains(#""flavor":"direct""#), text)
    }

    // MARK: DaemonClient round trips

    func testListProvidersSendsAnEmptyPayload() async throws {
        let server = try fixtureDispatchingServer()
        defer { server.stop() }
        let client = try makeClient(server)
        let providers = try await client.listProviders()
        XCTAssertEqual(providers.count, 5)
        let request = try XCTUnwrap(server.frames.first?["request"])
        XCTAssertEqual(request["operation"]?.stringValue, "provider.list")
        XCTAssertEqual(request["payload"], [:])
    }

    func testUpsertProviderSendsExplicitNullExpectedDigestByDefault() async throws {
        let server = try fixtureDispatchingServer()
        defer { server.stop() }
        let client = try makeClient(server)
        let spec = ProviderUpsertSpec(key: try RoomProvider("openrouter-batch"), family: .openrouter,
                                      model: "meta-llama/llama-3.3-70b", displayName: "OpenRouter — batch")
        let result = try await client.upsertProvider(spec)
        XCTAssertTrue(result.created)
        let payload = try XCTUnwrap(server.frames.first?["request"]?["payload"])
        XCTAssertEqual(payload["expectedDigest"], .null)
    }

    func testRemoveProviderRoundTrip() async throws {
        let server = try fixtureDispatchingServer()
        defer { server.stop() }
        let client = try makeClient(server)
        let result = try await client.removeProvider(key: try RoomProvider("openrouter-batch"))
        XCTAssertTrue(result.removed)
    }

    func testSetProviderCredentialSendsTheSecretAndNeverGetsItBack() async throws {
        let server = try fixtureDispatchingServer()
        defer { server.stop() }
        let client = try makeClient(server)
        let result = try await client.setProviderCredential(key: try RoomProvider("openrouter-fast"), secret: "sk-test-bare-key-do-not-log")
        XCTAssertEqual(result.key.rawValue, "openrouter-fast")
        let payload = try XCTUnwrap(server.frames.first?["request"]?["payload"])
        XCTAssertEqual(payload["secret"]?.stringValue, "sk-test-bare-key-do-not-log")
    }

    func testProviderHealthProbesASingleKeyOrEveryInstance() async throws {
        let server = try fixtureDispatchingServer()
        defer { server.stop() }
        let client = try makeClient(server)
        let reports = try await client.providerHealth()
        XCTAssertEqual(reports.count, 4)
        let payload = try XCTUnwrap(server.frames.first?["request"]?["payload"])
        XCTAssertEqual(payload["key"], .null, "key: nil probes every configured instance")
    }

    func testGetAndSetSettingRoundTrip() async throws {
        let server = try FakeDaemonServer { frame, _ in
            let requestId = frame["requestId"]?.stringValue ?? ""
            let operation = frame["request"]?["operation"]?.stringValue ?? ""
            switch operation {
            case "settings.get": return .reply(try! WireResponse.fixture("settings-get-set.response.json", requestId: requestId))
            case "settings.set": return .reply(try! WireResponse.fixture("settings-set.response.json", requestId: requestId))
            default: return .reply(WireResponse.failure(requestId: requestId, code: "protocol.unknown-operation", message: operation, retryable: false))
            }
        }
        defer { server.stop() }
        let client = try makeClient(server)
        let entry = try await client.getSetting(.defaultProvider)
        XCTAssertEqual(entry.value?.rawValue, "codex")
        let set = try await client.setSetting(.defaultProvider, value: try RoomProvider("codex"))
        XCTAssertEqual(set.value?.rawValue, "codex")
        let setPayload = try XCTUnwrap(server.frames.last?["request"]?["payload"])
        XCTAssertEqual(setPayload["key"]?.stringValue, "default-provider")
        XCTAssertEqual(setPayload["value"]?.stringValue, "codex")
    }

    func testUsageSummaryRoundTripSendsSinceDays() async throws {
        let server = try fixtureDispatchingServer()
        defer { server.stop() }
        let client = try makeClient(server)
        let summary = try await client.usageSummary(sinceDays: 7)
        XCTAssertEqual(summary.rows.count, 3)
        let payload = try XCTUnwrap(server.frames.first?["request"]?["payload"])
        XCTAssertEqual(payload["sinceDays"], 7)
    }

    func testCreateSignalSendsExplicitNullCheckIntervalByDefault() async throws {
        let server = try fixtureDispatchingServer()
        defer { server.stop() }
        let client = try makeClient(server)
        let signal = try await client.createSignal(name: "OpenRouter pricing changes",
                                                    watchDescription: "Watch for pricing changes.",
                                                    scoutProvider: try RoomProvider("openrouter-fast"))
        XCTAssertEqual(signal.name, "OpenRouter pricing changes")
        let payload = try XCTUnwrap(server.frames.first?["request"]?["payload"])
        XCTAssertEqual(payload["checkIntervalMinutes"], .null)
    }

    func testListPauseResumeSignalRoundTrip() async throws {
        let server = try FakeDaemonServer { frame, _ in
            let requestId = frame["requestId"]?.stringValue ?? ""
            let operation = frame["request"]?["operation"]?.stringValue ?? ""
            switch operation {
            case "signal.list": return .reply(try! WireResponse.fixture("signal-list.response.json", requestId: requestId))
            case "signal.pause": return .reply(try! WireResponse.fixture("signal-pause.response.json", requestId: requestId))
            case "signal.resume": return .reply(try! WireResponse.fixture("signal-resume.response.json", requestId: requestId))
            default: return .reply(WireResponse.failure(requestId: requestId, code: "protocol.unknown-operation", message: operation, retryable: false))
            }
        }
        defer { server.stop() }
        let client = try makeClient(server)
        let signals = try await client.listSignals()
        XCTAssertEqual(signals.count, 2)
        let signalId = signals[0].signalId
        let paused = try await client.pauseSignal(signalId)
        XCTAssertEqual(paused.status, .paused)
        let resumed = try await client.resumeSignal(signalId)
        XCTAssertEqual(resumed.status, .active)
        let pausePayload = try XCTUnwrap(server.frames[1]["request"]?["payload"])
        XCTAssertEqual(pausePayload["signalId"]?.stringValue, signalId.rawValue)
    }

    func testRunSignalNowRoundTrip() async throws {
        let server = try namedFixtureServer("signal-run-now-found.response.json")
        defer { server.stop() }
        let client = try makeClient(server)
        let signalId = SignalID(unchecked: "90000001-0000-4000-8000-000000000001")
        let result = try await client.runSignalNow(signalId)
        XCTAssertEqual(result.outcome, .found)
        let payload = try XCTUnwrap(server.frames.first?["request"]?["payload"])
        XCTAssertEqual(payload["signalId"]?.stringValue, signalId.rawValue)
    }

    func testRescheduleSignalRoundTrip() async throws {
        let server = try fixtureDispatchingServer()
        defer { server.stop() }
        let client = try makeClient(server)
        let signal = try await client.rescheduleSignal(SignalID(unchecked: "90000001-0000-4000-8000-000000000001"), checkIntervalMinutes: 120)
        XCTAssertEqual(signal.checkIntervalMinutes, 120)
        let payload = try XCTUnwrap(server.frames.first?["request"]?["payload"])
        XCTAssertEqual(payload["checkIntervalMinutes"], 120)
    }

    func testListInsightsRoundTrip() async throws {
        let server = try fixtureDispatchingServer()
        defer { server.stop() }
        let client = try makeClient(server)
        let insights = try await client.listInsights(signalId: SignalID(unchecked: "90000001-0000-4000-8000-000000000001"))
        XCTAssertEqual(insights.count, 2)
    }

    func testUpdateRoomOmitsUntouchedPatchFieldsOnTheWire() async throws {
        let server = try fixtureDispatchingServer()
        defer { server.stop() }
        let client = try makeClient(server)
        let roomId = RoomID(unchecked: "50000001-0000-4000-8000-000000000001")
        let room = try await client.updateRoom(roomId: roomId, expectedUpdatedAt: IsoInstant(unchecked: "2026-08-16T18:31:00.000Z"),
                                               patch: RoomUpdatePatch(unattendedEnabled: true))
        XCTAssertTrue(room.unattendedEnabled)
        let payload = try XCTUnwrap(server.frames.first?["request"]?["payload"])
        let patch = try XCTUnwrap(payload["patch"]?.objectValue)
        XCTAssertEqual(Set(patch.keys), ["unattendedEnabled"], "untouched fields must be absent, not null")
        XCTAssertEqual(payload["roomId"]?.stringValue, roomId.rawValue)
    }

    func testCreateDirectRoomSendsFlavorDirect() async throws {
        let server = try namedFixtureServer("room-create-direct.response.json")
        defer { server.stop() }
        let client = try makeClient(server)
        let spec = RoomCreateSpec(roomId: RoomID(unchecked: "50000004-0000-4000-8000-000000000004"), title: "Codex — quick question",
                                  projectId: nil, flavor: .direct, unattendedEnabled: false, agentCooldownEvents: 4,
                                  participants: [RoomParticipantSpec(persona: try RoomPersona("codex"), provider: try RoomProvider("codex"), displayName: "Codex")],
                                  budget: RoomBudgetPolicy(dailyCeilingTokens: 200_000, unattendedDailyCeilingTokens: 0, maxTokensPerReply: 4_000))
        let result = try await client.createRoom(spec)
        XCTAssertTrue(result.room.isDirect)
        let payload = try XCTUnwrap(server.frames.first?["request"]?["payload"])
        XCTAssertEqual(payload["flavor"]?.stringValue, "direct")
    }
}
