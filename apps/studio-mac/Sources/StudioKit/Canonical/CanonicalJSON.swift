import CryptoKit
import Foundation

// MARK: - CanonicalJSON
//
// Byte-for-byte reproduction of `JSON.stringify(normalize(value))` from
// packages/contracts/src/v1/portfolio-read-model.ts (`canonicalPortfolioReadModelDigestInputV1`):
//
//   * objects: keys sorted with `Array.prototype.sort((l, r) => l.localeCompare(r))`, no whitespace
//   * arrays: element order preserved
//   * numbers: ECMAScript `Number::toString` (integers plain, no ".0"; exponent form only outside
//     1e-7 ... 1e21; -0 → "0"; non-finite → null)
//   * strings: JSON.stringify escaping — only `"`, `\`, and U+0000–U+001F are escaped; "/" and
//     non-ASCII pass through as UTF-8
//
// `localeCompare` is ICU root/en collation, not code-point order. For the pure-alphanumeric keys the
// contracts use we implement that collation directly (case-insensitive primary order with digits
// before letters, then lowercase-before-uppercase tertiary order); anything else falls back to
// Foundation's ICU-backed localized comparison in "en_US". See docs/architecture/0001.

public enum CanonicalJSON {

    /// Canonical text for a JSON tree.
    public static func serialize(_ value: JSONValue) -> String {
        var out = ""
        out.reserveCapacity(1024)
        write(value, into: &out)
        return out
    }

    /// `sha256:<hex>` over the UTF-8 canonical text.
    public static func digest(_ value: JSONValue) -> Sha256Digest {
        digest(of: serialize(value))
    }

    public static func digest(of canonicalText: String) -> Sha256Digest {
        let hash = SHA256.hash(data: Data(canonicalText.utf8))
        let hex = hash.map { String(format: "%02x", $0) }.joined()
        return Sha256Digest(unchecked: "sha256:\(hex)")
    }

    // MARK: Writer

    private static func write(_ value: JSONValue, into out: inout String) {
        switch value {
        case .null:
            out += "null"
        case .bool(let b):
            out += b ? "true" : "false"
        case .number(let d):
            out += formatNumber(d)
        case .string(let s):
            writeString(s, into: &out)
        case .array(let items):
            out += "["
            for (index, item) in items.enumerated() {
                if index > 0 { out += "," }
                write(item, into: &out)
            }
            out += "]"
        case .object(let members):
            out += "{"
            let keys = members.keys.sorted { jsLocaleCompare($0, $1) == .orderedAscending }
            for (index, key) in keys.enumerated() {
                if index > 0 { out += "," }
                writeString(key, into: &out)
                out += ":"
                write(members[key]!, into: &out)
            }
            out += "}"
        }
    }

    static func writeString(_ s: String, into out: inout String) {
        out += "\""
        for scalar in s.unicodeScalars {
            switch scalar {
            case "\"": out += "\\\""
            case "\\": out += "\\\\"
            case "\u{08}": out += "\\b"
            case "\u{0C}": out += "\\f"
            case "\n": out += "\\n"
            case "\r": out += "\\r"
            case "\t": out += "\\t"
            default:
                if scalar.value < 0x20 {
                    out += String(format: "\\u%04x", scalar.value)
                } else {
                    out.unicodeScalars.append(scalar)
                }
            }
        }
        out += "\""
    }

    // MARK: Numbers (ECMAScript Number::toString, radix 10)

    static func formatNumber(_ value: Double) -> String {
        guard value.isFinite else { return "null" }
        if value == 0 { return "0" }
        if value == value.rounded(), abs(value) < 9_007_199_254_740_992 {
            return String(Int64(value))
        }
        // Swift's description is the shortest round-trip representation; re-shape it to ECMA rules.
        var text = value.description
        var negative = false
        if text.hasPrefix("-") {
            negative = true
            text.removeFirst()
        }
        var mantissa = text
        var exponent = 0
        if let e = text.firstIndex(where: { $0 == "e" || $0 == "E" }) {
            mantissa = String(text[..<e])
            exponent = Int(text[text.index(after: e)...]) ?? 0
        }
        var integerDigits = 0
        var digits = ""
        if let dot = mantissa.firstIndex(of: ".") {
            let before = mantissa[..<dot]
            let after = mantissa[mantissa.index(after: dot)...]
            integerDigits = before.count
            digits = String(before) + String(after)
        } else {
            integerDigits = mantissa.count
            digits = mantissa
        }
        // Strip leading zeros (each one shifts the decimal point left).
        while digits.hasPrefix("0") {
            digits.removeFirst()
            integerDigits -= 1
        }
        while digits.hasSuffix("0") { digits.removeLast() }
        if digits.isEmpty { return "0" }
        let n = integerDigits + exponent // value = 0.<digits> × 10^n
        let k = digits.count
        var result: String
        if k <= n, n <= 21 {
            result = digits + String(repeating: "0", count: n - k)
        } else if 0 < n, n <= 21 {
            let idx = digits.index(digits.startIndex, offsetBy: n)
            result = String(digits[..<idx]) + "." + String(digits[idx...])
        } else if -6 < n, n <= 0 {
            result = "0." + String(repeating: "0", count: -n) + digits
        } else {
            let e = n - 1
            let sign = e < 0 ? "-" : "+"
            if k == 1 {
                result = digits + "e" + sign + String(abs(e))
            } else {
                let first = digits.prefix(1)
                let rest = digits.dropFirst()
                result = first + "." + rest + "e" + sign + String(abs(e))
            }
        }
        return negative ? "-" + result : result
    }

