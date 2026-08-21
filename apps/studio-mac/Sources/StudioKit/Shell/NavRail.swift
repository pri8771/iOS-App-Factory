import SwiftUI

// MARK: - NavRail
//
// The 48pt left icon rail (Architecture decision 13): chat · stages · dashboard · settings, in that
// order — chat is the default landing tab now, not dashboard (Wave 8's chat-first pivot). Replaces
// the title bar's old horizontal tab strip; `StudioTitleBar` keeps only the wordmark, the daemon
// beacon, and the budget gauge.
//
// Selection reads as an arc-accent bar on the leading edge of the selected icon plus a cyan icon
// tint — HUDRole discipline still applies (components take roles, never raw colors): "the screen
// currently in view" borrows `.machine`'s arc color, the same pre-existing convention every other
// live-selection indicator in this app already uses (e.g. `StudioTitleBar`'s old tab underline),
// not a new meaning invented for gold/cyan. Gold never appears here — no rail item is ever "waiting
// on you."

public struct NavRail: View {
    @Binding public var tab: StudioTab

    public static let width: CGFloat = 48
    private static let iconSize: CGFloat = 40

    public init(tab: Binding<StudioTab>) {
        self._tab = tab
    }

    public var body: some View {
        VStack(spacing: HUDTheme.space.s) {
            // Breathing room under the title bar's traffic-light inset before the first icon.
            Color.clear.frame(height: HUDTheme.space.xs)
            ForEach(StudioTab.allCases) { candidate in
                NavRailItem(tab: candidate, isSelected: candidate == tab) { tab = candidate }
            }
            Spacer(minLength: 0)
        }
        .padding(.top, HUDTheme.space.s)
        .frame(width: Self.width)
        .frame(maxHeight: .infinity)
        .background(HUDTheme.hull)
        .overlay(alignment: .trailing) { Rectangle().fill(HUDTheme.hairline).frame(width: 1) }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Screens")
    }

    fileprivate static let iconFrame = iconSize
}

private struct NavRailItem: View {
    let tab: StudioTab
    let isSelected: Bool
    let action: () -> Void

    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            ZStack(alignment: .leading) {
                Rectangle()
                    .fill(isSelected ? HUDTheme.arc : Color.clear)
                    .frame(width: 2)
                    .shadow(color: isSelected ? HUDTheme.glow : .clear, radius: 3)
                RoundedRectangle(cornerRadius: HUDTheme.radius.control, style: .continuous)
                    .fill(isSelected ? HUDTheme.arc.opacity(0.12) : (hovering ? HUDTheme.raised : Color.clear))
                    .padding(.leading, 4)
                    .padding(.trailing, 2)
                Image(systemName: tab.symbolName)
                    .font(.system(size: 17, weight: isSelected ? .semibold : .regular))
                    .foregroundStyle(isSelected ? HUDTheme.arc : HUDTheme.mute)
                    .frame(width: NavRail.width, height: NavRail.iconFrame)
            }
            .frame(width: NavRail.width, height: NavRail.iconFrame)
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
        .animation(.easeOut(duration: 0.12), value: hovering)
        .help(tab.title)
        .accessibilityLabel(tab.title)
        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : [.isButton])
    }
}

#Preview("Nav rail") {
    struct Host: View {
        @State var tab = StudioTab.chat
        var body: some View {
            HStack(spacing: 0) {
                NavRail(tab: $tab)
                Spacer()
            }
            .frame(width: 240, height: 360)
            .background(HUDTheme.void)
        }
    }
    return Host().preferredColorScheme(.dark)
}
