import ExpoModulesCore

public class ShooterCameraModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ShooterCamera")

    View(ShooterCameraView.self) {
      Events(
        "onCameraReady",
        "onCapabilities",
        "onError"
      )

      Prop("facing") { (view: ShooterCameraView, facing: String) in
        view.setFacing(facing)
      }

      Prop("flash") { (view: ShooterCameraView, flash: String) in
        view.setFlash(flash)
      }

      Prop("zoom") { (view: ShooterCameraView, zoom: Double) in
        view.setZoomNormalized(zoom)
      }

      Prop("rawEnabled") { (view: ShooterCameraView, enabled: Bool) in
        view.setRawEnabled(enabled)
      }

      AsyncFunction("takePhoto") { (view: ShooterCameraView, raw: Bool, promise: Promise) in
        view.takePhoto(raw: raw, promise: promise)
      }

      AsyncFunction("setManualExposure") { (view: ShooterCameraView, iso: Double, shutterSeconds: Double) in
        try view.setManualExposure(iso: iso, shutterSeconds: shutterSeconds)
      }

      AsyncFunction("setAutoExposure") { (view: ShooterCameraView) in
        try view.setAutoExposure()
      }

      AsyncFunction("setExposureBias") { (view: ShooterCameraView, ev: Double) in
        try view.setExposureBias(ev)
      }

      AsyncFunction("setManualFocus") { (view: ShooterCameraView, position: Double) in
        try view.setManualFocus(position)
      }

      AsyncFunction("setAutoFocus") { (view: ShooterCameraView) in
        try view.setAutoFocus()
      }

      AsyncFunction("setFocusPoint") { (view: ShooterCameraView, x: Double, y: Double) in
        try view.setFocusPoint(x: x, y: y)
      }

      AsyncFunction("setWhiteBalanceTemperature") {
        (view: ShooterCameraView, temperature: Double, tint: Double) in
        try view.setWhiteBalanceTemperature(temperature, tint: tint)
      }

      AsyncFunction("setAutoWhiteBalance") { (view: ShooterCameraView) in
        try view.setAutoWhiteBalance()
      }

      AsyncFunction("setLens") { (view: ShooterCameraView, lensId: String) in
        view.setLens(lensId)
      }

      AsyncFunction("resetControls") { (view: ShooterCameraView) in
        try view.resetControls()
      }
    }
  }
}
