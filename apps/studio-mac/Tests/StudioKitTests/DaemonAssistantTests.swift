import Foundation
@testable import StudioKit
import XCTest

/// Chat rendering for both `AssistantAnswer` variants, the intent phrase recognizer, and a full
/// propose → confirm → execute round trip against `FakeDaemonServer` — extended here with the three
/// new `studio.assistant.*` operations alongside the phase-1 ones it already answers.
final class DaemonAssistantTests: XCTestCase {
    private let token = try! AuthorizationToken(validating: "studio-test-token-0123456789abcdefghijklmnop")

    private func context() -> AssistantContext {
        AssistantContext(link: "connected", now: IsoInstant(unchecked: "2026-08-16T22:00:00.000Z").date!)
    }

    // MARK: IntentRecognizer

    func testRecognizesScanEnrollAndApprovePhrasings() throws {
        guard case .scanProject(let path) = try XCTUnwrap(IntentRecognizer.recognize("scan /Users/example/code/hindsight")) else {
            return XCTFail("expected scan-project")
        }
        XCTAssertEqual(path.rawValue, "/Users/example/code/hindsight")

        let digest = "sha256:" + String(repeating: "12", count: 32)
        guard case .enrollProject(let planDigest, let branch) = try XCTUnwrap(IntentRecognizer.recognize("enroll \(digest) on studio/phase2")) else {
            return XCTFail("expected enroll-project")
        }
        XCTAssertEqual(planDigest.rawValue, digest)
        XCTAssertEqual(branch?.rawValue, "studio/phase2")

        let attemptId = "00000004-0000-4000-8000-000000000004"
        guard case .approveAttempt(let id, let answer) = try XCTUnwrap(IntentRecognizer.recognize("approve \(attemptId) go ahead")) else {
            return XCTFail("expected approve-attempt")
        }
        XCTAssertEqual(id.rawValue, attemptId)
        XCTAssertEqual(answer, "go ahead")
    }

    func testDoesNotRecognizeQuestionsOrMalformedIdentifiers() {
        XCTAssertNil(IntentRecognizer.recognize("how many attempts are there?"))
        XCTAssertNil(IntentRecognizer.recognize("scan relative/path"), "not an absolute path")
        XCTAssertNil(IntentRecognizer.recognize("approve not-a-uuid go ahead"))
        XCTAssertNil(IntentRecognizer.recognize("queue task foo"), "queue-task needs a full TaskSpec, not recognized from text")
    }

    // MARK: ChatModel rendering — both AssistantAnswer variants

    @MainActor
    func testAnsweredRendersCitationsAndIsNotStub() async throws {
        let chat = ChatModel()
        let citations = [AssistantCitation(kind: .attempt, id: "00000001-0000-4000-8000-000000000001")]
        let backend = AssistantBackend(
            query: { _, _ in .answer(.answered(text: "Anjali's latest attempt succeeded.", citations: citations)) },
            proposeIntent: { _, _ in .failure(AssistantBackendError("not used")) },
            executeIntent: { _ in .failure(AssistantBackendError("not used")) })
        _ = await chat.send("how is anjali", context: context(), backend: backend)
        let message = try XCTUnwrap(chat.selected?.messages.last)
        XCTAssertEqual(message.text, "Anjali's latest attempt succeeded.")
        XCTAssertEqual(message.citations, citations)
        XCTAssertFalse(message.isStub)
        XCTAssertEqual(message.provenance, .live("studio.assistant.query"))
    }

    @MainActor
    func testCannotAnswerRendersAnHonestLineWithTheReason() async throws {
        let chat = ChatModel()
        let backend = AssistantBackend(
            query: { _, _ in .answer(.cannotAnswer(reason: .noMilestoneTargetDate,
                                                    detail: "No milestone with a real target date exists yet.")) },
            proposeIntent: { _, _ in .failure(AssistantBackendError("not used")) },
            executeIntent: { _ in .failure(AssistantBackendError("not used")) })
        _ = await chat.send("when does roam ship", context: context(), backend: backend)
        let message = try XCTUnwrap(chat.selected?.messages.last)
        XCTAssertTrue(message.text.contains("No milestone with a real target date exists yet."), message.text)
        XCTAssertTrue(message.text.contains("no-milestone-target-date"), message.text)
        XCTAssertFalse(message.isStub, "a refusal is still a real, live daemon answer")
        XCTAssertTrue(message.citations.isEmpty)
    }

