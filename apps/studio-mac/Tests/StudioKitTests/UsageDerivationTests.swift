import Foundation
@testable import StudioKit
import XCTest

/// `UsageDerivation` is a pure function of `usage.summary` rows. These pin the null-honest discipline:
/// a field no row reported stays `nil` — never a fabricated 0 — and `unreportedCount` never leaks into
/// a token sum.
final class UsageDerivationTests: XCTestCase {

    private func row(provider: String, model: String = "m", day: String, input: Int? = nil, output: Int? = nil,
                     cost: Int? = nil, unreported: Int = 0) -> UsageSummaryRow {
        UsageSummaryRow(providerKey: RoomProvider(unchecked: provider), model: model, dayKey: RoomDayKey(unchecked: day),
                        inputTokens: input, outputTokens: output, cachedInputTokens: nil, costUsdMicros: cost,
                        unreportedCount: unreported)
    }

    // MARK: AnalyticsRange

    func testAnalyticsRangeSinceDaysAndRawValuesMatchTheAppStorageKeys() {
        XCTAssertEqual(AnalyticsRange.sevenDays.rawValue, "7d")
        XCTAssertEqual(AnalyticsRange.sevenDays.sinceDays, 7)
        XCTAssertEqual(AnalyticsRange.thirtyDays.rawValue, "30d")
        XCTAssertEqual(AnalyticsRange.thirtyDays.sinceDays, 30)
    }

    // MARK: totals — null-honest sums

    func testTotalsOfEmptyRowsIsEntirelyHonestNil() {
        let totals = UsageDerivation.totals([])
        XCTAssertNil(totals.inputTokens)
        XCTAssertNil(totals.outputTokens)
        XCTAssertNil(totals.knownTotalTokens)
        XCTAssertNil(totals.costUsdMicros)
        XCTAssertEqual(totals.unreportedCount, 0)
        XCTAssertNil(totals.costDisplay)
    }

    func testTotalsSumsOnlyWhatEachRowReported() {
        let rows = [
            row(provider: "claude", day: "2026-08-16", input: 12_400, output: 3_100, cost: 184_500),
            row(provider: "openrouter-fast", day: "2026-08-16", input: nil, output: 5_600, cost: nil),
            row(provider: "codex", day: "2026-08-16", input: nil, output: nil, cost: nil, unreported: 4),
        ]
        let totals = UsageDerivation.totals(rows)
        XCTAssertEqual(totals.inputTokens, 12_400, "only claude reported input tokens")
        XCTAssertEqual(totals.outputTokens, 3_100 + 5_600)
        XCTAssertEqual(totals.knownTotalTokens, 12_400 + 3_100 + 5_600, "sum of whatever is known, missing side contributes 0")
        XCTAssertEqual(totals.costUsdMicros, 184_500, "only claude self-reports cost")
        XCTAssertEqual(totals.unreportedCount, 4)
        XCTAssertEqual(totals.costDisplay, "$0.18")
    }

    /// The row central to the honesty rule: a row that reported NOTHING (every field null,
    /// `unreportedCount > 0`) must never make `knownTotalTokens` render as `0` — it must stay `nil`.
    func testAllRowsFullyUnreportedNeverRendersAsZeroTokens() {
        let rows = [
            row(provider: "codex", day: "2026-08-01", unreported: 3),
            row(provider: "codex", day: "2026-08-02", unreported: 1),
        ]
        let totals = UsageDerivation.totals(rows)
        XCTAssertNil(totals.inputTokens)
        XCTAssertNil(totals.outputTokens)
        XCTAssertNil(totals.knownTotalTokens, "nothing was ever known — must not read as a real 0")
        XCTAssertNil(totals.costUsdMicros)
        XCTAssertEqual(totals.unreportedCount, 4)
    }

    /// A row that reports output but not input still contributes a known total (the output side is
    /// real, even though the input side is unreported) — distinct from the fully-unreported case above.
    func testPartiallyReportedRowStillContributesAKnownTotal() {
        let totals = UsageDerivation.totals([row(provider: "openrouter-fast", day: "2026-08-16", input: nil, output: 5_600)])
        XCTAssertNil(totals.inputTokens)
        XCTAssertEqual(totals.outputTokens, 5_600)
        XCTAssertEqual(totals.knownTotalTokens, 5_600)
    }

