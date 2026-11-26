// Lays each narration clip over its scene with AVFoundation (macOS), so no ffmpeg install is needed.
// usage: assemble <silent.mp4> <scenes.json> <audio-dir> <out.mp4> [--insert N:<clip.mp4>] [--line-at <s>] [--line-end <s>]
// scenes.json: [{"scene": 1, "start": 0.0, "end": 24.8}, …] in seconds of the silent video (record-live.ts writes it).
// Scene N's screen time becomes the length of <audio-dir>/scene-N.m4a: a shorter scene holds its last frame for the
// rest, a longer one plays a little faster. A scene without a clip keeps its own length, silent.
// --insert adds a video clip (google-clip.swift's output, same size, its sound ignored) at the end of scene N, under
// the scene's last sentence: the clip starts where that sentence starts in scene-N.m4a (the last pause before it), or
// at --line-at seconds into the narration. The recorded part before it is cut to that point (its tail is a still
// dashboard), the clip plays at its own speed and holds its last frame if the sentence runs longer (if the clip is longer,
// the scene runs up to 3 s past the sentence, then the clip plays faster).
import AVFoundation
import CoreText
import ImageIO
import QuartzCore
import Foundation

struct Mark: Decodable { let scene: Int; let start: Double; let end: Double }

func fail(_ msg: String) -> Never {
  FileHandle.standardError.write("\(msg)\n".data(using: .utf8)!)
  exit(1)
}

var rest = Array(CommandLine.arguments.dropFirst())
var pos: [String] = []
// --insert may repeat (script v3: Ahmed's Google clip in two parts, scenes 2 and 3); --line-at and --line-end
// belong to the --insert just before them.
struct Insert { let scene: Int; let url: URL; var lineAt: Double? = nil; var lineEnd: Double? = nil }
var inserts: [Insert] = []
var anchors: [Int: [(Double, Double)]] = [:]
var skips: [(Double, Double)] = []
var imageOverlays: [(scene: Int, from: Double, to: Double?, file: String)] = []
var overlays: [(scene: Int, from: Double, to: Double?, title: String, sub: String)] = []
var sceneSpan: [Int: (start: Double, end: Double)] = [:]
var cropMain: CGSize? = nil  // --crop-main WxH: the recording only fills this top-left area (Playwright pads to the video size)
while !rest.isEmpty {
  let a = rest.removeFirst()
  switch a {
  case "--insert":
    guard let v = rest.first, let colon = v.firstIndex(of: ":"), let n = Int(v[..<colon]) else { fail("--insert N:<clip.mp4>") }
    inserts.append(Insert(scene: n, url: URL(fileURLWithPath: String(v[v.index(after: colon)...]))))
    rest.removeFirst()
  case "--anchors":
    // --anchors N:s1=v1,s2=v2,…   row sync (Ahmed 26/11): footage second s (from the scene's start in the recording)
    // must play at narration second v. Between anchors the picture runs at 0.85–1.2×; a longer stretch (a page load)
    // is cut in the middle, a shorter one holds its last frame just before the next event. The voice never moves.
    guard let v = rest.first, let colon = v.firstIndex(of: ":"), let n = Int(v[..<colon]) else { fail("--anchors N:s=v,…") }
    anchors[n] = v[v.index(after: colon)...].split(separator: ",").compactMap { pair in
      let kv = pair.split(separator: "=").compactMap { Double($0) }
      return kv.count == 2 ? (kv[0], kv[1]) : nil
    }
    rest.removeFirst()
  case "--skip":
    // --skip a-b,c-d   footage seconds (of the silent recording) never shown: the SLM-15 opening splash; the
    // footage around them fills the same narration time
    guard let v = rest.first else { fail("--skip a-b,…") }
    skips = v.split(separator: ",").compactMap { r in
      let x = r.split(separator: "-").compactMap { Double($0) }
      return x.count == 2 ? (x[0], x[1]) : nil
    }
    rest.removeFirst()
  case "--overlay-image":
    // --overlay-image N:from-to|file.png   a full-frame picture over scene N (e.g. the end card), fading in
    guard let v = rest.first, let colon = v.firstIndex(of: ":"), let n = Int(v[..<colon]) else { fail("--overlay-image N:from-to|png") }
    let parts = v[v.index(after: colon)...].split(separator: "|").map(String.init)
    let r = parts[0].split(separator: "-").map(String.init)
    imageOverlays.append((n, Double(r[0]) ?? 0, r.count > 1 ? Double(r[1]) : nil, parts.count > 1 ? parts[1] : ""))
    rest.removeFirst()
  case "--overlay":
    // --overlay N:from-to|Title|Sub   a caption drawn in post over scene N, from..to seconds into its narration
    // ("end" = the scene's end); used where the live recording fell behind the voice (script v3, scene 9)
    guard let v = rest.first, let colon = v.firstIndex(of: ":"), let n = Int(v[..<colon]) else { fail("--overlay N:from-to|Title|Sub") }
    let parts = v[v.index(after: colon)...].split(separator: "|", omittingEmptySubsequences: false).map(String.init)
    let r = parts[0].split(separator: "-").map(String.init)
    overlays.append((n, Double(r[0]) ?? 0, r.count > 1 ? Double(r[1]) : nil, parts.count > 1 ? parts[1] : "", parts.count > 2 ? parts[2] : ""))
    rest.removeFirst()
  case "--crop-main":
    guard let v = rest.first?.split(separator: "x").compactMap({ Double($0) }), v.count == 2 else { fail("--crop-main WxH") }
    cropMain = CGSize(width: v[0], height: v[1])
    rest.removeFirst()
  case "--line-end":
    guard let v = rest.first.flatMap(Double.init) else { fail("--line-end <seconds>") }
    guard !inserts.isEmpty else { fail("--line-end comes after its --insert") }
    inserts[inserts.count - 1].lineEnd = v
    rest.removeFirst()
  case "--line-at":
    guard let v = rest.first.flatMap(Double.init) else { fail("--line-at <seconds>") }
    guard !inserts.isEmpty else { fail("--line-at comes after its --insert") }
    inserts[inserts.count - 1].lineAt = v
    rest.removeFirst()
  default: pos.append(a)
  }
}
guard pos.count == 4 else {
  fail("usage: assemble <silent.mp4> <scenes.json> <audio-dir> <out.mp4> [--insert N:<clip.mp4>] [--line-at <s>] [--line-end <s>]")
}
let marks = try JSONDecoder().decode([Mark].self, from: Data(contentsOf: URL(fileURLWithPath: pos[1])))
let video = AVURLAsset(url: URL(fileURLWithPath: pos[0]))
guard let vSrc = try await video.loadTracks(withMediaType: .video).first else { fail("no video track in \(pos[0])") }
let videoEnd = try await video.load(.duration)

