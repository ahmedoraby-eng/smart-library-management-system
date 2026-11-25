// Prepares the hand-recorded Google sign-in clip for scene 2 (macOS, AVFoundation + Vision; no ffmpeg needed).
// usage: google-clip <in.mov> <out.mp4> [--crop x,y,w,h] [--trim from,to] [--cover x,y,w,h[@from-to]]… [--caption "t|s|n"]
//   --crop    keep only this part of the frame (fractions of width/height, from the top left), e.g. the browser window
//   --trim    keep only this time range of the clip (seconds)
//   --keep    from-to:seconds (repeatable, in order): keep these ranges only, each fitted to the given length (played
//             faster when shorter; at its own speed, then held on its last frame, when longer). Replaces --trim.
//   --cover   always blur this box (same units as --crop, on the uncropped frame), optionally only between two times
//   --caption the banner drawn at the bottom, like the recorded scenes ("" for none)
// Any email address on screen (account chooser, avatar menu) is found with on-device text recognition and blurred,
// with a margin in time and space so a moving frame never shows it. The output is checked again the same way: if any
// email is still readable, nothing is kept and the exit code is 2. The clip's own audio is dropped.
import AVFoundation
import CoreImage
import CoreText
import Foundation
import Vision

var W = 1920, H = 1080  // the recorded scenes' size (record-live.ts films 1600×900 CSS px at 1.2×); --size to change
let SAMPLE = 0.1  // seconds between text-recognition passes
let HOLD = 0.5  // a box found at t is blurred from t - HOLD to t + HOLD
let PAD = 0.2  // grow each box by this share of its height on every side

func fail(_ msg: String, _ code: Int32 = 1) -> Never {
  FileHandle.standardError.write("\(msg)\n".data(using: .utf8)!)
  exit(code)
}
func nums(_ s: String, _ n: Int) -> [Double] {
  let v = s.split(separator: ",").compactMap { Double($0.trimmingCharacters(in: .whitespaces)) }
  if v.count != n { fail("expected \(n) numbers in \"\(s)\"") }
  return v
}

var args = Array(CommandLine.arguments.dropFirst())
var positional: [String] = []
var crop: [Double]? = nil
var trim: [Double]? = nil
var keeps: [(from: Double, to: Double, dur: Double)] = []
var covers: [(rect: CGRect, from: Double, to: Double)] = []
var caption = "Or sign in with Google|Staff can also use their Google account. Every email address is blurred.|2 · Sign in"
while !args.isEmpty {
  let a = args.removeFirst()
  func next() -> String {
    if args.isEmpty { fail("\(a) needs a value") }
    return args.removeFirst()
  }
  switch a {
  case "--crop": crop = nums(next(), 4)
  case "--trim": trim = nums(next(), 2)
  case "--caption": caption = next()
  case "--size":
    let v = next().split(separator: "x").compactMap { Int($0) }
    guard v.count == 2 else { fail("--size WxH") }
    (W, H) = (v[0], v[1])
  case "--keep":
    let v = next()
    let p = v.split(separator: ":").map(String.init)
    let r = p.first?.split(separator: "-").compactMap { Double($0) } ?? []
    guard p.count == 2, r.count == 2, let d = Double(p[1]), r[1] > r[0], d > 0 else { fail("--keep from-to:seconds, got \(v)") }
    keeps.append((r[0], r[1], d))
  case "--cover":
    let parts = next().split(separator: "@", maxSplits: 1).map(String.init)
    let r = nums(parts[0], 4)
    var from = 0.0, to = Double.infinity
    if parts.count == 2 {
      let t = parts[1].split(separator: "-").compactMap { Double($0) }
      if t.count != 2 { fail("--cover time must be from-to") }
      (from, to) = (t[0], t[1])
    }
    covers.append((CGRect(x: r[0], y: 1 - r[1] - r[3], width: r[2], height: r[3]), from, to))  // to Vision/CI (bottom left)
  default: positional.append(a)
  }
}
guard positional.count == 2 else {
  fail("usage: google-clip <in.mov> <out.mp4> [--crop x,y,w,h] [--trim from,to] [--cover x,y,w,h[@from-to]]… [--caption \"t|s|n\"]")
}
let inURL = URL(fileURLWithPath: positional[0])
let outURL = URL(fileURLWithPath: positional[1])