    @MainActor
    func testUnsupportedOrFailedQueryFallsBackToTheScriptedStub() async throws {
        let chat = ChatModel()
        for outcome: AssistantQueryOutcome in [.unsupported, .failed("timeout")] {
            let backend = AssistantBackend(
                query: { _, _ in outcome },
                proposeIntent: { _, _ in .failure(AssistantBackendError("not used")) },
                executeIntent: { _ in .failure(AssistantBackendError("not used")) })
            _ = await chat.send("is the daemon online?", context: context(), backend: backend)
            let message = try XCTUnwrap(chat.selected?.messages.last)
            XCTAssertTrue(message.isStub, "an unsupported or failed daemon call falls back to the scripted stub")
            XCTAssertFalse(message.text.isEmpty)
            XCTAssertNil(message.intentCard)
        }
    }

    // MARK: Intent round trip against FakeDaemonServer

    private func makeClient(_ server: FakeDaemonServer) throws -> DaemonClient {
        try DaemonClient(configuration: .init(socketPath: server.socketPath, authorization: token, timeout: .seconds(5)))
    }

    /// Mirrors `StudioStore.assistantBackend` closure-for-closure, over a plain `DaemonClient`, so this
    /// test proves the same wiring the app uses without needing a full `StudioStore`.
    private func backend(for client: DaemonClient) -> AssistantBackend {
        AssistantBackend(
            query: { question, projectId in
                do { return .answer(try await client.assistantQuery(AssistantQuery(question: question, projectId: projectId))) }
                catch let error as DaemonClientError where error.isUnsupportedOperation { return .unsupported }
                catch { return .failed(String(describing: error)) }
            },
            proposeIntent: { utterance, payload in
                do { return .success(try await client.proposeIntent(utterance: utterance, payload: payload)) }
                catch { return .failure(AssistantBackendError(String(describing: error))) }
            },
            executeIntent: { intent in
                do { return .success(try await client.executeIntent(intent).outcome) }
                catch { return .failure(AssistantBackendError(String(describing: error))) }
            })
    }

    @MainActor
    func testProposeConfirmExecuteRoundTripShowsTheResultingAttemptId() async throws {
        let server = try FakeDaemonServer { frame, _ in
            let requestId = frame["requestId"]?.stringValue ?? ""
            let operation = frame["request"]?["operation"]?.stringValue ?? ""
            switch operation {
            case "studio.assistant.intent.propose":
                return .reply(try! WireResponse.fixture("assistant-intent-propose.response.json", requestId: requestId))
            case "studio.assistant.intent.execute":
                return .reply(try! WireResponse.fixture("assistant-intent-execute.response.json", requestId: requestId))
            default:
                return .reply(WireResponse.failure(requestId: requestId, code: "protocol.unknown-operation", message: operation, retryable: false))
            }
        }
        defer { server.stop() }
        let client = try makeClient(server)
        let backend = self.backend(for: client)

        let chat = ChatModel()
        let attemptId = "00000004-0000-4000-8000-000000000004"
        let utterance = "approve \(attemptId) Approved — go ahead and upload."
        _ = await chat.send(utterance, context: context(), backend: backend)

        let proposed = try XCTUnwrap(chat.selected?.messages.last)
        let card = try XCTUnwrap(proposed.intentCard)
        XCTAssertEqual(card.status, .pending)
        guard case .approveAttempt(let proposedAttemptId, _) = card.intent.payload else { return XCTFail("expected approve-attempt") }
        XCTAssertEqual(proposedAttemptId.rawValue, attemptId)

        await chat.confirmIntent(proposed.id, backend: backend)
        let executed = try XCTUnwrap(chat.selected?.messages.last { $0.id == proposed.id })
        guard case .executed(let summary) = try XCTUnwrap(executed.intentCard).status else {
            return XCTFail("expected an executed outcome, got \(String(describing: executed.intentCard?.status))")
        }
        XCTAssertTrue(summary.contains(attemptId), "the resulting attempt id is shown — \(summary)")

        let operations = server.frames.compactMap { $0["request"]?["operation"]?.stringValue }
        XCTAssertEqual(operations, ["studio.assistant.intent.propose", "studio.assistant.intent.execute"])
    }

    @MainActor
    func testCancelIntentNeverCallsExecute() async throws {
        let server = try FakeDaemonServer { frame, _ in
            let requestId = frame["requestId"]?.stringValue ?? ""
            return .reply(try! WireResponse.fixture("assistant-intent-propose.response.json", requestId: requestId))
        }
        defer { server.stop() }
        let backend = self.backend(for: try makeClient(server))
        let chat = ChatModel()
        _ = await chat.send("approve 00000004-0000-4000-8000-000000000004 Approved — go ahead and upload.",
                            context: context(), backend: backend)
        let proposed = try XCTUnwrap(chat.selected?.messages.last)
        chat.cancelIntent(proposed.id)
        let cancelled = try XCTUnwrap(chat.selected?.messages.last { $0.id == proposed.id })
        XCTAssertEqual(cancelled.intentCard?.status, .cancelled)
        XCTAssertEqual(server.frames.count, 1, "propose only — cancelling never dispatches execute")
    }
}