let comp = AVMutableComposition()
let vOut = comp.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!
let aOut = comp.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)!
let ts: CMTimeScale = 600
func t(_ s: Double) -> CMTime { CMTime(seconds: s, preferredTimescale: ts) }

/** Puts `range` of `src` at `at` and fits it to `length`: holds its last 0.2 s when shorter, plays faster when longer. */
/** Where each source starts in the output (for its scale to the render size), and where to dip between shots. */
var sources: [(at: CMTime, track: AVAssetTrack)] = []
var cuts: [CMTime] = []
/** Inserts `range` at `at`, scaled uniformly to `length` (no tail hold): the row-sync pieces. */
func placeExact(_ src: AVAssetTrack, _ range: CMTimeRange, at: CMTime, length: CMTime) throws {
  // drop --skip ranges (main recording only) and spread the rest over the same length
  if src === vSrc, !skips.isEmpty {
    let a = range.start.seconds, b = (range.start + range.duration).seconds
    var parts: [(Double, Double)] = [(a, b)]
    for (x, y) in skips {
      parts = parts.flatMap { (p, q) -> [(Double, Double)] in
        if y <= p || x >= q { return [(p, q)] }
        return [(p, max(p, x)), (min(q, y), q)].filter { $0.1 - $0.0 > 0.02 }
      }
    }
    let kept = parts.reduce(0) { $0 + ($1.1 - $1.0) }
    if parts.count != 1 || abs(kept - (b - a)) > 0.001 {
      guard kept > 0.04 else {  // all of it was splash: hold the frame just after it
        try placeExactRaw(src, CMTimeRange(start: t(min(b + 0.05, videoEnd.seconds - 0.1)), duration: t(1.0 / 30)), at: at, length: length)
        return
      }
      var cur = at
      for (k, (p, q)) in parts.enumerated() {
        let len = k == parts.count - 1 ? (at + length) - cur : t((q - p) / kept * length.seconds)
        try placeExactRaw(src, CMTimeRange(start: t(p), duration: t(q - p)), at: cur, length: len)
        cur = cur + len
      }
      return
    }
  }
  try placeExactRaw(src, range, at: at, length: length)
}
func placeExactRaw(_ src: AVAssetTrack, _ range: CMTimeRange, at: CMTime, length: CMTime) throws {
  if sources.last?.track !== src {
    sources.append((at, src))
    if at > .zero { cuts.append(at) }
  }
  try vOut.insertTimeRange(range, of: src, at: at)
  if range.duration != length { vOut.scaleTimeRange(CMTimeRange(start: at, duration: range.duration), toDuration: length) }
}