// MARK: email detection

let emailLike = try NSRegularExpression(pattern: "[A-Za-z0-9._%+-]+\\s?@\\s?[A-Za-z0-9-]+(\\.[A-Za-z0-9-]+)*|@[A-Za-z0-9-]+\\.|gmail|googlemail", options: [.caseInsensitive])

/** Placeholders and demo accounts on reserved domains (name@example.com, …@smartlibrary.example, …@x.test) are not
 * anyone's address: they stay readable. Any other address is blurred. */
let publicDomain = try NSRegularExpression(pattern: "@\\s?([A-Za-z0-9-]+\\.)*(example(\\.com|\\.org)?|test|invalid)\\b", options: [.caseInsensitive])
func isPublic(_ s: String) -> Bool {
  let r = NSRange(s.startIndex..., in: s)
  return publicDomain.firstMatch(in: s, range: r) != nil && !s.lowercased().contains("gmail")
}

/** Boxes (normalised, bottom-left origin) of every text line that looks like an email address. */
/** What matched, masked (first two letters, then the domain), for the refusal message. */
var matched = Set<String>()
func mask(_ s: String) -> String {
  guard let at = s.firstIndex(of: "@") else { return String(s.prefix(2)) + "…" }
  let before = s[..<at].split(separator: " ").last.map(String.init) ?? ""
  return String(before.prefix(2)) + "…" + String(s[at...].prefix(20))
}
func emailBoxes(_ image: CGImage) -> [CGRect] {
  let req = VNRecognizeTextRequest()
  req.recognitionLevel = .accurate
  req.usesLanguageCorrection = false
  req.minimumTextHeight = 0
  try? VNImageRequestHandler(cgImage: image, options: [:]).perform([req])
  var out: [CGRect] = []
  for obs in req.results ?? [] {
    for cand in obs.topCandidates(3) {
      let s = cand.string
      if emailLike.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)) != nil && !isPublic(s) {
        out.append(obs.boundingBox)
        matched.insert(mask(s))
        break
      }
    }
  }
  return out
}

func frameTimes(_ duration: Double, step: Double) -> [Double] {
  stride(from: 0.0, through: max(0, duration - 0.001), by: step).map { $0 }
}

func scan(_ asset: AVAsset, step: Double, within: [(from: Double, to: Double, dur: Double)] = []) async throws -> [(t: Double, boxes: [CGRect])] {
  let gen = AVAssetImageGenerator(asset: asset)
  gen.appliesPreferredTrackTransform = true
  gen.requestedTimeToleranceBefore = .zero
  gen.requestedTimeToleranceAfter = CMTime(seconds: step / 2, preferredTimescale: 600)
  let dur = try await asset.load(.duration).seconds
  var found: [(Double, [CGRect])] = []
  for t in frameTimes(dur, step: step) where within.isEmpty || within.contains(where: { t >= $0.from - HOLD && t <= $0.to + HOLD }) {
    guard let img = try? await gen.image(at: CMTime(seconds: t, preferredTimescale: 600)).image else { continue }
    let b = emailBoxes(img)
    if !b.isEmpty { found.append((t, b)) }
  }
  return found
}

// MARK: render

let asset = AVURLAsset(url: inURL)
guard let track = try await asset.loadTracks(withMediaType: .video).first else { fail("no video in \(inURL.path)") }
let srcSize = try await track.load(.naturalSize)
let duration = try await asset.load(.duration).seconds
let t0 = keeps.first?.from ?? trim?[0] ?? 0
let t1 = min(keeps.last?.to ?? trim?[1] ?? duration, duration)
let outLength = keeps.isEmpty ? t1 - t0 : keeps.reduce(0) { $0 + $1.dur }
/** Where source time t lands in the output, or nil if it is cut. */
func outTime(_ t: Double) -> Double? {
  if keeps.isEmpty { return t - t0 }
  var acc = 0.0
  for k in keeps {
    if t >= k.from && t < k.to {
      let len = k.to - k.from
      return acc + (t - k.from) * (k.dur < len ? k.dur / len : 1)
    }
    acc += k.dur
  }
  return nil
}
if t1 <= t0 { fail("--trim is outside the clip (\(String(format: "%.1f", duration)) s)") }

