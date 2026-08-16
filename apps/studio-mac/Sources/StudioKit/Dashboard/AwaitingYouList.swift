import SwiftUI

// MARK: - AwaitingYouList
//
// The gold list: everything waiting on the human. Live blocked attempts first (from attempt.list),
// then ◆ gates from the timeline fixture, each with its provenance badge. Empty is an honest empty.

public struct AwaitingYouList: View {
    public var items: [AwaitingItem]
    public var onOpen: ((AwaitingItem) -> Void)?

    public init(items: [AwaitingItem], onOpen: ((AwaitingItem) -> Void)? = nil) {
        self.items = items
        self.onOpen = onOpen
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: HUDTheme.space.xs) {
            if items.isEmpty {
                Text("nothing is waiting on you")
                    .font(HUDTypography.monoValue).foregroundStyle(HUDTheme.mute)
            }
            ForEach(items) { item in
                Button {
                    onOpen?(item)
                } label: {
                    HStack(alignment: .top, spacing: HUDTheme.space.xs) {
                        DiamondGate(state: .waiting, size: 9, label: item.title)
                            .frame(width: 20, height: 20)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.title)
                                .font(HUDTypography.bodyStrong)
                                .foregroundStyle(HUDTheme.ink)
                                .lineLimit(2)
                                .multilineTextAlignment(.leading)
                            if let detail = item.detail {
                                Text(detail)
                                    .font(HUDTypography.caption)
                                    .foregroundStyle(HUDTheme.soft)
                                    .lineLimit(2)
                                    .multilineTextAlignment(.leading)
                            }
                            ProvenanceBadge(item.provenance, compact: true)
                        }
                        Spacer(minLength: 0)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(onOpen == nil)
                .accessibilityElement(children: .combine)
                .accessibilityHint(item.slug == nil ? Text(verbatim: "") : Text("Opens the project"))
            }
        }
    }
}

#Preview("Awaiting you") {
    AwaitingYouList(items: [
        AwaitingItem(id: "1", title: "Demo blocked attempt", detail: "Needs an answer — provide the ASC key", slug: "anjali",
                     attemptId: nil, provenance: .live("attempt.list")),
        AwaitingItem(id: "2", title: "Hindsight · device smoke", detail: "◆ Aug 17", slug: "hindsight", attemptId: nil,
                     provenance: .fixture("timeline-fixture.json")),
    ])
    .hudPanel("awaiting you", role: .human)
    .padding()
    .frame(width: 320)
    .background(HUDTheme.void)
}