func place(_ src: AVAssetTrack, _ range: CMTimeRange, at: CMTime, length: CMTime) throws {
  if src === vSrc, !skips.isEmpty { return try placeExact(src, range, at: at, length: length) }  // splash cut out
  if sources.last?.track !== src {
    sources.append((at, src))
    if at > .zero { cuts.append(at) }
  }
  try vOut.insertTimeRange(range, of: src, at: at)
  let seg = range.duration
  if length > seg {
    let tail = CMTimeMinimum(t(0.2), seg)
    vOut.scaleTimeRange(CMTimeRange(start: at + seg - tail, duration: tail), toDuration: tail + (length - seg))
  } else if length < seg {
    vOut.scaleTimeRange(CMTimeRange(start: at, duration: seg), toDuration: length)
  }
}

/**
 * Where the narration's last sentence starts: the end of the last pause (≥ 0.35 s of near-silence) that has at least
 * 1.5 s of speech after it, minus 0.15 s. nil if there is none.
 */
func lastSentenceStart(_ url: URL) async throws -> Double? {
  let asset = AVURLAsset(url: url)
  guard let track = try await asset.loadTracks(withMediaType: .audio).first else { return nil }
  let reader = try AVAssetReader(asset: asset)
  let rate = 16000.0
  let o = AVAssetReaderTrackOutput(track: track, outputSettings: [
    AVFormatIDKey: kAudioFormatLinearPCM, AVLinearPCMBitDepthKey: 16, AVLinearPCMIsFloatKey: false,
    AVLinearPCMIsBigEndianKey: false, AVNumberOfChannelsKey: 1, AVSampleRateKey: rate,
  ])
  reader.add(o)
  reader.startReading()
  var samples: [Int16] = []
  while let sb = o.copyNextSampleBuffer(), let bb = CMSampleBufferGetDataBuffer(sb) {
    var len = 0
    var ptr: UnsafeMutablePointer<CChar>?
    CMBlockBufferGetDataPointer(bb, atOffset: 0, lengthAtOffsetOut: nil, totalLengthOut: &len, dataPointerOut: &ptr)
    ptr!.withMemoryRebound(to: Int16.self, capacity: len / 2) { samples.append(contentsOf: UnsafeBufferPointer(start: $0, count: len / 2)) }
  }
  let win = Int(rate * 0.05)
  var rms: [Double] = []
  var i = 0
  while i + win <= samples.count {
    var s = 0.0
    for j in i..<(i + win) { let v = Double(samples[j]) / 32768; s += v * v }
    rms.append(sqrt(s / Double(win)))
    i += win
  }
  guard !rms.isEmpty else { return nil }
  let thr = rms.sorted()[Int(Double(rms.count) * 0.95)] * 0.08
  let lastSpeech = Double(rms.lastIndex { $0 >= thr } ?? 0) * 0.05
  var start: Int? = nil
  var best: Double? = nil
  for (k, v) in rms.enumerated() {
    if v < thr { if start == nil { start = k } } else if let s = start {
      let end = Double(k) * 0.05
      if Double(k - s) * 0.05 >= 0.35 && Double(s) * 0.05 > 0.5 && lastSpeech - end >= 1.5 { best = end }
      start = nil
    }
  }
  return best.map { max(0, $0 - 0.15) }
}

