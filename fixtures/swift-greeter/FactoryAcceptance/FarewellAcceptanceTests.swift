import Greeter
import Testing

@Test func farewellIncludesTheName() {
    let formatter = GreetingFormatter()

    #expect(formatter.farewell(for: "Factory") == "Goodbye, Factory!")
}
