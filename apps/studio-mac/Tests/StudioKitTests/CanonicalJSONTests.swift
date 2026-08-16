import Foundation
@testable import StudioKit
import XCTest

final class CanonicalJSONTests: XCTestCase {

    // MARK: Key order — must match Array.prototype.sort((l, r) => l.localeCompare(r))

    func testKeyOrderMatchesJavaScriptLocaleCompare() throws {
        let expected = try JSONDecoder().decode([String].self, from: Fixtures.data("locale-compare-order.json"))
        let shuffled = expected.shuffled()
        let sorted = shuffled.sorted { CanonicalJSON.jsLocaleCompare($0, $1) == .orderedAscending }
        XCTAssertEqual(sorted, expected)
    }

    func testAlphanumericCollationIsAntisymmetricAndTransitiveOnFixture() throws {
        let keys = try JSONDecoder().decode([String].self, from: Fixtures.data("locale-compare-order.json"))
        for (i, a) in keys.enumerated() {
            for (j, b) in keys.enumerated() {
                let ab = CanonicalJSON.jsLocaleCompare(a, b)
                let ba = CanonicalJSON.jsLocaleCompare(b, a)
                if i == j {
                    XCTAssertEqual(ab, .orderedSame, "\(a) vs itself")
                } else if i < j {
                    XCTAssertEqual(ab, .orderedAscending, "\(a) < \(b)")
                    XCTAssertEqual(ba, .orderedDescending, "\(b) > \(a)")
                }
            }
        }
    }

    // MARK: Numbers — must match JSON.stringify(Number)

    func testNumberFormattingMatchesJavaScript() throws {
        let pairs = try JSONDecoder().decode([[String]].self, from: Fixtures.data("number-format.json"))
        for pair in pairs {
            let source = pair[0], expected = pair[1]
            let value = try XCTUnwrap(Double(source), "parse \(source)")
            XCTAssertEqual(CanonicalJSON.formatNumber(value), expected, "format \(source)")
        }
        XCTAssertEqual(CanonicalJSON.formatNumber(-0.0), "0")
        XCTAssertEqual(CanonicalJSON.formatNumber(.infinity), "null")
        XCTAssertEqual(CanonicalJSON.formatNumber(.nan), "null")
    }

    // MARK: Strings — JSON.stringify escaping

    func testStringEscapingMatchesJavaScript() {
        var out = ""
        CanonicalJSON.writeString("a\"b\\c\n\t\r\u{08}\u{0C}\u{01}\u{1F}/é\u{2028}😀", into: &out)
        XCTAssertEqual(out, "\"a\\\"b\\\\c\\n\\t\\r\\b\\f\\u0001\\u001f/é\u{2028}😀\"")
    }

    func testSerializeNestedStructure() {
        let value: JSONValue = [
            "zeta": [1, 2.5, true, nil, "x"],
            "Alpha": ["b": 1, "a": ["deep": -0.0]],
            "alpha": "lower first",
        ]
        XCTAssertEqual(CanonicalJSON.serialize(value),
                       #"{"alpha":"lower first","Alpha":{"a":{"deep":0},"b":1},"zeta":[1,2.5,true,null,"x"]}"#)
    }

    // MARK: Portfolio digest — byte-for-byte against the recorded Node output

    func testPortfolioCanonicalTextMatchesRecordedFixture() throws {
        let response = try JSONValue.parse(Fixtures.data("portfolio-snapshot.response.json"))
        let snapshot = try XCTUnwrap(response["result"]?["snapshot"])
        let canonical = try PortfolioDigest.canonicalText(snapshot)
        let expected = try Fixtures.string("portfolio-snapshot.canonical.txt")
        XCTAssertEqual(canonical, expected)
        XCTAssertEqual(Array(canonical.utf8), Array(expected.utf8), "byte-for-byte")
    }

    func testPortfolioDigestMatchesRecordedFixture() throws {
        let response = try JSONValue.parse(Fixtures.data("portfolio-snapshot.response.json"))
        let snapshot = try XCTUnwrap(response["result"]?["snapshot"])
        let expected = try Fixtures.string("portfolio-snapshot.digest.txt").trimmingCharacters(in: .whitespacesAndNewlines)
        XCTAssertEqual(try PortfolioDigest.compute(snapshot).rawValue, expected)
        XCTAssertEqual(snapshot["sourceSnapshotDigest"]?.stringValue, expected)
        XCTAssertNoThrow(try PortfolioDigest.verify(snapshot))
    }

    func testPortfolioDigestDetectsTampering() throws {
        let response = try JSONValue.parse(Fixtures.data("portfolio-snapshot.response.json"))
        var object = try XCTUnwrap(response["result"]?["snapshot"]?.objectValue)
        var totals = try XCTUnwrap(object["totals"]?.objectValue)
        totals["attempts"] = .number(11)
        object["totals"] = .object(totals)
        XCTAssertThrowsError(try PortfolioDigest.verify(.object(object))) { error in
            guard case PortfolioDigest.VerificationError.mismatch = error else {
                return XCTFail("expected mismatch, got \(error)")
            }
        }
    }

    func testPortfolioDigestIgnoresExtraTopLevelKeysAndSourceDigest() throws {
        // The digest input is exactly {schemaVersion, generatedAt, projects, totals}.
        let response = try JSONValue.parse(Fixtures.data("portfolio-snapshot.response.json"))
        var object = try XCTUnwrap(response["result"]?["snapshot"]?.objectValue)
        let original = try PortfolioDigest.compute(.object(object))
        object["sourceSnapshotDigest"] = .string("sha256:" + String(repeating: "0", count: 64))
        XCTAssertEqual(try PortfolioDigest.compute(.object(object)), original)
        object.removeValue(forKey: "totals")
        XCTAssertThrowsError(try PortfolioDigest.compute(.object(object)))
    }

    func testDigestOfEmptyObjectIsKnownSha256() {
        // sha256("{}") — a fixed point everyone can check with `printf '{}' | shasum -a 256`.
        XCTAssertEqual(CanonicalJSON.digest(.object([:])).rawValue,
                       "sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a")
    }
}
