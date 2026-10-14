import AVFoundation
import Foundation

// Export an Apple Live Photo companion movie as browser-compatible H.264.
guard CommandLine.arguments.count == 3 else { exit(1) }
let input = URL(fileURLWithPath: CommandLine.arguments[1])
let output = URL(fileURLWithPath: CommandLine.arguments[2])
let asset = AVURLAsset(url: input)
guard let exporter = AVAssetExportSession(asset: asset, presetName: AVAssetExportPreset1920x1080) else {
    fputs("无法创建视频转换任务\n", stderr)
    exit(1)
}
try? FileManager.default.removeItem(at: output)
exporter.outputURL = output
exporter.outputFileType = .mp4
exporter.shouldOptimizeForNetworkUse = true
let done = DispatchSemaphore(value: 0)
exporter.exportAsynchronously { done.signal() }
done.wait()
guard exporter.status == .completed else {
    fputs("视频转换失败：\(exporter.error?.localizedDescription ?? "未知错误")\n", stderr)
    exit(1)
}