var at = CMTime.zero
for m in marks {
  let sceneAt = at.seconds
  defer { sceneSpan[m.scene] = (sceneAt, at.seconds) }
  let start = t(m.start)
  let end = CMTimeMinimum(t(m.end), videoEnd)
  let seg = end - start
  guard seg > .zero else { continue }
  let clipURL = URL(fileURLWithPath: "\(pos[2])/scene-\(m.scene).m4a")
  let hasClip = FileManager.default.fileExists(atPath: clipURL.path)
  let clip = hasClip ? AVURLAsset(url: clipURL) : nil
  let clipLen = try await clip?.load(.duration)
  if let clip, let aSrc = try await clip.loadTracks(withMediaType: .audio).first {
    try aOut.insertTimeRange(CMTimeRange(start: .zero, duration: clipLen!), of: aSrc, at: at)
  }

  if let ins = inserts.first(where: { $0.scene == m.scene }) {
    let lineAtArg = ins.lineAt, lineEndArg = ins.lineEnd
    let extra = AVURLAsset(url: ins.url)
    guard let eSrc = try await extra.loadTracks(withMediaType: .video).first else { fail("no video in \(ins.url.path)") }
    let eLen = try await extra.load(.duration)
    let total = clipLen ?? (seg + eLen)
    var lineAt: Double
    if let v = lineAtArg {
      lineAt = v
    } else if hasClip, let found = try await lastSentenceStart(clipURL) {
      lineAt = found
    } else {
      lineAt = max(0, total.seconds - eLen.seconds)
    }
    lineAt = min(max(lineAt, 0.5), total.seconds - 0.5)
    let before = t(lineAt)
    // The recorded part: cut to the sentence (or held, if it was shorter), then the clip under the sentence.
    try place(vSrc, CMTimeRange(start: start, duration: CMTimeMinimum(seg, before)), at: at, length: before)
    // Natural speed; if the clip outlasts the sentence, the scene runs up to 3 s longer (silent), then speeds up.
    if let endAt = lineEndArg, endAt > lineAt, endAt < total.seconds {
      // A middle range: the clip covers the narration from --line-at to --line-end, the recording resumes after it
      // (the recorder holds a still sign-in page meanwhile, so nothing is lost).
      let end = t(endAt)
      try place(eSrc, CMTimeRange(start: .zero, duration: eLen), at: at + before, length: end - before)
      let rest = CMTimeMaximum(.zero, CMTimeMinimum(seg - end, seg))
      if rest > .zero {
        try place(vSrc, CMTimeRange(start: start + end, duration: rest), at: at + end, length: total - end)
      }
      print(String(format: "scene %d: the inserted clip (%.1f s) covers %.1f–%.1f s of the narration", m.scene, eLen.seconds, lineAt, endAt))
      at = at + total
      cuts.append(at)
      continue
    }
    let sentence = total - before
    let shown = CMTimeMaximum(sentence, CMTimeMinimum(eLen, sentence + t(3)))
    try place(eSrc, CMTimeRange(start: .zero, duration: eLen), at: at + before, length: shown)
    print(String(format: "scene %d: screen %.1f s → %.1f s, then the inserted clip (%.1f s) as %.1f s under the last sentence (%.1f s)",
                 m.scene, seg.seconds, lineAt, eLen.seconds, shown.seconds, sentence.seconds))
    if eLen > shown {
      print(String(format: "  note: the clip plays %.1f× faster to fit; trim it with google-clip --trim", eLen.seconds / shown.seconds))
    }
    at = at + before + shown
    cuts.append(at)
    continue
  }

  let length = clipLen ?? seg
  if let an = anchors[m.scene], !an.isEmpty {
    // piecewise: (0,0) … anchors … (seg, length), kept only while both sides move forward
    var pts: [(Double, Double)] = [(0, 0)]
    for (sx, vx) in an.sorted(by: { $0.0 < $1.0 }) where sx > pts.last!.0 + 0.15 && vx > pts.last!.1 + 0.15
      && sx < seg.seconds - 0.15 && vx < length.seconds - 0.15 { pts.append((sx, vx)) }
    pts.append((seg.seconds, length.seconds))
    var cursor = at
    var notes: [String] = []
    for k in 1..<pts.count {
      let (s0, v0) = pts[k - 1], (s1, v1) = pts[k]
      let ds = s1 - s0, dv = v1 - v0
      let r = ds / dv
      if r > 1.2 {
        // too much footage (a page load): keep the start and the end, cut the middle, play at 1.2×
        let keep = dv * 1.2, a = min(0.8, keep * 0.3), b = keep - a
        try placeExact(vSrc, CMTimeRange(start: start + t(s0), duration: t(a)), at: cursor, length: t(a / 1.2))
        cursor = cursor + t(a / 1.2)
        try placeExact(vSrc, CMTimeRange(start: start + t(s1 - b), duration: t(b)), at: cursor, length: t(b / 1.2))
        cursor = cursor + t(b / 1.2)
        notes.append(String(format: "cut %.1fs", ds - keep))
      } else if r < 0.85 {
        // too little: 0.85× then hold the frame just before the next event
        let play = ds / 0.85
        try placeExact(vSrc, CMTimeRange(start: start + t(s0), duration: t(ds)), at: cursor, length: t(play))
        cursor = cursor + t(play)
        let hold = dv - play
        if hold > 0.02 {
          try placeExact(vSrc, CMTimeRange(start: start + t(max(s0, s1 - 1.0 / 30)), duration: t(1.0 / 30)), at: cursor, length: t(hold))
          cursor = cursor + t(hold)
          notes.append(String(format: "hold %.1fs", hold))
        }
      } else {
        try placeExact(vSrc, CMTimeRange(start: start + t(s0), duration: t(ds)), at: cursor, length: t(dv))
        cursor = cursor + t(dv)
        if abs(r - 1) > 0.03 { notes.append(String(format: "%.2fx", r)) }
      }
    }
    print(String(format: "scene %d: synced on %d events (%@)", m.scene, pts.count - 2, notes.joined(separator: ", ")))
  } else if !skips.isEmpty {
    try placeExact(vSrc, CMTimeRange(start: start, duration: seg), at: at, length: length)
  } else {
    try place(vSrc, CMTimeRange(start: start, duration: seg), at: at, length: length)
  }
  print(String(format: "scene %d: screen %.1f s → %.1f s", m.scene, seg.seconds, length.seconds))
  at = at + length
  cuts.append(at)
}

