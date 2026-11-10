// Icona Mac: quadrato arrotondato bianco alle misure della griglia Apple (824 px su 1024)
// con il logo grande al centro. macOS 26 chiude le icone di altra forma in un riquadro grigio.
// Uso: swift scripts/make-mac-icon.swift <logo.png> <uscita.png> [scala-logo, predefinita 0.9]
import AppKit
let args = CommandLine.arguments
guard args.count >= 3, let logo = NSImage(contentsOfFile: args[1]) else { print("uso: make-mac-icon.swift logo.png uscita.png [scala]"); exit(1) }
let scale = args.count > 3 ? CGFloat(Double(args[3]) ?? 0.9) : 0.9
let size: CGFloat = 1024, tile: CGFloat = 824, radius: CGFloat = 185.4
let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(size), pixelsHigh: Int(size), bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
let origin = (size - tile) / 2
let tileRect = NSRect(x: origin, y: origin, width: tile, height: tile)
let path = NSBezierPath(roundedRect: tileRect, xRadius: radius, yRadius: radius)
// leggera ombra come le icone di sistema
let shadow = NSShadow(); shadow.shadowOffset = NSSize(width: 0, height: -10); shadow.shadowBlurRadius = 20; shadow.shadowColor = NSColor.black.withAlphaComponent(0.25)
NSGraphicsContext.saveGraphicsState(); shadow.set(); NSColor.white.setFill(); path.fill(); NSGraphicsContext.restoreGraphicsState()
path.addClip()
let side = tile * scale
logo.draw(in: NSRect(x: (size - side) / 2, y: (size - side) / 2, width: side, height: side), from: .zero, operation: .sourceOver, fraction: 1)
NSGraphicsContext.restoreGraphicsState()
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: args[2]))
print("ok", args[2])
