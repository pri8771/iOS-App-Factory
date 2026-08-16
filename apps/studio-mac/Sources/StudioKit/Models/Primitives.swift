import Foundation

// MARK: - Wire primitives
//
// Mirrors packages/contracts/src/v1/primitives.ts. Branded zod strings become validated wrappers so a
// malformed daemon payload is rejected at decode time exactly where zod would reject it, and so an
// AttemptID can never be passed where a TaskID is expected.

public enum WireValidationError: Error, Equatable, Sendable {
    case invalid(kind: String, value: String)
}

/// A validated string primitive. `Tag` brands the type; `Rule` supplies the validation.
public struct WireString<Tag: WireStringRule>: Hashable, Sendable, Codable, CustomStringConvertible,
    Comparable {
    public let rawValue: String

    /// Validates against the tag's rule.
    public init(_ rawValue: String) throws {
        guard Tag.isValid(rawValue) else {
            throw WireValidationError.invalid(kind: Tag.name, value: rawValue)
        }
        self.rawValue = rawValue
    }

    /// Unchecked construction for values the caller already knows are valid (fixtures, tests).
    public init(unchecked rawValue: String) {
        self.rawValue = rawValue
    }

    public init(from decoder: any Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        guard Tag.isValid(raw) else {
            throw DecodingError.dataCorrupted(.init(
                codingPath: decoder.codingPath,
                debugDescription: "Expected \(Tag.name), got \(raw.debugDescription)"))
        }
        self.rawValue = raw
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }

    public var description: String { rawValue }

    public static func < (lhs: Self, rhs: Self) -> Bool { lhs.rawValue < rhs.rawValue }
}

public protocol WireStringRule: Sendable {
    static var name: String { get }
    static func isValid(_ value: String) -> Bool
}

// MARK: Rules

// NSRegularExpression is ICU: `$` also matches before a final line terminator, unlike JavaScript's `$`.
// Every pattern therefore uses `\A` / `\z` so "value\n" is rejected exactly as zod rejects it.
enum WirePatterns {
    static let lowercaseUUID = try! NSRegularExpression(
        pattern: "\\A[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\z")
    static let sha256 = try! NSRegularExpression(pattern: "\\Asha256:[0-9a-f]{64}\\z")
    static let gitObjectId = try! NSRegularExpression(pattern: "\\A(?:[0-9a-f]{40}|[0-9a-f]{64})\\z")
    static let namespacedCode = try! NSRegularExpression(pattern: "\\A[a-z][a-z0-9]*(?:[.-][a-z][a-z0-9]*)+\\z")
    static let stableKey = try! NSRegularExpression(pattern: "\\A[a-z][a-z0-9-]{0,63}\\z")
    static let isoInstant = try! NSRegularExpression(
        pattern: "\\A[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])T(?:[01][0-9]|2[0-3]):[0-5][0-9]:(?:[0-5][0-9]|60)\\.[0-9]{3}Z\\z")
    static let absolutePath = try! NSRegularExpression(pattern: "\\A/(?!.*//)(?!.*\\\\)(?!.*\\x00).+\\z")
    static let relativePath = try! NSRegularExpression(
        pattern: "\\A(?!/)(?!\\.{1,2}(?:/|$))(?!.*/\\.{1,2}(?:/|$))(?!.*//)(?!.*/$)(?!.*\\\\)(?!.*\\x00).+\\z")
    static let gitBranchName = try! NSRegularExpression(pattern: "\\A[A-Za-z0-9][A-Za-z0-9._/-]*\\z")
    static let authorization = try! NSRegularExpression(pattern: "\\A[\\x21-\\x7e]+\\z")
    /// `z.iso.date()` — a plain calendar date, e.g. "2026-08-20". Format only, like zod: a
    /// calendar-invalid date (Feb 30) is a daemon bug, not a wire violation, so this does not check it.
    static let calendarDate = try! NSRegularExpression(
        pattern: "\\A[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])\\z")

    static func matches(_ regex: NSRegularExpression, _ value: String) -> Bool {
        let range = NSRange(value.startIndex..<value.endIndex, in: value)
        return regex.firstMatch(in: value, options: [], range: range) != nil
    }
}

public enum LowercaseUUIDRule: WireStringRule {
    public static let name = "lowercase UUID"
    public static func isValid(_ value: String) -> Bool { WirePatterns.matches(WirePatterns.lowercaseUUID, value) }
}

public enum Sha256DigestRule: WireStringRule {
    public static let name = "sha256 digest"
    public static func isValid(_ value: String) -> Bool { WirePatterns.matches(WirePatterns.sha256, value) }
}

public enum GitObjectIDRule: WireStringRule {
    public static let name = "git object id"
    public static func isValid(_ value: String) -> Bool { WirePatterns.matches(WirePatterns.gitObjectId, value) }
}