print(String(format: "google-clip: %.0f×%.0f, %.1f s; looking for email addresses…", srcSize.width, srcSize.height, duration))
let hits = try await scan(asset, step: SAMPLE, within: keeps)
print("google-clip: email text in \(hits.count) of \(frameTimes(duration, step: SAMPLE).count) sampled frames")

func boxes(at t: Double) -> [CGRect] {
  var r: [CGRect] = []
  for h in hits where abs(h.t - t) <= HOLD { r.append(contentsOf: h.boxes) }
  for c in covers where t >= c.from && t <= c.to { r.append(c.rect) }
  return r
}

/** The banner of the recorded scenes (stage.ts), drawn once at the output size. */
func banner(_ spec: String) -> CIImage? {
  let p = spec.split(separator: "|", omittingEmptySubsequences: false).map(String.init)
  guard let title = p.first, !title.isEmpty else { return nil }
  let sub = p.count > 1 ? p[1] : "", chip = p.count > 2 ? p[2].uppercased() : ""
  let k = CGFloat(W) / 1600  // the banner is designed at 1600 px wide
  let barH = Int(150 * k), fade = Int(24 * k)
  let cs = CGColorSpaceCreateDeviceRGB()
  guard let ctx = CGContext(data: nil, width: W, height: barH, bitsPerComponent: 8, bytesPerRow: 0, space: cs,
                            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
  // Opaque like the scenes' banner (rgba .97 over a page reads as solid), with a short fade at the top.
  ctx.setFillColor(CGColor(red: 15/255, green: 20/255, blue: 48/255, alpha: 1))
  ctx.fill(CGRect(x: 0, y: 0, width: W, height: barH - fade))
  for i in 0..<fade {
    ctx.setFillColor(CGColor(red: 15/255, green: 20/255, blue: 48/255, alpha: CGFloat(fade - i) / CGFloat(fade)))
    ctx.fill(CGRect(x: 0, y: barH - fade + i, width: W, height: 1))
  }
  func line(_ s: String, size: CGFloat, weight: CGFloat, color: CGColor, y: CGFloat) {
    let font = CTFontCreateWithName(".AppleSystemUIFont" as CFString, size * k, nil)
    let traits = [kCTFontWeightTrait: weight] as CFDictionary
    let f = CTFontCreateCopyWithAttributes(font, size * k, nil, CTFontDescriptorCreateWithAttributes([kCTFontTraitsAttribute: traits] as CFDictionary))
    let attr = NSAttributedString(string: s, attributes: [.init(kCTFontAttributeName as String): f, .init(kCTForegroundColorAttributeName as String): color])
    ctx.textPosition = CGPoint(x: 48 * k, y: y * k)
    CTLineDraw(CTLineCreateWithAttributedString(attr), ctx)
  }
  line(chip, size: 13, weight: 0.3, color: CGColor(red: 165/255, green: 180/255, blue: 252/255, alpha: 1), y: 104)
  line(title, size: 30, weight: 0.35, color: CGColor(red: 1, green: 1, blue: 1, alpha: 1), y: 64)
  line(sub, size: 19, weight: 0, color: CGColor(red: 199/255, green: 210/255, blue: 254/255, alpha: 1), y: 30)
  return ctx.makeImage().map { CIImage(cgImage: $0) }
}
let bar = banner(caption)
let background = CIImage(color: CIColor(red: 15/255, green: 20/255, blue: 48/255)).cropped(to: CGRect(x: 0, y: 0, width: W, height: H))

let reader = try AVAssetReader(asset: asset)
reader.timeRange = CMTimeRange(start: CMTime(seconds: t0, preferredTimescale: 600), end: CMTime(seconds: t1, preferredTimescale: 600))
let rOut = AVAssetReaderTrackOutput(track: track, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
reader.add(rOut)
try? FileManager.default.removeItem(at: outURL)
let writer = try AVAssetWriter(outputURL: outURL, fileType: .mp4)
let wIn = AVAssetWriterInput(mediaType: .video, outputSettings: [
  AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: W, AVVideoHeightKey: H,
  AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 12_000_000],
])
wIn.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: wIn, sourcePixelBufferAttributes: [
  kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA, kCVPixelBufferWidthKey as String: W, kCVPixelBufferHeightKey as String: H,
])
writer.add(wIn)
reader.startReading()
writer.startWriting()
writer.startSession(atSourceTime: .zero)
let ci = CIContext()