    // MARK: Key order (JavaScript `localeCompare`)

    private static let icuLocale = Locale(identifier: "en_US")

    /// `left.localeCompare(right)` for the default (root/en) locale.
    public static func jsLocaleCompare(_ left: String, _ right: String) -> ComparisonResult {
        if isSimpleAlphanumeric(left), isSimpleAlphanumeric(right) {
            return alphanumericCollation(left, right)
        }
        return left.compare(right, options: [], range: nil, locale: icuLocale)
    }

    private static func isSimpleAlphanumeric(_ s: String) -> Bool {
        s.utf8.allSatisfy { b in
            (b >= 0x30 && b <= 0x39) || (b >= 0x41 && b <= 0x5A) || (b >= 0x61 && b <= 0x7A)
        }
    }

    /// ICU root collation restricted to [0-9A-Za-z]: primary = case-folded order with digits before
    /// letters (which is code-point order once folded to lowercase), tertiary = lowercase first at the
    /// first position where only case differs.
    private static func alphanumericCollation(_ left: String, _ right: String) -> ComparisonResult {
        let l = Array(left.utf8), r = Array(right.utf8)
        func fold(_ b: UInt8) -> UInt8 { (b >= 0x41 && b <= 0x5A) ? b + 0x20 : b }
        let count = min(l.count, r.count)
        for i in 0..<count {
            let a = fold(l[i]), b = fold(r[i])
            if a != b { return a < b ? .orderedAscending : .orderedDescending }
        }
        if l.count != r.count { return l.count < r.count ? .orderedAscending : .orderedDescending }
        for i in 0..<count where l[i] != r[i] {
            // Same letter, different case: lowercase sorts first.
            let leftIsLower = l[i] >= 0x61
            return leftIsLower ? .orderedAscending : .orderedDescending
        }
        return .orderedSame
    }
}

// MARK: - PortfolioDigest
//
// Client-side re-verification of `PortfolioReadModelV1.sourceSnapshotDigest`, matching
// packages/command-client/src/index.ts `portfolioSnapshot()`.

public enum PortfolioDigest {
    public enum VerificationError: Error, Equatable, Sendable {
        case notAnObject
        case missingField(String)
        case mismatch(expected: Sha256Digest, computed: Sha256Digest)
    }

    private static let inputKeys = ["schemaVersion", "generatedAt", "projects", "totals"]

    /// `portfolioReadModelDigestInputV1`: exactly the four digest-input fields.
    public static func digestInput(_ snapshot: JSONValue) throws -> JSONValue {
        guard let object = snapshot.objectValue else { throw VerificationError.notAnObject }
        var input: [String: JSONValue] = [:]
        for key in inputKeys {
            guard let value = object[key] else { throw VerificationError.missingField(key) }
            input[key] = value
        }
        return .object(input)
    }

    /// `canonicalPortfolioReadModelDigestInputV1`: the UTF-8 text that is hashed.
    public static func canonicalText(_ snapshot: JSONValue) throws -> String {
        CanonicalJSON.serialize(try digestInput(snapshot))
    }

    public static func compute(_ snapshot: JSONValue) throws -> Sha256Digest {
        CanonicalJSON.digest(of: try canonicalText(snapshot))
    }

    /// Throws `.mismatch` when the embedded `sourceSnapshotDigest` does not match its contents.
    public static func verify(_ snapshot: JSONValue) throws {
        guard let claimed = snapshot["sourceSnapshotDigest"]?.stringValue else {
            throw VerificationError.missingField("sourceSnapshotDigest")
        }
        let computed = try compute(snapshot)
        guard constantTimeEqual(claimed, computed.rawValue) else {
            throw VerificationError.mismatch(expected: Sha256Digest(unchecked: claimed), computed: computed)
        }
    }

    static func constantTimeEqual(_ a: String, _ b: String) -> Bool {
        let x = Array(a.utf8), y = Array(b.utf8)
        guard x.count == y.count else { return false }
        var diff: UInt8 = 0
        for i in 0..<x.count { diff |= x[i] ^ y[i] }
        return diff == 0
    }
}

// MARK: - StudioSnapshotDigest
//
// Client-side re-verification of `StudioSnapshotV1.sourceSnapshotDigest`, matching
// `studioSnapshotDigestInputV1` / `canonicalStudioSnapshotDigestInputV1` (studio-snapshot.ts): the same
// recursively-key-sorted-canonical-JSON sha256 recipe as `PortfolioDigest`, over a different field set.

public enum StudioSnapshotDigest {
    private static let inputKeys = ["schemaVersion", "generatedAt", "projects", "rooms", "roomsUnavailableReason", "portfolio"]

