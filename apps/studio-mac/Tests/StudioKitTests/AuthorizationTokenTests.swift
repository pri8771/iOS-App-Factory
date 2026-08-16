import Foundation
@testable import StudioKit
import XCTest

final class AuthorizationTokenTests: XCTestCase {
    private let sample = "studio-test-token-0123456789abcdefghijklmnop"
    private var directory: URL!

    override func setUpWithError() throws {
        directory = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("afs-auth-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true,
                                                attributes: [.posixPermissions: 0o700])
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: directory)
    }

    private func write(_ contents: String, name: String = "auth.token", mode: Int = 0o600) throws -> URL {
        let url = directory.appendingPathComponent(name)
        try Data(contents.utf8).write(to: url)
        try FileManager.default.setAttributes([.posixPermissions: mode], ofItemAtPath: url.path)
        return url
    }

    func testValidatesTokenShape() {
        XCTAssertNoThrow(try AuthorizationToken(validating: sample))
        XCTAssertThrowsError(try AuthorizationToken(validating: "short"))
        XCTAssertThrowsError(try AuthorizationToken(validating: String(repeating: "a", count: 513)))
        XCTAssertThrowsError(try AuthorizationToken(validating: String(repeating: "a", count: 31) + " "), "no spaces")
        XCTAssertThrowsError(try AuthorizationToken(validating: String(repeating: "é", count: 32)), "printable ASCII only")
    }

    func testDescriptionNeverLeaksTheValue() throws {
        let token = try AuthorizationToken(validating: sample)
        XCTAssertFalse(token.description.contains(sample))
        XCTAssertFalse("\(token)".contains(sample))
        XCTAssertFalse(String(reflecting: token).contains(sample))
    }

    func testEnvironmentVariableWins() throws {
        let file = try write("file-token-0123456789abcdefghijklmnopqrstuvwxyz\n")
        let token = try AuthorizationToken.resolve(environment: ["APP_FACTORY_AUTH_TOKEN": sample], fileURL: file)
        XCTAssertEqual(token.value, sample)
    }

    func testLoadsPrivateFileAndStripsOneLineEnding() throws {
        let file = try write(sample + "\n")
        XCTAssertEqual(try AuthorizationToken.load(privateFile: file).value, sample)
        let crlf = try write(sample + "\r\n", name: "crlf.token")
        XCTAssertEqual(try AuthorizationToken.load(privateFile: crlf).value, sample)
        let two = try write(sample + "\n\n", name: "two.token")
        XCTAssertThrowsError(try AuthorizationToken.load(privateFile: two), "only one line ending is stripped")
    }

    func testResolvesFromAuthFileEnvironmentVariable() throws {
        let file = try write(sample)
        let token = try AuthorizationToken.resolve(environment: ["APP_FACTORY_AUTH_FILE": file.path])
        XCTAssertEqual(token.value, sample)
    }

    func testRejectsGroupOrWorldReadableFile() throws {
        let file = try write(sample, mode: 0o644)
        XCTAssertThrowsError(try AuthorizationToken.load(privateFile: file)) { error in
            guard case AuthorizationToken.LoadError.tooPermissive = error else { return XCTFail("\(error)") }
        }
        let group = try write(sample, name: "g.token", mode: 0o640)
        XCTAssertThrowsError(try AuthorizationToken.load(privateFile: group))
    }

    func testRejectsSymlink() throws {
        let real = try write(sample)
        let link = directory.appendingPathComponent("link.token")
        try FileManager.default.createSymbolicLink(at: link, withDestinationURL: real)
        XCTAssertThrowsError(try AuthorizationToken.load(privateFile: link)) { error in
            guard case AuthorizationToken.LoadError.cannotOpen = error else { return XCTFail("\(error)") }
        }
    }

    func testRejectsWrongOwner() throws {
        let file = try write(sample)
        XCTAssertThrowsError(try AuthorizationToken.load(privateFile: file, expectedUserID: getuid() &+ 1)) { error in
            guard case AuthorizationToken.LoadError.notOwnedByCurrentUser = error else { return XCTFail("\(error)") }
        }
    }

    func testRejectsBadSizes() throws {
        let short = try write("tiny")
        XCTAssertThrowsError(try AuthorizationToken.load(privateFile: short))
        let long = try write(String(repeating: "a", count: 600), name: "long.token")
        XCTAssertThrowsError(try AuthorizationToken.load(privateFile: long))
    }

    func testMissingConfigurationIsExplicit() {
        XCTAssertThrowsError(try AuthorizationToken.resolve(environment: [:])) { error in
            guard case AuthorizationToken.LoadError.notFound = error else { return XCTFail("\(error)") }
        }
    }

    func testDaemonLocator() {
        XCTAssertEqual(DaemonLocator.socketPath(environment: ["APP_FACTORY_SOCKET": "/tmp/x.sock"]), "/tmp/x.sock")
        XCTAssertEqual(DaemonLocator.socketPath(environment: ["APP_FACTORY_RUNTIME_DIR": "/tmp/rt"]), "/tmp/rt/daemon.sock")
        XCTAssertNil(DaemonLocator.socketPath(environment: [:]))
        XCTAssertFalse(DaemonLocator.socketExists(at: "/definitely/not/here.sock"))
    }
}
