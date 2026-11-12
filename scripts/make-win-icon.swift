// Icona Windows: logo trasparente ritagliato ai bordi del disegno e ingrandito fino a riempire
// quasi tutto il riquadro (Windows non aggiunge margini: con il margine del logo l'icona sembrava piccola).
// Uso: swift scripts/make-win-icon.swift <logo.png> <uscita.png> [riempimento, predefinito 0.96]
import AppKit
let args = CommandLine.arguments
guard args.count >= 3, let data = try? Data(contentsOf: URL(fileURLWithPath: args[1])), let src = NSBitmapImageRep(data: data) else { print("uso: make-win-icon.swift logo.png uscita.png [riempimento]"); exit(1) }
let fill = args.count > 3 ? CGFloat(Double(args[3]) ?? 0.96) : 0.96
// riquadro dei pixel visibili (alfa > 8)
var minX = src.pixelsWide, minY = src.pixelsHigh, maxX = -1, maxY = -1
for y in 0..<src.pixelsHigh { for x in 0..<src.pixelsWide {
 if let c = src.colorAt(x: x, y: y), c.alphaComponent > 8.0/255.0 { minX = min(minX, x); maxX = max(maxX, x); minY = min(minY, y); maxY = max(maxY, y) }
}}
guard maxX >= 0, let cg = src.cgImage, let cropped = cg.cropping(to: CGRect(x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1)) else { print("logo vuoto"); exit(1) }
let size: CGFloat = 1024, w = CGFloat(cropped.width), h = CGFloat(cropped.height), k = size * fill / max(w, h)
let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(size), pixelsHigh: Int(size), bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
let ctx = NSGraphicsContext(bitmapImageRep: rep)!; NSGraphicsContext.current = ctx
ctx.imageInterpolation = .high
ctx.cgContext.draw(cropped, in: CGRect(x: (size - w * k) / 2, y: (size - h * k) / 2, width: w * k, height: h * k))
NSGraphicsContext.restoreGraphicsState()
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: args[2]))
print("ok", args[2], "logo", Int(w), "x", Int(h), "->", Int(w * k), "x", Int(h * k))