// No clip at all: an empty audio track would make the export fail.
if aOut.segments.isEmpty { comp.removeTrack(aOut) }
// 1920×1080, every source scaled to fit; a 0.2 s dip to black on both sides of each scene change and splice.
let render = CGSize(width: 1920, height: 1080)
let layer = AVMutableVideoCompositionLayerInstruction(assetTrack: vOut)
for s in sources {
  var size = try await s.track.load(.naturalSize)
  if let c = cropMain, s.track === vSrc {
    size = c
    layer.setCropRectangle(CGRect(origin: .zero, size: c), at: s.at)
  } else {
    layer.setCropRectangle(CGRect(origin: .zero, size: size), at: s.at)
  }
  let k = min(render.width / size.width, render.height / size.height)
  let tx = CGAffineTransform(scaleX: k, y: k).concatenating(
    CGAffineTransform(translationX: (render.width - size.width * k) / 2, y: (render.height - size.height * k) / 2))
  layer.setTransform(tx, at: s.at)
}
let dip = t(0.2)
for c in Set(cuts.map { $0.seconds }).sorted().map(t) where c > dip && c < at - dip {
  layer.setOpacityRamp(fromStartOpacity: 1, toEndOpacity: 0, timeRange: CMTimeRange(start: c - dip, duration: dip))
  layer.setOpacityRamp(fromStartOpacity: 0, toEndOpacity: 1, timeRange: CMTimeRange(start: c, duration: dip))
}
let instruction = AVMutableVideoCompositionInstruction()
instruction.timeRange = CMTimeRange(start: .zero, duration: at)
instruction.layerInstructions = [layer]
let videoComposition = AVMutableVideoComposition()
videoComposition.renderSize = render
videoComposition.frameDuration = CMTime(value: 1, timescale: 30)
videoComposition.instructions = [instruction]

