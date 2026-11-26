// A folder of numbered PNG frames → H.264 MP4 with AVFoundation (macOS), so no ffmpeg install is needed.
// usage: encode <frames-dir> <fps> <out.mp4>   (record.ts fills the folder with Playwright's bundled ffmpeg)
import AVFoundation
import CoreVideo
import Foundation
import ImageIO

let args = CommandLine.arguments
guard args.count == 4, let fps = Int32(args[2]) else {
  FileHandle.standardError.write("usage: encode <frames-dir> <fps> <out.mp4>\n".data(using: .utf8)!)
  exit(2)
}
let dir = args[1]
let out = args[3]
let files = try FileManager.default.contentsOfDirectory(atPath: dir).filter { $0.hasSuffix(".png") }.sorted()
guard let first = files.first,
  let src0 = CGImageSourceCreateWithURL(URL(fileURLWithPath: "\(dir)/\(first)") as CFURL, nil),
  let img0 = CGImageSourceCreateImageAtIndex(src0, 0, nil)
else {
  FileHandle.standardError.write("no frames in \(dir)\n".data(using: .utf8)!)
  exit(1)
}
let w = img0.width
let h = img0.height
try? FileManager.default.removeItem(atPath: out)
let writer = try AVAssetWriter(outputURL: URL(fileURLWithPath: out), fileType: .mp4)
let input = AVAssetWriterInput(
  mediaType: .video,
  outputSettings: [
    AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: w, AVVideoHeightKey: h,
    AVVideoCompressionPropertiesKey: [
      AVVideoAverageBitRateKey: 6_000_000, AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
    ],
  ])
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(
  assetWriterInput: input,
  sourcePixelBufferAttributes: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
    kCVPixelBufferWidthKey as String: w, kCVPixelBufferHeightKey as String: h,
  ])
writer.add(input)
writer.startWriting()
writer.startSession(atSourceTime: .zero)

var n: Int64 = 0
for f in files {
  guard let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: "\(dir)/\(f)") as CFURL, nil),
    let img = CGImageSourceCreateImageAtIndex(src, 0, nil)
  else { continue }
  while !input.isReadyForMoreMediaData { usleep(2000) }
  var pb: CVPixelBuffer?
  CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &pb)
  CVPixelBufferLockBaseAddress(pb!, [])
  let ctx = CGContext(
    data: CVPixelBufferGetBaseAddress(pb!), width: w, height: h, bitsPerComponent: 8,
    bytesPerRow: CVPixelBufferGetBytesPerRow(pb!), space: CGColorSpaceCreateDeviceRGB(),
    bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)!
  ctx.draw(img, in: CGRect(x: 0, y: 0, width: w, height: h))
  CVPixelBufferUnlockBaseAddress(pb!, [])
  adaptor.append(pb!, withPresentationTime: CMTime(value: n, timescale: fps))
  n += 1
}
input.markAsFinished()
let done = DispatchSemaphore(value: 0)
writer.finishWriting { done.signal() }
done.wait()
print("frames: \(n), seconds: \(Double(n) / Double(fps))")
