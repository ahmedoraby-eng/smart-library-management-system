// Lays each narration clip over its scene with AVFoundation (macOS), so no ffmpeg install is needed.
// usage: assemble <silent.mp4> <scenes.json> <audio-dir> <out.mp4> [--insert N:<clip.mp4>] [--line-at <seconds>]
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
while !rest.isEmpty {
  let a = rest.removeFirst()
  switch a {
  case "--insert":
    guard let v = rest.first, let colon = v.firstIndex(of: ":"), let n = Int(v[..<colon]) else { fail("--insert N:<clip.mp4>") }
    insert = (n, URL(fileURLWithPath: String(v[v.index(after: colon)...])))
    rest.removeFirst()
  case "--line-at":
    guard let v = rest.first.flatMap(Double.init) else { fail("--line-at <seconds>") }
    lineAtArg = v
    rest.removeFirst()
  default: pos.append(a)
  }
}
guard pos.count == 4 else {
  fail("usage: assemble <silent.mp4> <scenes.json> <audio-dir> <out.mp4> [--insert N:<clip.mp4>] [--line-at <seconds>]")
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
func place(_ src: AVAssetTrack, _ range: CMTimeRange, at: CMTime, length: CMTime) throws {
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
    let sentence = total - before
    let shown = CMTimeMaximum(sentence, CMTimeMinimum(eLen, sentence + t(3)))
    try place(eSrc, CMTimeRange(start: .zero, duration: eLen), at: at + before, length: shown)
    print(String(format: "scene %d: screen %.1f s → %.1f s, then the inserted clip (%.1f s) as %.1f s under the last sentence (%.1f s)",
                 m.scene, seg.seconds, lineAt, eLen.seconds, shown.seconds, sentence.seconds))
    if eLen > shown {
      print(String(format: "  note: the clip plays %.1f× faster to fit; trim it with google-clip --trim", eLen.seconds / shown.seconds))
    }
    at = at + before + shown
    continue
  }

  let length = clipLen ?? seg
  try place(vSrc, CMTimeRange(start: start, duration: seg), at: at, length: length)
  print(String(format: "scene %d: screen %.1f s → %.1f s", m.scene, seg.seconds, length.seconds))
  at = at + length
}

let out = URL(fileURLWithPath: pos[3])
try? FileManager.default.removeItem(at: out)
guard let export = AVAssetExportSession(asset: comp, presetName: AVAssetExportPresetHighestQuality) else {
  fail("cannot export")
}
try await export.export(to: out, as: .mp4)
print(String(format: "written: %@ (%.1f s)", pos[3], at.seconds))