public enum NamespacedCodeRule: WireStringRule {
    public static let name = "namespaced code"
    public static func isValid(_ value: String) -> Bool {
        value.count >= 3 && value.count <= 128 && WirePatterns.matches(WirePatterns.namespacedCode, value)
    }
}

public enum StableKeyRule: WireStringRule {
    public static let name = "stable key"
    public static func isValid(_ value: String) -> Bool { WirePatterns.matches(WirePatterns.stableKey, value) }
}

public enum IsoInstantRule: WireStringRule {
    public static let name = "ISO instant (millisecond precision, Z)"
    public static func isValid(_ value: String) -> Bool { WirePatterns.matches(WirePatterns.isoInstant, value) }
}

public enum AbsolutePathRule: WireStringRule {
    public static let name = "absolute POSIX path"
    public static func isValid(_ value: String) -> Bool {
        value.count >= 2 && value.count <= 4096 && WirePatterns.matches(WirePatterns.absolutePath, value)
    }
}

public enum RelativePathRule: WireStringRule {
    public static let name = "normalized relative POSIX path"
    public static func isValid(_ value: String) -> Bool {
        value.count >= 1 && value.count <= 1024 && WirePatterns.matches(WirePatterns.relativePath, value)
    }
}

public enum GitBranchNameRule: WireStringRule {
    public static let name = "git branch name"
    public static func isValid(_ value: String) -> Bool {
        value.count >= 1 && value.count <= 255
            && WirePatterns.matches(WirePatterns.gitBranchName, value)
            && !value.contains("..") && !value.hasSuffix(".lock") && !value.hasSuffix("/")
    }
}

/// `CalendarDateSchema` (`packages/contracts/src/v1/primitives.ts`, `studio/milestones-and-phase`) —
/// a milestone's `targetDate`. `null` (not this type) is the honest "no estimate"; see
/// `ProjectMilestone`.
public enum CalendarDateRule: WireStringRule {
    public static let name = "calendar date (YYYY-MM-DD)"
    public static func isValid(_ value: String) -> Bool { WirePatterns.matches(WirePatterns.calendarDate, value) }
}

/// A plain, non-UUID string brand: `z.string().min(1).max(maxLength).brand()`. Used for the
/// studio-snapshot placeholder ids (`StudioMilestoneId`, `StudioRoomId`) that predate a real ID
/// scheme — unlike `MilestoneID` (below), which is a real UUID minted by the milestones service.
public protocol WireBoundedStringRule: WireStringRule {
    static var maxLength: Int { get }
}
extension WireBoundedStringRule {
    public static func isValid(_ value: String) -> Bool { !value.isEmpty && value.count <= maxLength }
}

// MARK: Branded ids
//
// Each id is its own type even though they share the UUID rule: `WireID<Tag>` gives the brand.

public struct WireID<Tag: Sendable>: Hashable, Sendable, Codable, CustomStringConvertible, Comparable {
    public let rawValue: String

    public init(_ rawValue: String) throws {
        guard LowercaseUUIDRule.isValid(rawValue) else {
            throw WireValidationError.invalid(kind: "\(Tag.self)", value: rawValue)
        }
        self.rawValue = rawValue
    }

    public init(unchecked rawValue: String) { self.rawValue = rawValue }

    /// A fresh lowercase v4 UUID.
    public static func generate() -> Self {
        Self(unchecked: UUID().uuidString.lowercased())
    }

    public init(from decoder: any Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        guard LowercaseUUIDRule.isValid(raw) else {
            throw DecodingError.dataCorrupted(.init(
                codingPath: decoder.codingPath,
                debugDescription: "Expected a lowercase UUID for \(Tag.self), got \(raw.debugDescription)"))
        }
        self.rawValue = raw
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }

    public var description: String { rawValue }
    public static func < (lhs: Self, rhs: Self) -> Bool { lhs.rawValue < rhs.rawValue }
}

public enum ProjectIDTag: Sendable {}
public enum RepositoryIDTag: Sendable {}
public enum TaskIDTag: Sendable {}
public enum CommandIDTag: Sendable {}
public enum RequestIDTag: Sendable {}
public enum AttemptIDTag: Sendable {}
public enum StepIDTag: Sendable {}
public enum RunIDTag: Sendable {}
public enum EventIDTag: Sendable {}
public enum EvidenceIDTag: Sendable {}
public enum ApprovalIDTag: Sendable {}
public enum EffectIDTag: Sendable {}
public enum ReleaseIDTag: Sendable {}
public enum AssistantIntentIDTag: Sendable {}
/// The real, revisioned milestone concept (`milestone.ts`, `studio/milestones-and-phase`) — a UUID,
/// unlike the studio-snapshot placeholder's `StudioMilestoneID` (a plain bounded string) below.
public enum MilestoneIDTag: Sendable {}

