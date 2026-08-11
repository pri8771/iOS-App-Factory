public struct GreetingFormatter: Sendable {
    public init() {}

    public func greeting(for name: String) -> String {
        "Hello, \(name)!"
    }
}
