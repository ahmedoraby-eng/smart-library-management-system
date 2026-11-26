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
import Foundation

struct Mark: Decodable { let scene: Int; let start: Double; let end: Double }

func fail(_ msg: String) -> Never {
  FileHandle.standardError.write("\(msg)\n".data(using: .utf8)!)
  exit(1)
}

var rest = Array(CommandLine.arguments.dropFirst())
var pos: [String] = []
var insert: (scene: Int, url: URL)? = nil
var lineAtArg: Double? = nil
var lineEndArg: Double? = nil
var cropMain: CGSize? = nil  // --crop-main WxH: the recording only fills this top-left area (Playwright pads to the video size)
while !rest.isEmpty {
  let a = rest.removeFirst()
  switch a {
  case "--insert":
    guard let v = rest.first, let colon = v.firstIndex(of: ":"), let n = Int(v[..<colon]) else { fail("--insert N:<clip.mp4>") }
    insert = (n, URL(fileURLWithPath: String(v[v.index(after: colon)...])))
    rest.removeFirst()
  case "--crop-main":
    guard let v = rest.first?.split(separator: "x").compactMap({ Double($0) }), v.count == 2 else { fail("--crop-main WxH") }
    cropMain = CGSize(width: v[0], height: v[1])
    rest.removeFirst()
  case "--line-end":
    guard let v = rest.first.flatMap(Double.init) else { fail("--line-end <seconds>") }
    lineEndArg = v
    rest.removeFirst()
  case "--line-at":
    guard let v = rest.first.flatMap(Double.init) else { fail("--line-at <seconds>") }
    lineAtArg = v
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
func place(_ src: AVAssetTrack, _ range: CMTimeRange, at: CMTime, length: CMTime) throws {
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

  if let ins = insert, ins.scene == m.scene {
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
  try place(vSrc, CMTimeRange(start: start, duration: seg), at: at, length: length)
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

let out = URL(fileURLWithPath: pos[3])
try? FileManager.default.removeItem(at: out)
guard let export = AVAssetExportSession(asset: comp, presetName: AVAssetExportPresetHighestQuality) else {
  fail("cannot export")
}
export.videoComposition = videoComposition
try await export.export(to: out, as: .mp4)
print(String(format: "written: %@ (%.1f s)", pos[3], at.seconds))