var frames = 0
var last: CMTime = .zero
while let sb = rOut.copyNextSampleBuffer() {
  guard let px = CMSampleBufferGetImageBuffer(sb) else { continue }
  let pts = CMSampleBufferGetPresentationTimeStamp(sb)
  let t = pts.seconds
  // Cut frames, and frames that a speed-up puts on the previous one's time, are skipped before any work.
  guard let o = outTime(t) else { continue }
  let ot = CMTime(seconds: o, preferredTimescale: 6000)
  if frames > 0 && ot <= last { continue }
  var img = CIImage(cvPixelBuffer: px)
  let ext = img.extent
  for b in boxes(at: t) {
    let pad = b.height * PAD
    let r = CGRect(x: (b.minX - pad) * ext.width, y: (b.minY - pad) * ext.height,
                   width: (b.width + 2 * pad) * ext.width, height: (b.height + 2 * pad) * ext.height).integral.intersection(ext)
    let scale = max(8, r.height / 3)
    let blurred = img.clampedToExtent().applyingFilter("CIPixellate", parameters: [kCIInputScaleKey: scale])
      .applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: scale]).cropped(to: r)
    img = blurred.composited(over: img)
  }
  if let c = crop {
    img = img.cropped(to: CGRect(x: c[0] * ext.width, y: (1 - c[1] - c[3]) * ext.height, width: c[2] * ext.width, height: c[3] * ext.height))
  }
  let e = img.extent
  let s = min(CGFloat(W) / e.width, CGFloat(H) / e.height)
  img = img.transformed(by: CGAffineTransform(translationX: -e.minX, y: -e.minY).concatenating(CGAffineTransform(scaleX: s, y: s)))
  img = img.transformed(by: CGAffineTransform(translationX: (CGFloat(W) - e.width * s) / 2, y: (CGFloat(H) - e.height * s) / 2))
  img = img.composited(over: background)
  if let bar { img = bar.composited(over: img) }
  while !wIn.isReadyForMoreMediaData { usleep(2000) }
  var outPx: CVPixelBuffer?
  CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &outPx)
  guard let outPx else { fail("no pixel buffer") }
  ci.render(img, to: outPx, bounds: CGRect(x: 0, y: 0, width: W, height: H), colorSpace: CGColorSpaceCreateDeviceRGB())
  last = ot
  adaptor.append(outPx, withPresentationTime: ot)
  frames += 1
}
wIn.markAsFinished()
writer.endSession(atSourceTime: CMTime(seconds: outLength, preferredTimescale: 600))
await writer.finishWriting()
if writer.status != .completed { fail("writing failed: \(writer.error?.localizedDescription ?? "?")") }

// MARK: check the result

matched.removeAll()
let check = try await scan(AVURLAsset(url: outURL), step: SAMPLE)
if !check.isEmpty {
  FileHandle.standardError.write("still readable: \(matched.sorted().joined(separator: ", "))\n".data(using: .utf8)!)
  // Kept aside (never used by the pipeline) so the frame can be inspected.
  let rejected = outURL.deletingPathExtension().appendingPathExtension("rejected.mp4")
  try? FileManager.default.removeItem(at: rejected)
  try? FileManager.default.moveItem(at: outURL, to: rejected)
  fail(String(format: "google-clip: an email address is still readable at %@ s; nothing kept. Add --cover boxes.",
              check.map { String(format: "%.1f", $0.t) }.joined(separator: ", ")), 2)
}
print(String(format: "google-clip: written %@ (%d frames, %.1f s); no email address readable", outURL.path, frames, outLength))
