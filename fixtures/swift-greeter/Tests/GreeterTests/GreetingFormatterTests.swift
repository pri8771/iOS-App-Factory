import Greeter
import Testing

@Test func greetingIncludesTheName() {
    let formatter = GreetingFormatter()

    #expect(formatter.greeting(for: "Factory") == "Hello, Factory!")
}

@Test func greetingPreservesWhitespace() {
    let formatter = GreetingFormatter()

    #expect(formatter.greeting(for: "App Factory") == "Hello, App Factory!")
}
