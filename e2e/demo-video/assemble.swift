// Lays each narration clip over its scene with AVFoundation (macOS), so no ffmpeg install is needed.
// usage: assemble <silent.mp4> <scenes.json> <audio-dir> <out.mp4>
// scenes.json: [{"scene": 1, "start": 0.0, "end": 24.8}, …] in seconds of the silent video (record-live.ts writes it).
// Scene N's screen time becomes the length of <audio-dir>/scene-N.m4a: a shorter scene holds its last frame for the
// rest, a longer one plays a little faster. A scene without a clip keeps its own length, silent.
import AVFoundation
import Foundation

struct Mark: Decodable { let scene: Int; let start: Double; let end: Double }

func fail(_ msg: String) -> Never {
  FileHandle.standardError.write("\(msg)\n".data(using: .utf8)!)
  exit(1)
}

let args = CommandLine.arguments
guard args.count == 5 else { fail("usage: assemble <silent.mp4> <scenes.json> <audio-dir> <out.mp4>") }
let marks = try JSONDecoder().decode([Mark].self, from: Data(contentsOf: URL(fileURLWithPath: args[2])))
let video = AVURLAsset(url: URL(fileURLWithPath: args[1]))
guard let vSrc = try await video.loadTracks(withMediaType: .video).first else { fail("no video track in \(args[1])") }
let videoEnd = try await video.load(.duration)

let comp = AVMutableComposition()
let vOut = comp.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!
let aOut = comp.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)!
let ts: CMTimeScale = 600
func t(_ s: Double) -> CMTime { CMTime(seconds: s, preferredTimescale: ts) }

var at = CMTime.zero
for m in marks {
  let start = t(m.start)
  let end = CMTimeMinimum(t(m.end), videoEnd)
  let seg = end - start
  guard seg > .zero else { continue }
  try vOut.insertTimeRange(CMTimeRange(start: start, duration: seg), of: vSrc, at: at)
  var length = seg
  let clipURL = URL(fileURLWithPath: "\(args[3])/scene-\(m.scene).m4a")
  if FileManager.default.fileExists(atPath: clipURL.path) {
    let clip = AVURLAsset(url: clipURL)
    let clipLen = try await clip.load(.duration)
    if let aSrc = try await clip.loadTracks(withMediaType: .audio).first {
      try aOut.insertTimeRange(CMTimeRange(start: .zero, duration: clipLen), of: aSrc, at: at)
    }
    if clipLen > seg {
      // Hold the scene's last 0.2 s (its final frames) for the rest of the narration.
      let tail = CMTimeMinimum(t(0.2), seg)
      vOut.scaleTimeRange(CMTimeRange(start: at + seg - tail, duration: tail), toDuration: tail + (clipLen - seg))
    } else if clipLen < seg {
      vOut.scaleTimeRange(CMTimeRange(start: at, duration: seg), toDuration: clipLen)
    }
    length = clipLen
  }
  print(String(format: "scene %d: screen %.1f s → %.1f s", m.scene, seg.seconds, length.seconds))
  at = at + length
}

let out = URL(fileURLWithPath: args[4])
try? FileManager.default.removeItem(at: out)
guard let export = AVAssetExportSession(asset: comp, presetName: AVAssetExportPresetHighestQuality) else {
  fail("cannot export")
}
try await export.export(to: out, as: .mp4)
print(String(format: "written: %@ (%.1f s)", args[4], at.seconds))
