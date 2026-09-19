import AVFoundation
import ExpoModulesCore
import UIKit

private final class PendingCapture {
  let promise: Promise
  var photoUri: String?
  var rawUri: String?
  var failure: Error?

  init(promise: Promise) {
    self.promise = promise
  }
}

final class ShooterCameraView: ExpoView, AVCapturePhotoCaptureDelegate {
  let onCameraReady = EventDispatcher()
  let onCapabilities = EventDispatcher()
  let onError = EventDispatcher()

  private let captureSession = AVCaptureSession()
  private let photoOutput = AVCapturePhotoOutput()
  private let sessionQueue = DispatchQueue(label: "com.aeralabs.shooter.camera.session")

  private var previewLayer: AVCaptureVideoPreviewLayer!
  private var currentInput: AVCaptureDeviceInput?
  private var requestedFacing: AVCaptureDevice.Position = .back
  private var requestedLensId: String?
  private var flashMode: AVCaptureDevice.FlashMode = .off
  private var rawEnabled = false
  private var zoomNormalized: CGFloat = 0
  private var pendingCaptures: [Int64: PendingCapture] = [:]

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)

    clipsToBounds = true
    backgroundColor = .black

    previewLayer = AVCaptureVideoPreviewLayer(session: captureSession)
    previewLayer.videoGravity = .resizeAspectFill
    layer.addSublayer(previewLayer)

    sessionQueue.async { [weak self] in
      self?.configureSession()
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    previewLayer.frame = bounds
  }

  deinit {
    if captureSession.isRunning {
      captureSession.stopRunning()
    }
  }

  func setFacing(_ facing: String) {
    let position: AVCaptureDevice.Position = facing == "front" ? .front : .back
    guard position != requestedFacing else {
      return
    }

    requestedFacing = position
    requestedLensId = nil

    sessionQueue.async { [weak self] in
      self?.reconfigureInput()
    }
  }

  func setLens(_ lensId: String) {
    requestedLensId = lensId
    sessionQueue.async { [weak self] in
      self?.reconfigureInput()
    }
  }

  func setFlash(_ value: String) {
    switch value {
    case "on":
      flashMode = .on
    case "auto":
      flashMode = .auto
    default:
      flashMode = .off
    }
  }

  func setRawEnabled(_ enabled: Bool) {
    rawEnabled = enabled
  }

  func setZoomNormalized(_ value: Double) {
    zoomNormalized = CGFloat(min(max(value, 0), 1))
    guard let device = currentInput?.device else {
      return
    }

    do {
      try device.lockForConfiguration()
      defer { device.unlockForConfiguration() }

      let maxZoom = min(max(device.maxAvailableVideoZoomFactor, 1), 12)
      let zoom = 1 + zoomNormalized * (maxZoom - 1)
      device.videoZoomFactor = min(max(zoom, 1), maxZoom)
    } catch {
      emitError(code: "E_ZOOM", message: error.localizedDescription)
    }
  }

  func setExposureBias(_ ev: Double) throws {
    guard let device = currentInput?.device else {
      throw CameraEngineError.notReady
    }

    try device.lockForConfiguration()
    defer { device.unlockForConfiguration() }

    let bias = Float(ev)
    let clamped = min(max(bias, device.minExposureTargetBias), device.maxExposureTargetBias)
    device.setExposureTargetBias(clamped, completionHandler: nil)
  }

  func setManualExposure(iso: Double, shutterSeconds: Double) throws {
    guard let device = currentInput?.device else {
      throw CameraEngineError.notReady
    }
    guard device.isExposureModeSupported(.custom) else {
      throw CameraEngineError.unsupported("Manual exposure is not supported by this camera.")
    }

    try device.lockForConfiguration()
    defer { device.unlockForConfiguration() }

    let format = device.activeFormat
    let clampedISO = min(max(Float(iso), format.minISO), format.maxISO)

    let minSeconds = CMTimeGetSeconds(format.minExposureDuration)
    let maxSeconds = CMTimeGetSeconds(format.maxExposureDuration)
    let seconds = min(max(shutterSeconds, minSeconds), maxSeconds)
    let duration = CMTime(seconds: seconds, preferredTimescale: 1_000_000_000)

    device.setExposureModeCustom(
      duration: duration,
      iso: clampedISO,
      completionHandler: nil
    )
  }

  func setAutoExposure() throws {
    guard let device = currentInput?.device else {
      throw CameraEngineError.notReady
    }

    try device.lockForConfiguration()
    defer { device.unlockForConfiguration() }

    if device.isExposureModeSupported(.continuousAutoExposure) {
      device.exposureMode = .continuousAutoExposure
    } else if device.isExposureModeSupported(.autoExpose) {
      device.exposureMode = .autoExpose
    }
  }

  func setManualFocus(_ position: Double) throws {
    guard let device = currentInput?.device else {
      throw CameraEngineError.notReady
    }
    guard device.isFocusModeSupported(.locked) else {
      throw CameraEngineError.unsupported("Manual focus is not supported by this camera.")
    }

    try device.lockForConfiguration()
    defer { device.unlockForConfiguration() }

    let lensPosition = Float(min(max(position, 0), 1))
    device.setFocusModeLocked(lensPosition: lensPosition, completionHandler: nil)
  }

  func setAutoFocus() throws {
    guard let device = currentInput?.device else {
      throw CameraEngineError.notReady
    }

    try device.lockForConfiguration()
    defer { device.unlockForConfiguration() }

    if device.isFocusModeSupported(.continuousAutoFocus) {
      device.focusMode = .continuousAutoFocus
    } else if device.isFocusModeSupported(.autoFocus) {
      device.focusMode = .autoFocus
    }
  }

  func setFocusPoint(x: Double, y: Double) throws {
    guard let device = currentInput?.device else {
      throw CameraEngineError.notReady
    }
    guard device.isFocusPointOfInterestSupported else {
      throw CameraEngineError.unsupported("Focus point is not supported by this camera.")
    }

    let normalizedX = min(max(x, 0), 1)
    let normalizedY = min(max(y, 0), 1)
    let layerPoint = CGPoint(
      x: bounds.width * normalizedX,
      y: bounds.height * normalizedY
    )
    let normalized = previewLayer.captureDevicePointConverted(fromLayerPoint: layerPoint)

    try device.lockForConfiguration()
    defer { device.unlockForConfiguration() }

    device.focusPointOfInterest = normalized
    if device.isFocusModeSupported(.autoFocus) {
      device.focusMode = .autoFocus
    }

    if device.isExposurePointOfInterestSupported {
      device.exposurePointOfInterest = normalized
      if device.isExposureModeSupported(.continuousAutoExposure) {
        device.exposureMode = .continuousAutoExposure
      }
    }
  }

  func setWhiteBalanceTemperature(_ temperature: Double, tint: Double) throws {
    guard let device = currentInput?.device else {
      throw CameraEngineError.notReady
    }
    guard device.isWhiteBalanceModeSupported(.locked) else {
      throw CameraEngineError.unsupported("Manual white balance is not supported by this camera.")
    }

    try device.lockForConfiguration()
    defer { device.unlockForConfiguration() }

    let values = AVCaptureDevice.WhiteBalanceTemperatureAndTintValues(
      temperature: Float(min(max(temperature, 2_000), 12_000)),
      tint: Float(min(max(tint, -150), 150))
    )

    let gains = normalizedWhiteBalanceGains(
      device.deviceWhiteBalanceGains(for: values),
      maxGain: device.maxWhiteBalanceGain
    )

    device.setWhiteBalanceModeLocked(with: gains, completionHandler: nil)
  }

  func setAutoWhiteBalance() throws {
    guard let device = currentInput?.device else {
      throw CameraEngineError.notReady
    }

    try device.lockForConfiguration()
    defer { device.unlockForConfiguration() }

    if device.isWhiteBalanceModeSupported(.continuousAutoWhiteBalance) {
      device.whiteBalanceMode = .continuousAutoWhiteBalance
    } else if device.isWhiteBalanceModeSupported(.autoWhiteBalance) {
      device.whiteBalanceMode = .autoWhiteBalance
    }
  }

  func resetControls() throws {
    try setAutoExposure()
    try setAutoFocus()
    try setAutoWhiteBalance()
    try setExposureBias(0)
    setZoomNormalized(0)
  }

  func takePhoto(raw: Bool, promise: Promise) {
    sessionQueue.async { [weak self] in
      guard let self else {
        promise.reject("E_CAMERA_RELEASED", "The camera view was released before capture.")
        return
      }
      guard self.captureSession.isRunning, let device = self.currentInput?.device else {
        promise.reject("E_CAMERA_NOT_READY", "The camera is not ready.")
        return
      }

      let wantsRaw = raw || self.rawEnabled
      let settings: AVCapturePhotoSettings

      if wantsRaw, let rawType = self.photoOutput.availableRawPhotoPixelFormatTypes.first {
        settings = AVCapturePhotoSettings(
          rawPixelFormatType: rawType,
          processedFormat: [AVVideoCodecKey: AVVideoCodecType.jpeg]
        )
      } else {
        settings = AVCapturePhotoSettings()
      }

      if device.hasFlash {
        settings.flashMode = self.flashMode
      }

      if #available(iOS 13.0, *) {
        settings.photoQualityPrioritization = .quality
      }

      self.pendingCaptures[settings.uniqueID] = PendingCapture(promise: promise)
      self.photoOutput.capturePhoto(with: settings, delegate: self)
    }
  }

  func photoOutput(
    _ output: AVCapturePhotoOutput,
    didFinishProcessingPhoto photo: AVCapturePhoto,
    error: Error?
  ) {
    let captureId = photo.resolvedSettings.uniqueID
    guard let pending = pendingCaptures[captureId] else {
      return
    }

    if let error {
      pending.failure = error
      return
    }

    guard let data = photo.fileDataRepresentation() else {
      pending.failure = CameraEngineError.captureFailed("No photo data was returned.")
      return
    }

    do {
      let isRaw = photo.isRawPhoto
      let extensionName = isRaw ? "dng" : "jpg"
      let prefix = isRaw ? "raw" : "photo"
      let url = FileManager.default.temporaryDirectory
        .appendingPathComponent("shooter-\(captureId)-\(prefix).\(extensionName)")

      try data.write(to: url, options: .atomic)

      if isRaw {
        pending.rawUri = url.absoluteString
      } else {
        pending.photoUri = url.absoluteString
      }
    } catch {
      pending.failure = error
    }
  }

  func photoOutput(
    _ output: AVCapturePhotoOutput,
    didFinishCaptureFor resolvedSettings: AVCaptureResolvedPhotoSettings,
    error: Error?
  ) {
    let captureId = resolvedSettings.uniqueID

    sessionQueue.async { [weak self] in
      guard let self, let pending = self.pendingCaptures.removeValue(forKey: captureId) else {
        return
      }

      if let error = error ?? pending.failure {
        pending.promise.reject("E_CAPTURE", error.localizedDescription)
        return
      }

      guard let primaryUri = pending.photoUri ?? pending.rawUri else {
        pending.promise.reject("E_CAPTURE", "Capture completed without a file.")
        return
      }

      var result: [String: Any] = ["uri": primaryUri]
      if let rawUri = pending.rawUri {
        result["rawUri"] = rawUri
      }
      pending.promise.resolve(result)
    }
  }

  private func configureSession() {
    guard AVCaptureDevice.authorizationStatus(for: .video) == .authorized else {
      emitError(code: "E_CAMERA_PERMISSION", message: "Camera permission is not granted.")
      return
    }

    captureSession.beginConfiguration()
    captureSession.sessionPreset = .photo

    defer {
      captureSession.commitConfiguration()
    }

    do {
      try installInput(device: requestedDevice())

      if captureSession.canAddOutput(photoOutput) {
        captureSession.addOutput(photoOutput)
      }

      photoOutput.maxPhotoQualityPrioritization = .quality
    } catch {
      emitError(code: "E_CAMERA_CONFIGURATION", message: error.localizedDescription)
      return
    }

    if !captureSession.isRunning {
      captureSession.startRunning()
    }

    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.onCameraReady(["ready": true])
      self.emitCapabilities()
    }
  }

  private func reconfigureInput() {
    captureSession.beginConfiguration()
    defer { captureSession.commitConfiguration() }

    do {
      try installInput(device: requestedDevice())
    } catch {
      emitError(code: "E_CAMERA_SWITCH", message: error.localizedDescription)
      return
    }

    DispatchQueue.main.async { [weak self] in
      self?.emitCapabilities()
    }
  }

  private func installInput(device: AVCaptureDevice?) throws {
    guard let device else {
      throw CameraEngineError.noCamera
    }

    if let currentInput {
      captureSession.removeInput(currentInput)
      self.currentInput = nil
    }

    let input = try AVCaptureDeviceInput(device: device)
    guard captureSession.canAddInput(input) else {
      throw CameraEngineError.captureFailed("The selected camera cannot be attached to the session.")
    }

    captureSession.addInput(input)
    currentInput = input

    DispatchQueue.main.async { [weak self] in
      self?.setZoomNormalized(Double(self?.zoomNormalized ?? 0))
    }
  }

  private func requestedDevice() -> AVCaptureDevice? {
    let devices = discoveredDevices()

    if let requestedLensId,
       let exact = devices.first(where: { $0.uniqueID == requestedLensId }) {
      return exact
    }

    if let wide = AVCaptureDevice.default(
      .builtInWideAngleCamera,
      for: .video,
      position: requestedFacing
    ) {
      return wide
    }

    return devices.first(where: { $0.position == requestedFacing })
  }

  private func discoveredDevices() -> [AVCaptureDevice] {
    let types: [AVCaptureDevice.DeviceType] = [
      .builtInWideAngleCamera,
      .builtInUltraWideCamera,
      .builtInTelephotoCamera,
      .builtInDualCamera,
      .builtInDualWideCamera,
      .builtInTripleCamera,
      .builtInTrueDepthCamera
    ]

    return AVCaptureDevice.DiscoverySession(
      deviceTypes: types,
      mediaType: .video,
      position: .unspecified
    ).devices
  }

  private func emitCapabilities() {
    guard let device = currentInput?.device else {
      return
    }

    let format = device.activeFormat
    let minShutter = CMTimeGetSeconds(format.minExposureDuration)
    let maxShutter = CMTimeGetSeconds(format.maxExposureDuration)

    let lenses: [[String: Any]] = discoveredDevices().map { lens in
      [
        "id": lens.uniqueID,
        "name": lens.localizedName,
        "facing": positionName(lens.position)
      ]
    }

    onCapabilities([
      "platform": "ios",
      "supportsManualExposure": device.isExposureModeSupported(.custom),
      "supportsManualFocus": device.isFocusModeSupported(.locked),
      "supportsManualWhiteBalance": device.isWhiteBalanceModeSupported(.locked),
      "supportsRaw": !photoOutput.availableRawPhotoPixelFormatTypes.isEmpty,
      "minISO": Double(format.minISO),
      "maxISO": Double(format.maxISO),
      "minShutterSeconds": minShutter,
      "maxShutterSeconds": maxShutter,
      "minExposureBias": Double(device.minExposureTargetBias),
      "maxExposureBias": Double(device.maxExposureTargetBias),
      "maxZoom": Double(min(max(device.maxAvailableVideoZoomFactor, 1), 12)),
      "lenses": lenses
    ])
  }

  private func normalizedWhiteBalanceGains(
    _ gains: AVCaptureDevice.WhiteBalanceGains,
    maxGain: Float
  ) -> AVCaptureDevice.WhiteBalanceGains {
    AVCaptureDevice.WhiteBalanceGains(
      redGain: min(max(gains.redGain, 1), maxGain),
      greenGain: min(max(gains.greenGain, 1), maxGain),
      blueGain: min(max(gains.blueGain, 1), maxGain)
    )
  }

  private func positionName(_ position: AVCaptureDevice.Position) -> String {
    switch position {
    case .front:
      return "front"
    case .back:
      return "back"
    default:
      return "unknown"
    }
  }

  private func emitError(code: String, message: String) {
    DispatchQueue.main.async { [weak self] in
      self?.onError([
        "code": code,
        "message": message
      ])
    }
  }
}

enum CameraEngineError: LocalizedError {
  case notReady
  case noCamera
  case unsupported(String)
  case captureFailed(String)

  var errorDescription: String? {
    switch self {
    case .notReady:
      return "The camera is not ready."
    case .noCamera:
      return "No compatible camera was found."
    case .unsupported(let message):
      return message
    case .captureFailed(let message):
      return message
    }
  }
}