    public static func digestInput(_ snapshot: JSONValue) throws -> JSONValue {
        guard let object = snapshot.objectValue else { throw PortfolioDigest.VerificationError.notAnObject }
        var input: [String: JSONValue] = [:]
        for key in inputKeys {
            guard let value = object[key] else { throw PortfolioDigest.VerificationError.missingField(key) }
            input[key] = value
        }
        return .object(input)
    }

    public static func canonicalText(_ snapshot: JSONValue) throws -> String {
        CanonicalJSON.serialize(try digestInput(snapshot))
    }

    public static func compute(_ snapshot: JSONValue) throws -> Sha256Digest {
        CanonicalJSON.digest(of: try canonicalText(snapshot))
    }

    /// Throws `.mismatch` when the embedded `sourceSnapshotDigest` does not match its contents.
    public static func verify(_ snapshot: JSONValue) throws {
        guard let claimed = snapshot["sourceSnapshotDigest"]?.stringValue else {
            throw PortfolioDigest.VerificationError.missingField("sourceSnapshotDigest")
        }
        let computed = try compute(snapshot)
        guard PortfolioDigest.constantTimeEqual(claimed, computed.rawValue) else {
            throw PortfolioDigest.VerificationError.mismatch(expected: Sha256Digest(unchecked: claimed), computed: computed)
        }
    }
}

// MARK: - RoomParticipantsCatalogDigest
//
// Client-side re-verification of `RoomParticipantsCatalogV1.sourceDigest`, matching
// `roomParticipantsCatalogDigestInputV1` / `canonicalRoomParticipantsCatalogDigestInputV1` (room.ts):
// the same recipe as `StudioSnapshotDigest`, over the catalog's content fields — everything except
// `sourcedAt` and the digest itself, so a later read of an unchanged configuration re-derives the
// identical digest.

public enum RoomParticipantsCatalogDigest {
    private static let inputKeys = ["schemaVersion", "enabled", "unavailableReason", "providers", "roster"]

    public static func digestInput(_ catalog: JSONValue) throws -> JSONValue {
        guard let object = catalog.objectValue else { throw PortfolioDigest.VerificationError.notAnObject }
        var input: [String: JSONValue] = [:]
        for key in inputKeys {
            guard let value = object[key] else { throw PortfolioDigest.VerificationError.missingField(key) }
            input[key] = value
        }
        return .object(input)
    }

    public static func canonicalText(_ catalog: JSONValue) throws -> String {
        CanonicalJSON.serialize(try digestInput(catalog))
    }

    public static func compute(_ catalog: JSONValue) throws -> Sha256Digest {
        CanonicalJSON.digest(of: try canonicalText(catalog))
    }

    /// Throws `.mismatch` when the embedded `sourceDigest` does not match its contents.
    public static func verify(_ catalog: JSONValue) throws {
        guard let claimed = catalog["sourceDigest"]?.stringValue else {
            throw PortfolioDigest.VerificationError.missingField("sourceDigest")
        }
        let computed = try compute(catalog)
        guard PortfolioDigest.constantTimeEqual(claimed, computed.rawValue) else {
            throw PortfolioDigest.VerificationError.mismatch(expected: Sha256Digest(unchecked: claimed), computed: computed)
        }
    }
}

// MARK: - ReleaseProjectionDigest
//
// Client-side re-verification of `ReleaseProjectionV1.sourceDigest`, matching
// `releaseProjectionDigestInputV1` / `canonicalReleaseProjectionDigestInputV1`
// (release-observation.ts): the same recipe as `RoomParticipantsCatalogDigest`, over the projection's
// content fields — everything except `generatedAt` and the digest itself.

public enum ReleaseProjectionDigest {
    private static let inputKeys = ["schemaVersion", "observer", "latest", "observationCount"]

    public static func digestInput(_ projection: JSONValue) throws -> JSONValue {
        guard let object = projection.objectValue else { throw PortfolioDigest.VerificationError.notAnObject }
        var input: [String: JSONValue] = [:]
        for key in inputKeys {
            guard let value = object[key] else { throw PortfolioDigest.VerificationError.missingField(key) }
            input[key] = value
        }
        return .object(input)
    }

    public static func canonicalText(_ projection: JSONValue) throws -> String {
        CanonicalJSON.serialize(try digestInput(projection))
    }

    public static func compute(_ projection: JSONValue) throws -> Sha256Digest {
        CanonicalJSON.digest(of: try canonicalText(projection))
    }

    /// Throws `.mismatch` when the embedded `sourceDigest` does not match its contents.
    public static func verify(_ projection: JSONValue) throws {
        guard let claimed = projection["sourceDigest"]?.stringValue else {
            throw PortfolioDigest.VerificationError.missingField("sourceDigest")
        }
        let computed = try compute(projection)
        guard PortfolioDigest.constantTimeEqual(claimed, computed.rawValue) else {
            throw PortfolioDigest.VerificationError.mismatch(expected: Sha256Digest(unchecked: claimed), computed: computed)
        }
    }
}