public typealias ProjectID = WireID<ProjectIDTag>
public typealias RepositoryID = WireID<RepositoryIDTag>
public typealias TaskID = WireID<TaskIDTag>
public typealias CommandID = WireID<CommandIDTag>
public typealias RequestID = WireID<RequestIDTag>
public typealias AttemptID = WireID<AttemptIDTag>
public typealias StepID = WireID<StepIDTag>
public typealias RunID = WireID<RunIDTag>
public typealias EventID = WireID<EventIDTag>
public typealias EvidenceID = WireID<EvidenceIDTag>
public typealias ApprovalID = WireID<ApprovalIDTag>
public typealias EffectID = WireID<EffectIDTag>
public typealias ReleaseID = WireID<ReleaseIDTag>
public typealias AssistantIntentID = WireID<AssistantIntentIDTag>
public typealias MilestoneID = WireID<MilestoneIDTag>

public typealias Sha256Digest = WireString<Sha256DigestRule>
public typealias GitObjectID = WireString<GitObjectIDRule>
public typealias NamespacedCode = WireString<NamespacedCodeRule>
public typealias StableKey = WireString<StableKeyRule>
public typealias AbsolutePath = WireString<AbsolutePathRule>
public typealias RelativePath = WireString<RelativePathRule>
public typealias GitBranchName = WireString<GitBranchNameRule>
public typealias CalendarDate = WireString<CalendarDateRule>

/// `StudioMilestoneIdV1Schema` (`studio-snapshot.ts`) — the placeholder milestone id nested in
/// `StudioSnapshotV1`. Not a UUID; unrelated to `MilestoneID`.
public enum StudioMilestoneIDRule: WireBoundedStringRule {
    public static let name = "studio milestone id"
    public static let maxLength = 128
}
public typealias StudioMilestoneID = WireString<StudioMilestoneIDRule>

/// `StudioRoomIdV1Schema` (`studio-snapshot.ts`) — always empty (`rooms: []`) until the rooms
/// worktree merges; modelled for forward compatibility only.
public enum StudioRoomIDRule: WireBoundedStringRule {
    public static let name = "studio room id"
    public static let maxLength = 128
}
public typealias StudioRoomID = WireString<StudioRoomIDRule>

extension WireString where Tag == CalendarDateRule {
    /// Bridges to `DayStamp` for placing a milestone on the timeline. `nil` only if the wire value
    /// somehow describes a calendar-invalid date (`z.iso.date()` checks format, not validity).
    public var dayStamp: DayStamp? { try? DayStamp(rawValue) }
}

/// `z.iso.datetime({ offset: false, precision: 3 })` — e.g. "2026-08-16T17:03:00.000Z".
public typealias IsoInstant = WireString<IsoInstantRule>

extension WireString where Tag == IsoInstantRule {
    private static var formatter: ISO8601DateFormatter {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        f.timeZone = TimeZone(secondsFromGMT: 0)
        return f
    }

    /// The instant as a `Date`.
    public var date: Date? { Self.formatter.date(from: rawValue) }

    /// Now, formatted the way the daemon expects (millisecond precision, Z).
    public static func now(_ date: Date = Date()) -> IsoInstant {
        IsoInstant(unchecked: formatter.string(from: date))
    }
}

/// `schemaVersion: 1` — decoded strictly so a future v2 payload fails loudly.
public struct SchemaVersion1: Hashable, Sendable, Codable {
    public init() {}
    public init(from decoder: any Decoder) throws {
        let value = try decoder.singleValueContainer().decode(Int.self)
        guard value == 1 else {
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath,
                                                    debugDescription: "Expected schemaVersion 1, got \(value)"))
        }
    }
    public func encode(to encoder: any Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(1)
    }
}

// MARK: Shared value types

public struct Failure: Hashable, Sendable, Codable {
    public var code: NamespacedCode
    public var summary: String
    public var retryable: Bool
    public var detailArtifactDigest: Sha256Digest?

    public init(code: NamespacedCode, summary: String, retryable: Bool, detailArtifactDigest: Sha256Digest?) {
        self.code = code
        self.summary = summary
        self.retryable = retryable
        self.detailArtifactDigest = detailArtifactDigest
    }
}

public enum BlockerKind: String, Hashable, Sendable, Codable, CaseIterable {
    case authentication, clarification, approval, environment, policy
}

public struct Blocker: Hashable, Sendable, Codable {
    public var kind: BlockerKind
    public var code: NamespacedCode
    public var summary: String
    public var requiredAction: String?

    public init(kind: BlockerKind, code: NamespacedCode, summary: String, requiredAction: String?) {
        self.kind = kind
        self.code = code
        self.summary = summary
        self.requiredAction = requiredAction
    }
}
