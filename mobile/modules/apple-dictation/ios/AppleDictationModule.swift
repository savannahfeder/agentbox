// Live dictation with Apple's newer speech model (SpeechAnalyzer and
// SpeechTranscriber, iOS 26), which runs on the iPhone and is free. The
// keyboard's older model stays in expo-speech-recognition for phones without it.
// Events match what mobile/src/platform/speech.ts hands lib/dictation.ts.
import AVFoundation
import ExpoModulesCore
import Speech

public class AppleDictationModule: Module {
  // A LiveDictation, untyped so the module still loads before iOS 26.
  private var live: AnyObject?

  public func definition() -> ModuleDefinition {
    Name("AppleDictation")

    Events("onStart", "onResult", "onError", "onEnd", "onLevel")

    // Empty on a phone that cannot run the model.
    AsyncFunction("languages") { () async -> [String: [String]] in
      guard #available(iOS 26.0, *) else { return ["supported": [], "installed": []] }
      let supported = await SpeechTranscriber.supportedLocales
      let installed = await SpeechTranscriber.installedLocales
      return [
        "supported": supported.map { $0.identifier(.bcp47) },
        "installed": installed.map { $0.identifier(.bcp47) },
      ]
    }

    // Downloads a language's model, for the next time the microphone is pressed.
    AsyncFunction("download") { (language: String) async throws -> Void in
      guard #available(iOS 26.0, *) else { return }
      let transcriber = SpeechTranscriber(locale: Locale(identifier: language), preset: .progressiveTranscription)
      if let request = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
        try await request.downloadAndInstall()
      }
    }

    AsyncFunction("start") { (language: String) async throws -> Void in
      guard #available(iOS 26.0, *) else { throw DictationError.unavailable }
      (self.live as? LiveDictation)?.abort()
      let session = LiveDictation { [weak self] name, body in self?.sendEvent(name, body) }
      self.live = session
      try await session.start(language: language)
    }

    Function("stop") { () -> Void in
      guard #available(iOS 26.0, *) else { return }
      (self.live as? LiveDictation)?.stop()
    }

    Function("abort") { () -> Void in
      guard #available(iOS 26.0, *) else { return }
      (self.live as? LiveDictation)?.abort()
      self.live = nil
    }

    OnDestroy {
      guard #available(iOS 26.0, *) else { return }
      (self.live as? LiveDictation)?.abort()
    }
  }
}

enum DictationError: LocalizedError {
  case unavailable, noFormat, noConverter

  var errorDescription: String? {
    switch self {
    case .unavailable: return "This iPhone cannot use the newer dictation model."
    case .noFormat: return "The dictation model has no audio format it can use."
    case .noConverter: return "The microphone's audio could not be converted."
    }
  }
}

@available(iOS 26.0, *)
final class LiveDictation {
  private let send: (String, [String: Any?]) -> Void
  private let engine = AVAudioEngine()
  private let lock = NSLock()
  private var analyzer: SpeechAnalyzer?
  private var input: AsyncStream<AnalyzerInput>.Continuation?
  private var reading: Task<Void, Never>?
  private var interruption: NSObjectProtocol?
  private var microphoneOn = false
  private var ended = false
  private var lastLevel = Date.distantPast

  init(send: @escaping (String, [String: Any?]) -> Void) {
    self.send = send
  }

  func start(language: String) async throws {
    let transcriber = SpeechTranscriber(locale: Locale(identifier: language), preset: .progressiveTranscription)
    guard let format = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [transcriber]) else {
      throw DictationError.noFormat
    }
    let analyzer = SpeechAnalyzer(modules: [transcriber])
    self.analyzer = analyzer
    let (stream, continuation) = AsyncStream.makeStream(of: AnalyzerInput.self)
    input = continuation

    // Each phrase comes again and again as it firms up, then once as final.
    reading = Task { [weak self] in
      do {
        for try await result in transcriber.results {
          self?.send("onResult", ["text": String(result.text.characters), "isFinal": result.isFinal])
        }
        self?.finished(nil)
      } catch {
        self?.finished(error)
      }
    }