    func testCostDisplayFormatsMicrosAsDollars() {
        XCTAssertEqual(UsageDerivation.totals([row(provider: "claude", day: "2026-08-16", cost: 1_000_000)]).costDisplay, "$1.00")
        XCTAssertEqual(UsageDerivation.totals([row(provider: "claude", day: "2026-08-16", cost: 5_000)]).costDisplay, "$0.01")
    }

    // MARK: byProvider

    func testByProviderFoldsEveryModelDayBucketPerProvider() {
        let rows = [
            row(provider: "claude", model: "sonnet", day: "2026-08-15", input: 1_000, output: 200),
            row(provider: "claude", model: "haiku", day: "2026-08-16", input: 500, output: 100),
            row(provider: "codex", day: "2026-08-16", unreported: 2),
        ]
        let providers = UsageDerivation.byProvider(rows)
        XCTAssertEqual(providers.map(\.providerKey.rawValue), ["claude", "codex"])
        let claude = providers[0]
        XCTAssertEqual(claude.inputTokens, 1_500)
        XCTAssertEqual(claude.outputTokens, 300)
        XCTAssertEqual(claude.knownTotalTokens, 1_800)
        let codex = providers[1]
        XCTAssertNil(codex.knownTotalTokens)
        XCTAssertEqual(codex.unreportedCount, 2)
    }

    func testByProviderSortsByKnownTotalDescendingTiesBrokenByKey() {
        let rows = [
            row(provider: "openrouter-fast", day: "2026-08-16", input: 100),
            row(provider: "claude", day: "2026-08-16", input: 900),
            row(provider: "ollama", day: "2026-08-16", input: 100), // ties openrouter-fast on known total
            row(provider: "codex", day: "2026-08-16", unreported: 1), // no known total at all — sorts last
        ]
        let providers = UsageDerivation.byProvider(rows)
        XCTAssertEqual(providers.map(\.providerKey.rawValue), ["claude", "ollama", "openrouter-fast", "codex"])
    }

    func testByProviderOfEmptyRowsIsEmpty() {
        XCTAssertTrue(UsageDerivation.byProvider([]).isEmpty)
    }

    // MARK: byDay

    func testByDayFoldsEveryProviderModelBucketPerDayAscending() {
        let rows = [
            row(provider: "claude", day: "2026-08-16", input: 100),
            row(provider: "openrouter-fast", day: "2026-08-14", output: 50),
            row(provider: "codex", day: "2026-08-15", unreported: 1),
        ]
        let days = UsageDerivation.byDay(rows)
        XCTAssertEqual(days.map(\.dayKey.rawValue), ["2026-08-14", "2026-08-15", "2026-08-16"], "ascending, oldest first")
        XCTAssertEqual(days[0].outputTokens, 50)
        XCTAssertNil(days[1].knownTotalTokens)
        XCTAssertEqual(days[1].unreportedCount, 1)
        XCTAssertEqual(days[2].inputTokens, 100)
    }

    func testByDayMergesMultipleProvidersOnTheSameDay() {
        let rows = [
            row(provider: "claude", day: "2026-08-16", input: 100, output: 20),
            row(provider: "openrouter-fast", day: "2026-08-16", output: 50),
        ]
        let days = UsageDerivation.byDay(rows)
        XCTAssertEqual(days.count, 1)
        XCTAssertEqual(days[0].inputTokens, 100)
        XCTAssertEqual(days[0].outputTokens, 70)
        XCTAssertEqual(days[0].knownTotalTokens, 170)
    }

    // MARK: The recorded fixture, end to end

    func testUsageSummaryFixtureDerivesTheDocumentedThreeBucketMix() throws {
        let response = try JSONDecoder().decode(CommandResponse.self, from: Fixtures.data("usage-summary.response.json"))
        guard case .success(_, .usageSummary(let summary)) = response else { return XCTFail("expected usage.summary") }
        let totals = UsageDerivation.totals(summary.rows)
        XCTAssertEqual(totals.inputTokens, 12_400)
        XCTAssertEqual(totals.outputTokens, 3_100 + 5_600)
        XCTAssertEqual(totals.knownTotalTokens, 12_400 + 3_100 + 5_600)
        XCTAssertEqual(totals.costUsdMicros, 184_500)
        XCTAssertEqual(totals.unreportedCount, 4, "codex's hardcoded-0 bucket")
        let providers = UsageDerivation.byProvider(summary.rows)
        XCTAssertEqual(providers.map(\.providerKey.rawValue), ["claude", "openrouter-fast", "codex"])
    }
}