if !overlays.isEmpty || !imageOverlays.isEmpty {
  let parent = CALayer(), video = CALayer()
  parent.frame = CGRect(origin: .zero, size: render)
  parent.isGeometryFlipped = true  // measured: without it the overlay lands upside down (bottom bar at the top)
  video.frame = parent.frame
  parent.addSublayer(video)
  let total = at.seconds
  for o in overlays {
    guard let span = sceneSpan[o.scene] else { continue }
    let a0 = span.start + o.from, a1 = o.to.map { span.start + $0 } ?? span.end
    guard a1 > a0 + 0.5 else { continue }
    // the recorder's caption banner, same look (navy bar at the bottom, title 36 px, subtitle 23 px), drawn by hand
    // into a full-frame transparent image: layer geometry and CATextLayer do not survive this export reliably
    let W = Int(render.width), H = Int(render.height)
    let ctx = CGContext(data: nil, width: W, height: H, bitsPerComponent: 8, bytesPerRow: W * 4,
                        space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    let test = ProcessInfo.processInfo.environment["OVERLAY_TEST"] == "1"
    ctx.setFillColor(test ? CGColor(red: 1, green: 0, blue: 0, alpha: 1) : CGColor(red: 15 / 255, green: 20 / 255, blue: 48 / 255, alpha: 0.95))
    ctx.fill(CGRect(x: 0, y: 0, width: W, height: 150))  // CGContext: y 0 is the bottom
    func draw(_ s: String, _ size: CGFloat, _ y: CGFloat, _ color: CGColor, bold: Bool) {
      let font = CTFontCreateWithName((bold ? "Helvetica-Bold" : "Helvetica") as CFString, size, nil)
      let attr = NSAttributedString(string: s, attributes: [
        NSAttributedString.Key(kCTFontAttributeName as String): font,
        NSAttributedString.Key(kCTForegroundColorAttributeName as String): color,
      ])
      let line = CTLineCreateWithAttributedString(attr)
      ctx.textPosition = CGPoint(x: 58, y: y)
      CTLineDraw(line, ctx)
    }
    draw(o.title, 36, 84, CGColor(gray: 1, alpha: 1), bold: true)
    if !o.sub.isEmpty { draw(o.sub, 23, 40, CGColor(red: 0.78, green: 0.82, blue: 1, alpha: 1), bold: false) }
    let bar = CALayer()
    bar.frame = parent.bounds
    bar.contents = ctx.makeImage()
    bar.opacity = test ? 1 : 0
    let fade = 0.3
    let anim = CAKeyframeAnimation(keyPath: "opacity")
    anim.values = [0, 0, 1, 1, 0, 0]
    anim.keyTimes = [0, a0 / total, (a0 + fade) / total, (a1 - fade) / total, a1 / total, 1].map { NSNumber(value: $0) }
    anim.duration = total
    anim.beginTime = AVCoreAnimationBeginTimeAtZero
    anim.isRemovedOnCompletion = false
    anim.fillMode = .both
    if !test { bar.add(anim, forKey: "show") }
    parent.addSublayer(bar)
    print(String(format: "overlay on scene %d: %.1f–%.1f s: %@", o.scene, a0, a1, o.title))
  }
  for o in imageOverlays {
    guard let span = sceneSpan[o.scene],
          let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: o.file) as CFURL, nil),
          let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else { continue }
    let a0 = span.start + o.from, a1 = o.to.map { span.start + $0 } ?? span.end
    let l = CALayer()
    l.frame = parent.bounds
    l.contents = img
    l.contentsGravity = .resizeAspectFill
    l.opacity = 0
    let anim = CAKeyframeAnimation(keyPath: "opacity")
    if o.to != nil, a1 < total - 0.1 {
      // a held still (e.g. the cursor on a link, ringed): fades in, then hands back to identical footage at once
      anim.values = [0, 0, 1, 1, 0, 0]
      anim.keyTimes = [0, a0 / total, (a0 + 0.3) / total, (a1 - 0.04) / total, a1 / total, 1].map { NSNumber(value: $0) }
    } else {
      anim.values = [0, 0, 1, 1]
      anim.keyTimes = [0, a0 / total, (a0 + 0.35) / total, 1].map { NSNumber(value: $0) }
    }
    anim.duration = total
    anim.beginTime = AVCoreAnimationBeginTimeAtZero
    anim.isRemovedOnCompletion = false
    anim.fillMode = .both
    l.add(anim, forKey: "show")
    parent.addSublayer(l)
    print(String(format: "image overlay on scene %d: %.1f–%.1f s", o.scene, a0, a1))
  }
  videoComposition.animationTool = AVVideoCompositionCoreAnimationTool(postProcessingAsVideoLayer: video, in: parent)
}

let out = URL(fileURLWithPath: pos[3])
try? FileManager.default.removeItem(at: out)
guard let export = AVAssetExportSession(asset: comp, presetName: AVAssetExportPresetHighestQuality) else {
  fail("cannot export")
}
export.videoComposition = videoComposition
try await export.export(to: out, as: .mp4)
print(String(format: "written: %@ (%.1f s)", pos[3], at.seconds))
