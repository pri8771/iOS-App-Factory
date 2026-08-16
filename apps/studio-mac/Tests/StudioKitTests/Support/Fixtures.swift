import Foundation
import XCTest

/// Recorded wire fixtures. Every `*.response.json` was produced by
/// `scripts/record-fixtures.mjs` through the real `@app-factory/contracts` zod schemas, so a decode
/// failure here is a real protocol mismatch, not a hand-typed typo.
enum Fixtures {
    static func data(_ name: String, file: StaticString = #filePath, line: UInt = #line) throws -> Data {
        guard let url = Bundle.module.url(forResource: name, withExtension: nil, subdirectory: "Fixtures") else {
            XCTFail("Missing fixture \(name)", file: file, line: line)
            throw NSError(domain: "Fixtures", code: 1)
        }
        return try Data(contentsOf: url)
    }

    static func string(_ name: String, file: StaticString = #filePath, line: UInt = #line) throws -> String {
        String(decoding: try data(name, file: file, line: line), as: UTF8.self)
    }
}
