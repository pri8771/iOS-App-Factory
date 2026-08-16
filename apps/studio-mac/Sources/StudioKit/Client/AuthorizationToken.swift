import Darwin
import Foundation

// MARK: - AuthorizationToken
//
// The daemon's shared secret. Resolved from `APP_FACTORY_AUTH_TOKEN` in the environment, or read from
// a private token file (`APP_FACTORY_AUTH_FILE`, or an explicit path) with the same discipline as
// apps/daemon/src/daemon-entrypoint.ts `readPrivateAuthorizationFile`:
//
//   * opened O_NOFOLLOW; must be one regular, unlinked file (nlink == 1)
//   * mode & 0o077 == 0 (not readable by group/others) and owned by the current user
//   * 32 ... 514 bytes; at most one trailing line ending; printable ASCII 32...512 chars
//
// The value never appears in `description`, logs, or errors.

public struct AuthorizationToken: Sendable, Equatable, CustomStringConvertible, CustomDebugStringConvertible {
    public static let minLength = 32
    public static let maxLength = 512
    public static let environmentVariable = "APP_FACTORY_AUTH_TOKEN"
    public static let fileEnvironmentVariable = "APP_FACTORY_AUTH_FILE"

    /// The raw token. Only the transport should read this.
    public let value: String

    public enum LoadError: Error, Equatable, Sendable {
        case invalidToken
        case cannotOpen(path: String)
        case notARegularFile(path: String)
        case tooPermissive(path: String)
        case notOwnedByCurrentUser(path: String)
        case invalidSize(path: String)
        case changedWhileReading(path: String)
        case notUTF8(path: String)
        case notFound
    }

    /// Validates `CommandAuthorizationV1Schema`: 32...512 printable ASCII characters.
    public init(validating value: String) throws {
        guard value.count >= Self.minLength, value.count <= Self.maxLength,
              WirePatterns.matches(WirePatterns.authorization, value)
        else { throw LoadError.invalidToken }
        self.value = value
    }

    public var description: String { "AuthorizationToken(<redacted>)" }
    public var debugDescription: String { description }

    // MARK: Resolution

    /// Environment first, then the file. `fileURL` overrides `APP_FACTORY_AUTH_FILE`.
    public static func resolve(environment: [String: String] = ProcessInfo.processInfo.environment,
                               fileURL: URL? = nil) throws -> AuthorizationToken {
        if let raw = environment[environmentVariable], !raw.isEmpty {
            return try AuthorizationToken(validating: withoutOneLineEnding(raw))
        }
        if let fileURL {
            return try load(privateFile: fileURL)
        }
        if let path = environment[fileEnvironmentVariable], !path.isEmpty {
            return try load(privateFile: URL(fileURLWithPath: path))
        }
        throw LoadError.notFound
    }

    /// Reads a token through an already opened, non-symlink descriptor, checking ownership and mode.
    public static func load(privateFile url: URL,
                            expectedUserID: uid_t? = getuid()) throws -> AuthorizationToken {
        let path = url.path
        let fd = open(path, O_RDONLY | O_NOFOLLOW | O_CLOEXEC)
        guard fd >= 0 else { throw LoadError.cannotOpen(path: path) }
        defer { close(fd) }

        var before = stat()
        guard fstat(fd, &before) == 0 else { throw LoadError.cannotOpen(path: path) }
        guard (before.st_mode & S_IFMT) == S_IFREG, before.st_nlink == 1 else {
            throw LoadError.notARegularFile(path: path)
        }
        guard (before.st_mode & 0o077) == 0 else { throw LoadError.tooPermissive(path: path) }
        if let expectedUserID, before.st_uid != expectedUserID {
            throw LoadError.notOwnedByCurrentUser(path: path)
        }
        let size = Int(before.st_size)
        guard size >= minLength, size <= maxLength + 2 else { throw LoadError.invalidSize(path: path) }

        var buffer = [UInt8](repeating: 0, count: maxLength + 3)
        defer { for i in buffer.indices { buffer[i] = 0 } }
        let bytesRead = buffer.withUnsafeMutableBytes { raw in
            pread(fd, raw.baseAddress, raw.count, 0)
        }
        guard bytesRead == size else { throw LoadError.changedWhileReading(path: path) }

        var after = stat()
        guard fstat(fd, &after) == 0,
              after.st_dev == before.st_dev, after.st_ino == before.st_ino,
              after.st_size == before.st_size,
              after.st_mtimespec.tv_sec == before.st_mtimespec.tv_sec,
              after.st_mtimespec.tv_nsec == before.st_mtimespec.tv_nsec
        else { throw LoadError.changedWhileReading(path: path) }

        guard let decoded = String(bytes: buffer[0..<bytesRead], encoding: .utf8) else {
            throw LoadError.notUTF8(path: path)
        }
        return try AuthorizationToken(validating: withoutOneLineEnding(decoded))
    }

    /// Strips exactly one trailing "\n" or "\r\n". Works on scalars: in Swift "\r\n" is a single
    /// Character, so a Character-based `dropLast(2)` would eat a byte of the token.
    static func withoutOneLineEnding(_ text: String) -> String {
        var scalars = Array(text.unicodeScalars)
        guard scalars.last == "\n" else { return text }
        scalars.removeLast()
        if scalars.last == "\r" { scalars.removeLast() }
        var out = String.UnicodeScalarView()
        out.append(contentsOf: scalars)
        return String(out)
    }
}
