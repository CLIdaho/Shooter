package com.aeralabs.shootercamera

import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ShooterCameraModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ShooterCamera")

    View(ShooterCameraView::class) {
      Events(
        "onCameraReady",
        "onCapabilities",
        "onError"
      )

      Prop("facing") { view: ShooterCameraView, facing: String ->
        view.setFacing(facing)
      }

      Prop("flash") { view: ShooterCameraView, flash: String ->
        view.setFlash(flash)
      }

      Prop("zoom") { view: ShooterCameraView, zoom: Double ->
        view.setZoomNormalized(zoom)
      }

      Prop("rawEnabled") { view: ShooterCameraView, enabled: Boolean ->
        view.setRawEnabled(enabled)
      }

      AsyncFunction("takePhoto") { view: ShooterCameraView, raw: Boolean, promise: Promise ->
        view.takePhoto(raw, promise)
      }

      AsyncFunction("setManualExposure") {
          view: ShooterCameraView,
          iso: Double,
          shutterSeconds: Double ->
        view.setManualExposure(iso, shutterSeconds)
      }

      AsyncFunction("setAutoExposure") { view: ShooterCameraView ->
        view.setAutoExposure()
      }

      AsyncFunction("setExposureBias") { view: ShooterCameraView, ev: Double ->
        view.setExposureBias(ev)
      }

      AsyncFunction("setManualFocus") { view: ShooterCameraView, position: Double ->
        view.setManualFocus(position)
      }

      AsyncFunction("setAutoFocus") { view: ShooterCameraView ->
        view.setAutoFocus()
      }

      AsyncFunction("setFocusPoint") {
          view: ShooterCameraView,
          x: Double,
          y: Double ->
        view.setFocusPoint(x, y)
      }

      AsyncFunction("setWhiteBalanceTemperature") {
          view: ShooterCameraView,
          temperature: Double,
          tint: Double ->
        view.setWhiteBalanceTemperature(temperature, tint)
      }

      AsyncFunction("setAutoWhiteBalance") { view: ShooterCameraView ->
        view.setAutoWhiteBalance()
      }

      AsyncFunction("setLens") { view: ShooterCameraView, lensId: String ->
        view.setLens(lensId)
      }

      AsyncFunction("resetControls") { view: ShooterCameraView ->
        view.resetControls()
      }

      OnViewDestroys { view: ShooterCameraView ->
        view.destroy()
      }
    }
  }
}
