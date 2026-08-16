import SwiftUI

// MARK: - HUDPanel
//
// The HUD frame: a plate surface with thin bracketed corners — four L-shaped ticks, one point wide —
// instead of a rounded card. An optional mono title sits in the top-left inside the frame. The
// bracket colour follows the panel's role (machine cyan by default, gold when the panel is a human
// gate, alert when it reports a failure).

public struct HUDBrackets: Shape {
    public var cornerLength: CGFloat
    public var inset: CGFloat

    public init(cornerLength: CGFloat = 12, inset: CGFloat = 0.5) {
        self.cornerLength = cornerLength
        self.inset = inset
    }

    public func path(in rect: CGRect) -> Path {
        var path = Path()
        let r = rect.insetBy(dx: inset, dy: inset)
        let l = min(cornerLength, r.width / 2, r.height / 2)
        // Top-left
        path.move(to: CGPoint(x: r.minX, y: r.minY + l))
        path.addLine(to: CGPoint(x: r.minX, y: r.minY))
        path.addLine(to: CGPoint(x: r.minX + l, y: r.minY))
        // Top-right
        path.move(to: CGPoint(x: r.maxX - l, y: r.minY))
        path.addLine(to: CGPoint(x: r.maxX, y: r.minY))
        path.addLine(to: CGPoint(x: r.maxX, y: r.minY + l))
        // Bottom-right
        path.move(to: CGPoint(x: r.maxX, y: r.maxY - l))
        path.addLine(to: CGPoint(x: r.maxX, y: r.maxY))
        path.addLine(to: CGPoint(x: r.maxX - l, y: r.maxY))
        // Bottom-left
        path.move(to: CGPoint(x: r.minX + l, y: r.maxY))
        path.addLine(to: CGPoint(x: r.minX, y: r.maxY))
        path.addLine(to: CGPoint(x: r.minX, y: r.maxY - l))
        return path
    }
}

public struct HUDPanelModifier: ViewModifier {
    public var title: String?
    public var role: HUDRole
    public var padding: CGFloat
    public var showsHairline: Bool
    public var background: Color

    public init(title: String? = nil, role: HUDRole = .machine, padding: CGFloat = HUDTheme.space.m,
                showsHairline: Bool = true, background: Color = HUDTheme.plate) {
        self.title = title
        self.role = role
        self.padding = padding
        self.showsHairline = showsHairline
        self.background = background
    }

    private var bracketColor: Color {
        switch role {
        case .machine: return HUDTheme.arcDim
        case .neutral: return HUDTheme.faint
        default: return role.color
        }
    }

    public func body(content: Content) -> some View {
        VStack(alignment: .leading, spacing: HUDTheme.space.xs) {
            if let title {
                HUDLabel(title, role: role == .machine || role == .neutral ? nil : role)
                    .accessibilityAddTraits(.isHeader)
            }
            content
        }
        .padding(padding)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(background)
        .overlay {
            if showsHairline {
                Rectangle().stroke(HUDTheme.hairline, lineWidth: 1)
            }
        }
        .overlay {
            HUDBrackets()
                .stroke(bracketColor, style: StrokeStyle(lineWidth: 1, lineCap: .square))
                .accessibilityHidden(true)
        }
    }
}

extension View {
    /// Wrap in a HUD panel: plate surface, hairline, bracketed corners, optional mono title.
    public func hudPanel(_ title: String? = nil, role: HUDRole = .machine,
                         padding: CGFloat = HUDTheme.space.m, showsHairline: Bool = true,
                         background: Color = HUDTheme.plate) -> some View {
        modifier(HUDPanelModifier(title: title, role: role, padding: padding,
                                  showsHairline: showsHairline, background: background))
    }
}