    do {
      try await analyzer.start(inputSequence: stream)
      try openMicrophone(into: continuation, as: format)
    } catch {
      releaseMicrophone()
      await analyzer.cancelAndFinishNow()
      throw error
    }
    send("onStart", [:])
  }

  /// Stops listening; the last words and then onEnd follow.
  func stop() {
    releaseMicrophone()
    Task { [weak self] in
      do {
        try await self?.analyzer?.finalizeAndFinishThroughEndOfInput()
      } catch {
        self?.finished(error)
      }
    }
  }

  func abort() {
    releaseMicrophone()
    // Held here: the module lets go of this session straight after.
    let analyzer = self.analyzer
    Task {
      await analyzer?.cancelAndFinishNow()
    }
  }

  private func openMicrophone(into continuation: AsyncStream<AnalyzerInput>.Continuation, as format: AVAudioFormat) throws {
    let audio = AVAudioSession.sharedInstance()
    try audio.setCategory(.playAndRecord, mode: .measurement, options: [.defaultToSpeaker, .duckOthers])
    try audio.setActive(true, options: .notifyOthersOnDeactivation)

    // A call or another app taking the microphone ends dictation, words kept.
    interruption = NotificationCenter.default.addObserver(
      forName: AVAudioSession.interruptionNotification, object: audio, queue: nil
    ) { [weak self] note in
      guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
            AVAudioSession.InterruptionType(rawValue: raw) == .began else { return }
      self?.send("onError", ["code": "interrupted", "message": "Audio session was interrupted"])
      self?.stop()
    }

    let converter = Converter(to: format)
    let node = engine.inputNode
    node.removeTap(onBus: 0)
    node.installTap(onBus: 0, bufferSize: 4096, format: node.outputFormat(forBus: 0)) { [weak self] buffer, _ in
      self?.level(buffer)
      if let converted = try? converter.convert(buffer) {
        continuation.yield(AnalyzerInput(buffer: converted))
      }
    }
    engine.prepare()
    lock.lock()
    microphoneOn = true
    lock.unlock()
    try engine.start()
  }

  // Safe to call from any way out, more than once.
  private func releaseMicrophone() {
    lock.lock()
    let wasOn = microphoneOn
    microphoneOn = false
    let observer = interruption
    interruption = nil
    lock.unlock()
    if let observer { NotificationCenter.default.removeObserver(observer) }
    input?.finish()
    guard wasOn else { return }
    engine.stop()
    engine.inputNode.removeTap(onBus: 0)
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }

  private func finished(_ error: Error?) {
    lock.lock()
    let already = ended
    ended = true
    lock.unlock()
    if already { return }
    releaseMicrophone()
    if let error, !(error is CancellationError) {
      send("onError", ["code": "recognition", "message": error.localizedDescription])
    }
    send("onEnd", [:])
  }

  // About eight times a second, on the scale the older model reports: 0 unheard, 10 loud.
  private func level(_ buffer: AVAudioPCMBuffer) {
    let now = Date()
    guard now.timeIntervalSince(lastLevel) > 0.12, let samples = buffer.floatChannelData?[0] else { return }
    lastLevel = now
    let count = Int(buffer.frameLength)
    guard count > 0 else { return }
    var sum: Float = 0
    for i in 0..<count { sum += samples[i] * samples[i] }
    let decibels = 20 * log10(max(sqrt(sum / Float(count)), 0.000_01))
    send("onLevel", ["value": Double(max(-2, min(10, (decibels + 50) / 5)))])
  }
}

// The microphone's buffers, in the format the model asked for.
private final class Converter {
  private let format: AVAudioFormat
  private var converter: AVAudioConverter?

  init(to format: AVAudioFormat) {
    self.format = format
  }

  func convert(_ buffer: AVAudioPCMBuffer) throws -> AVAudioPCMBuffer {
    if buffer.format == format { return buffer }
    if converter == nil || converter?.inputFormat != buffer.format {
      converter = AVAudioConverter(from: buffer.format, to: format)
      // No priming, so the time codes never drift from the microphone's.
      converter?.primeMethod = .none
    }
    guard let converter else { throw DictationError.noConverter }
    let ratio = format.sampleRate / buffer.format.sampleRate
    let capacity = AVAudioFrameCount((Double(buffer.frameLength) * ratio).rounded(.up))
    guard let out = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: capacity) else { throw DictationError.noConverter }
    var given = false
    var problem: NSError?
    let status = converter.convert(to: out, error: &problem) { _, state in
      if given {
        state.pointee = .noDataNow
        return nil
      }
      given = true
      state.pointee = .haveData
      return buffer
    }
    if status == .error {
      if let problem { throw problem }
      throw DictationError.noConverter
    }
    return out
  }
}
