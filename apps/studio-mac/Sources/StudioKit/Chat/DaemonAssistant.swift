import Foundation

// MARK: - DaemonAssistant
//
// The daemon-backed corner-chat responder: `studio.assistant.query` for questions,
// `studio.assistant.intent.propose` / `.execute` for the small set of phrasings Studio itself
// recognises (mirroring the daemon's own `INTENT_PHRASE_PREFIX_V1` table in
// `apps/daemon/src/studio-command-runtime.ts` — deterministic, no LLM either side). `ChatModel`
// (ScriptedAssistant.swift) tries this first when a backend is supplied and falls back to
// `ScriptedAssistant`, tagged STUB, when the daemon does not support it yet or the call fails.

/// What answering a question produced. `unsupported` and `failed` both fall back to the scripted
/// stub; they are kept distinct only so a caller can tell "old daemon" from "this daemon errored".
public enum AssistantQueryOutcome: Sendable {
    case answer(AssistantAnswer)
    case unsupported
    case failed(String)
}

/// A backend failure, carrying only what the confirmation card or the stub fallback needs to show —
/// a human-readable message (already `DaemonClientError.description`-formatted when it came from the
/// wire).
public struct AssistantBackendError: Error, Sendable, Equatable, CustomStringConvertible {
    public var message: String
    public init(_ message: String) { self.message = message }
    public var description: String { message }
}

/// Closures over a `DaemonClient`, so `ChatModel` never imports the client type directly (mirroring
/// how `StudioStore` is the only thing that touches the wire). `StudioStore.assistantBackend` builds
/// the real one; tests build a fake one against `FakeDaemonServer` or in-memory stubs.
public struct AssistantBackend: Sendable {
    public var query: @Sendable (_ question: String, _ projectId: ProjectID?) async -> AssistantQueryOutcome
    public var proposeIntent: @Sendable (_ utterance: String, _ payload: AssistantIntentPayload) async -> Result<AssistantIntent, AssistantBackendError>
    public var executeIntent: @Sendable (_ intent: AssistantIntent) async -> Result<AssistantIntentExecutionOutcome, AssistantBackendError>

    public init(query: @escaping @Sendable (String, ProjectID?) async -> AssistantQueryOutcome,
                proposeIntent: @escaping @Sendable (String, AssistantIntentPayload) async -> Result<AssistantIntent, AssistantBackendError>,
                executeIntent: @escaping @Sendable (AssistantIntent) async -> Result<AssistantIntentExecutionOutcome, AssistantBackendError>) {
        self.query = query
        self.proposeIntent = proposeIntent
        self.executeIntent = executeIntent
    }
}

// MARK: - Intent phrase recognition
//
// Studio's own understanding of chat text mirrors the daemon's: an utterance must start with the
// fixed prefix for the kind, and the identifier(s) the payload names must appear literally in it —
// `assertUtteranceMatchesIntentV1` re-runs the identical check server-side on both propose and
// execute, so a payload this recognizer builds is guaranteed to pass. `queue-task` / `run-phase` are
// not recognized from free text: their payload is a full `TaskSpec` (acceptance criteria, a base
// commit, a policy digest, …), nothing a chat sentence carries.
public enum IntentRecognizer {

    /// Recognizes `scan <absolute path>`, `enroll <sha256 digest> [on <branch>]`, and
    /// `approve <attempt uuid> <answer…>`. Returns `nil` for anything else, including a phrase whose
    /// prefix matches but whose identifier does not parse (an honest question, not a bad intent).
    public static func recognize(_ utterance: String) -> AssistantIntentPayload? {
        let trimmed = utterance.trimmingCharacters(in: .whitespacesAndNewlines)
        let lower = trimmed.lowercased()

        if lower.hasPrefix("scan ") {
            let rest = trimmed.dropFirst("scan ".count).trimmingCharacters(in: .whitespaces)
            guard let path = try? AbsolutePath(rest) else { return nil }
            return .scanProject(repositoryRoot: path)
        }
        if lower.hasPrefix("enroll ") {
            let rest = trimmed.dropFirst("enroll ".count)
            let parts = rest.components(separatedBy: " on ")
            guard let digest = try? Sha256Digest(parts[0].trimmingCharacters(in: .whitespaces)) else { return nil }
            var branch: GitBranchName?
            if parts.count > 1 { branch = try? GitBranchName(parts[1].trimmingCharacters(in: .whitespaces)) }
            return .enrollProject(planDigest: digest, branchName: branch)
        }
        if lower.hasPrefix("approve ") {
            let rest = trimmed.dropFirst("approve ".count)
            guard let space = rest.firstIndex(of: " ") else { return nil }
            let idText = String(rest[rest.startIndex..<space])
            let answer = String(rest[rest.index(after: space)...]).trimmingCharacters(in: .whitespaces)
            guard let attemptId = try? AttemptID(idText), !answer.isEmpty else { return nil }
            return .approveAttempt(attemptId: attemptId, answer: answer)
        }
        return nil
    }
}
