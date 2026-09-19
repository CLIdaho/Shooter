package com.aeralabs.shootercamera

import android.content.Context
import android.graphics.ImageFormat
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CaptureRequest
import android.hardware.camera2.params.RggbChannelVector
import android.net.Uri
import androidx.camera.camera2.interop.Camera2CameraControl
import androidx.camera.camera2.interop.Camera2CameraInfo
import androidx.camera.camera2.interop.CaptureRequestOptions
import androidx.camera.camera2.interop.ExperimentalCamera2Interop
import androidx.camera.core.Camera
import androidx.camera.core.CameraFilter
import androidx.camera.core.CameraInfo
import androidx.camera.core.CameraSelector
import androidx.camera.core.FocusMeteringAction
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.Promise
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.io.File
import java.util.concurrent.TimeUnit
import kotlin.math.ln
import kotlin.math.pow
import kotlin.math.roundToInt

@OptIn(ExperimentalCamera2Interop::class)
class ShooterCameraView(
  context: Context,
  appContext: AppContext
) : ExpoView(context, appContext) {
  val onCameraReady by EventDispatcher()
  val onCapabilities by EventDispatcher()
  val onError by EventDispatcher()

  private val mainExecutor = ContextCompat.getMainExecutor(context)
  private val previewView = PreviewView(context).apply {
    layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
    scaleType = PreviewView.ScaleType.FILL_CENTER
    implementationMode = PreviewView.ImplementationMode.COMPATIBLE
  }

  private var cameraProvider: ProcessCameraProvider? = null
  private var camera: Camera? = null
  private var imageCapture: ImageCapture? = null

  private var lensFacing = CameraSelector.LENS_FACING_BACK
  private var requestedCameraId: String? = null
  private var flashMode = ImageCapture.FLASH_MODE_OFF
  private var zoomNormalized = 0f
  private var rawEnabled = false
  private var activeOutputFormat = ImageCapture.OUTPUT_FORMAT_JPEG

  private var manualIso: Int? = null
  private var manualExposureNanos: Long? = null
  private var manualFocusPosition: Float? = null
  private var manualWhiteBalanceTemperature: Double? = null
  private var manualWhiteBalanceTint: Double = 0.0

  private var previewGeneration = 0
  private var previewStreaming = false
  private var previewRetryAttempted = false
  private var pendingOnStream: (() -> Unit)? = null

  init {
    addView(previewView)

    // ExpoView/React Native does not guarantee that a programmatically-added
    // Android child view will be laid out to our bounds. CameraX can bind
    // successfully while PreviewView remains 0x0, producing a black preview.
    previewView.layout(0, 0, width, height)

    val future = ProcessCameraProvider.getInstance(context)
    future.addListener({
      try {
        cameraProvider = future.get()
        bindCamera()
      } catch (error: Throwable) {
        emitError("E_CAMERA_PROVIDER", error.message ?: "Unable to initialize CameraX.")
      }
    }, mainExecutor)
  }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    super.onMeasure(widthMeasureSpec, heightMeasureSpec)
    val measuredWidth = MeasureSpec.getSize(widthMeasureSpec)
    val measuredHeight = MeasureSpec.getSize(heightMeasureSpec)
    previewView.measure(
      MeasureSpec.makeMeasureSpec(measuredWidth, MeasureSpec.EXACTLY),
      MeasureSpec.makeMeasureSpec(measuredHeight, MeasureSpec.EXACTLY)
    )
    setMeasuredDimension(measuredWidth, measuredHeight)
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    previewView.layout(0, 0, right - left, bottom - top)
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    post {
      previewView.layout(0, 0, width, height)
      if (cameraProvider != null && camera == null) {
        bindCamera()
      }
    }
  }

  fun setFacing(value: String) {
    val next = if (value == "front") {
      CameraSelector.LENS_FACING_FRONT
    } else {
      CameraSelector.LENS_FACING_BACK
    }

    if (next == lensFacing) return

    lensFacing = next
    requestedCameraId = null
    bindCamera()
  }

  fun setLens(cameraId: String) {
    if (requestedCameraId == cameraId) return
    requestedCameraId = cameraId
    bindCamera()
  }

  fun setFlash(value: String) {
    flashMode = when (value) {
      "on" -> ImageCapture.FLASH_MODE_ON
      "auto" -> ImageCapture.FLASH_MODE_AUTO
      else -> ImageCapture.FLASH_MODE_OFF
    }
    imageCapture?.flashMode = flashMode
  }

  fun setRawEnabled(enabled: Boolean) {
    if (rawEnabled == enabled) return
    rawEnabled = enabled
    bindCamera()
  }

  fun setZoomNormalized(value: Double) {
    zoomNormalized = value.coerceIn(0.0, 1.0).toFloat()

    val activeCamera = camera ?: return
    val zoomState = activeCamera.cameraInfo.zoomState.value ?: return
    val ratio = 1f + zoomNormalized * (zoomState.maxZoomRatio - 1f)
    activeCamera.cameraControl.setZoomRatio(ratio.coerceIn(zoomState.minZoomRatio, zoomState.maxZoomRatio))
  }

  fun setExposureBias(ev: Double) {
    val activeCamera = camera ?: throw CameraEngineException("The camera is not ready.")
    val state = activeCamera.cameraInfo.exposureState
    if (!state.isExposureCompensationSupported) {
      throw CameraEngineException("Exposure compensation is not supported by this camera.")
    }

    val step = state.exposureCompensationStep.toFloat()
    if (step <= 0f) return

    val requestedIndex = (ev / step).roundToInt()
    val range = state.exposureCompensationRange
    activeCamera.cameraControl.setExposureCompensationIndex(
      requestedIndex.coerceIn(range.lower, range.upper)
    )
  }

  fun setManualExposure(iso: Double, shutterSeconds: Double) {
    val info = activeCamera2Info()
      ?: throw CameraEngineException("The camera is not ready.")

    val capabilities = info.getCameraCharacteristic(
      CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES
    ) ?: intArrayOf()

    if (!capabilities.contains(
        CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES_MANUAL_SENSOR
      )) {
      throw CameraEngineException("Manual sensor exposure is not supported by this camera.")
    }

    val isoRange = info.getCameraCharacteristic(
      CameraCharacteristics.SENSOR_INFO_SENSITIVITY_RANGE
    ) ?: throw CameraEngineException("The camera did not report an ISO range.")

    val exposureRange = info.getCameraCharacteristic(
      CameraCharacteristics.SENSOR_INFO_EXPOSURE_TIME_RANGE
    ) ?: throw CameraEngineException("The camera did not report a shutter range.")

    manualIso = iso.roundToInt().coerceIn(isoRange.lower, isoRange.upper)
    manualExposureNanos = (shutterSeconds * 1_000_000_000.0)
      .toLong()
      .coerceIn(exposureRange.lower, exposureRange.upper)

    applyManualControls()
  }

  fun setAutoExposure() {
    manualIso = null
    manualExposureNanos = null
    applyManualControls()
  }

  fun setManualFocus(position: Double) {
    val info = activeCamera2Info()
      ?: throw CameraEngineException("The camera is not ready.")

    val minimumFocusDistance = info.getCameraCharacteristic(
      CameraCharacteristics.LENS_INFO_MINIMUM_FOCUS_DISTANCE
    ) ?: 0f

    if (minimumFocusDistance <= 0f) {
      throw CameraEngineException("Manual focus is not supported by this camera.")
    }

    manualFocusPosition = position.coerceIn(0.0, 1.0).toFloat()
    applyManualControls()
  }

  fun setAutoFocus() {
    manualFocusPosition = null
    applyManualControls()
  }

  fun setFocusPoint(x: Double, y: Double) {
    val activeCamera = camera ?: throw CameraEngineException("The camera is not ready.")

    val point = previewView.meteringPointFactory.createPoint(
      (previewView.width * x.coerceIn(0.0, 1.0)).toFloat(),
      (previewView.height * y.coerceIn(0.0, 1.0)).toFloat()
    )

    val action = FocusMeteringAction.Builder(
      point,
      FocusMeteringAction.FLAG_AF or FocusMeteringAction.FLAG_AE
    )
      .setAutoCancelDuration(4, TimeUnit.SECONDS)
      .build()

    activeCamera.cameraControl.startFocusAndMetering(action)
  }

  fun setWhiteBalanceTemperature(temperature: Double, tint: Double) {
    val info = activeCamera2Info()
      ?: throw CameraEngineException("The camera is not ready.")

    val capabilities = info.getCameraCharacteristic(
      CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES
    ) ?: intArrayOf()

    if (!capabilities.contains(
        CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES_MANUAL_POST_PROCESSING
      )) {
      throw CameraEngineException("Manual white balance is not supported by this camera.")
    }

    manualWhiteBalanceTemperature = temperature.coerceIn(2_000.0, 12_000.0)
    manualWhiteBalanceTint = tint.coerceIn(-150.0, 150.0)
    applyManualControls()
  }

  fun setAutoWhiteBalance() {
    manualWhiteBalanceTemperature = null
    manualWhiteBalanceTint = 0.0
    applyManualControls()
  }

  fun resetControls() {
    manualIso = null
    manualExposureNanos = null
    manualFocusPosition = null
    manualWhiteBalanceTemperature = null
    manualWhiteBalanceTint = 0.0

    setExposureBias(0.0)
    setZoomNormalized(0.0)
    applyManualControls()
  }

  fun takePhoto(raw: Boolean, promise: Promise) {
    val wantsRaw = raw || rawEnabled

    if (wantsRaw && activeOutputFormat == ImageCapture.OUTPUT_FORMAT_JPEG) {
      if (!supportsRaw(candidateCameraInfo())) {
        promise.reject("E_RAW_UNSUPPORTED", "RAW capture is not supported by this camera.", null)
        return
      }

      rawEnabled = true
      bindCamera {
        captureBoundPhoto(promise)
      }
      return
    }

    captureBoundPhoto(promise)
  }

  fun destroy() {
    previewGeneration += 1
    pendingOnStream = null
    cameraProvider?.unbindAll()
    camera = null
    imageCapture = null
  }

  private fun bindCamera(
    onBound: (() -> Unit)? = null,
    isPreviewRetry: Boolean = false
  ) {
    val provider = cameraProvider ?: return
    val lifecycleOwner = appContext.currentActivity as? LifecycleOwner

    if (lifecycleOwner == null) {
      emitError("E_NO_LIFECYCLE", "Shooter could not find an Android lifecycle owner.")
      return
    }

    if (!isPreviewRetry) {
      previewRetryAttempted = false
      previewView.implementationMode = PreviewView.ImplementationMode.COMPATIBLE
      pendingOnStream = onBound
    } else if (onBound != null) {
      pendingOnStream = onBound
    }

    previewStreaming = false
    val generation = ++previewGeneration

    val candidateInfo = candidateCameraInfo()
    val rawFormats = supportedRawFormats(candidateInfo)

    val outputFormat = when {
      rawEnabled && rawFormats.contains(ImageCapture.OUTPUT_FORMAT_RAW_JPEG) ->
        ImageCapture.OUTPUT_FORMAT_RAW_JPEG
      rawEnabled && rawFormats.contains(ImageCapture.OUTPUT_FORMAT_RAW) ->
        ImageCapture.OUTPUT_FORMAT_RAW
      else -> ImageCapture.OUTPUT_FORMAT_JPEG
    }

    val preview = Preview.Builder().build().also {
      it.setSurfaceProvider(previewView.surfaceProvider)
    }

    val captureBuilder = ImageCapture.Builder()
      .setCaptureMode(ImageCapture.CAPTURE_MODE_MAXIMIZE_QUALITY)

    if (outputFormat != ImageCapture.OUTPUT_FORMAT_JPEG) {
      captureBuilder.setOutputFormat(outputFormat)
    }

    val nextCapture = captureBuilder.build().also {
      it.flashMode = flashMode
    }

    try {
      previewView.previewStreamState.removeObservers(lifecycleOwner)
      previewView.previewStreamState.observe(lifecycleOwner) { state ->
        if (generation != previewGeneration) {
          return@observe
        }

        if (state == PreviewView.StreamState.STREAMING && !previewStreaming) {
          previewStreaming = true
          onCameraReady(
            mapOf(
              "ready" to true,
              "implementationMode" to previewView.implementationMode.name
            )
          )

          val callback = pendingOnStream
          pendingOnStream = null
          callback?.invoke()
        }
      }

      provider.unbindAll()

      val selector = cameraSelector()
      camera = provider.bindToLifecycle(
        lifecycleOwner,
        selector,
        preview,
        nextCapture
      )
      imageCapture = nextCapture
      activeOutputFormat = outputFormat

      applyManualControls()
      setZoomNormalized(zoomNormalized.toDouble())
      emitCapabilities()

      previewView.postDelayed({
        if (
          generation != previewGeneration ||
          previewStreaming ||
          camera == null
        ) {
          return@postDelayed
        }

        if (!previewRetryAttempted) {
          previewRetryAttempted = true
          previewView.implementationMode = PreviewView.ImplementationMode.PERFORMANCE
          bindCamera(isPreviewRetry = true)
        } else {
          emitError(
            "E_PREVIEW_TIMEOUT",
            "CameraX bound successfully but PreviewView never reached STREAMING in either compatible or performance mode."
          )
        }
      }, 1800L)
    } catch (error: Throwable) {
      emitError("E_CAMERA_BIND", error.message ?: "Unable to bind the selected camera.")
    }
  }

  private fun cameraSelector(): CameraSelector {
    val cameraId = requestedCameraId

    if (cameraId == null) {
      return CameraSelector.Builder()
        .requireLensFacing(lensFacing)
        .build()
    }

    return CameraSelector.Builder()
      .addCameraFilter(CameraFilter { cameraInfos ->
        cameraInfos.filter { info ->
          Camera2CameraInfo.from(info).cameraId == cameraId
        }
      })
      .build()
  }

  private fun candidateCameraInfo(): CameraInfo? {
    val provider = cameraProvider ?: return null

    requestedCameraId?.let { id ->
      provider.availableCameraInfos.firstOrNull {
        Camera2CameraInfo.from(it).cameraId == id
      }?.let { return it }
    }

    return provider.availableCameraInfos.firstOrNull { info ->
      val facing = Camera2CameraInfo.from(info).getCameraCharacteristic(
        CameraCharacteristics.LENS_FACING
      )

      when (lensFacing) {
        CameraSelector.LENS_FACING_FRONT ->
          facing == CameraCharacteristics.LENS_FACING_FRONT
        else ->
          facing == CameraCharacteristics.LENS_FACING_BACK
      }
    }
  }

  private fun captureBoundPhoto(promise: Promise) {
    val capture = imageCapture
    if (capture == null) {
      promise.reject("E_CAMERA_NOT_READY", "The camera is not ready.", null)
      return
    }

    val timestamp = System.currentTimeMillis()

    when (activeOutputFormat) {
      ImageCapture.OUTPUT_FORMAT_RAW_JPEG -> {
        val rawFile = File(context.cacheDir, "shooter-${timestamp}-raw.dng")
        val jpegFile = File(context.cacheDir, "shooter-${timestamp}-photo.jpg")

        val rawOptions = ImageCapture.OutputFileOptions.Builder(rawFile).build()
        val jpegOptions = ImageCapture.OutputFileOptions.Builder(jpegFile).build()

        var rawSaved = false
        var jpegSaved = false
        var resolved = false

        capture.takePicture(
          rawOptions,
          jpegOptions,
          mainExecutor,
          object : ImageCapture.OnImageSavedCallback {
            override fun onImageSaved(outputFileResults: ImageCapture.OutputFileResults) {
              if (resolved) return

              if (outputFileResults.imageFormat == ImageFormat.RAW_SENSOR) {
                rawSaved = true
              } else {
                jpegSaved = true
              }

              if (rawSaved && jpegSaved) {
                resolved = true
                promise.resolve(
                  mapOf(
                    "uri" to Uri.fromFile(jpegFile).toString(),
                    "rawUri" to Uri.fromFile(rawFile).toString()
                  )
                )
              }
            }

            override fun onError(exception: ImageCaptureException) {
              if (resolved) return
              resolved = true
              promise.reject("E_CAPTURE", exception.message ?: "RAW capture failed.", exception)
            }
          }
        )
      }

      ImageCapture.OUTPUT_FORMAT_RAW -> {
        val rawFile = File(context.cacheDir, "shooter-${timestamp}-raw.dng")
        val options = ImageCapture.OutputFileOptions.Builder(rawFile).build()

        capture.takePicture(
          options,
          mainExecutor,
          object : ImageCapture.OnImageSavedCallback {
            override fun onImageSaved(outputFileResults: ImageCapture.OutputFileResults) {
              val uri = Uri.fromFile(rawFile).toString()
              promise.resolve(mapOf("uri" to uri, "rawUri" to uri))
            }

            override fun onError(exception: ImageCaptureException) {
              promise.reject("E_CAPTURE", exception.message ?: "RAW capture failed.", exception)
            }
          }
        )
      }

      else -> {
        val jpegFile = File(context.cacheDir, "shooter-${timestamp}-photo.jpg")
        val options = ImageCapture.OutputFileOptions.Builder(jpegFile).build()

        capture.takePicture(
          options,
          mainExecutor,
          object : ImageCapture.OnImageSavedCallback {
            override fun onImageSaved(outputFileResults: ImageCapture.OutputFileResults) {
              promise.resolve(mapOf("uri" to Uri.fromFile(jpegFile).toString()))
            }

            override fun onError(exception: ImageCaptureException) {
              promise.reject("E_CAPTURE", exception.message ?: "Photo capture failed.", exception)
            }
          }
        )
      }
    }
  }

  private fun applyManualControls() {
    val activeCamera = camera ?: return
    val info = activeCamera2Info() ?: return
    val control = Camera2CameraControl.from(activeCamera.cameraControl)
    val builder = CaptureRequestOptions.Builder()

    val hasManualExposure = manualIso != null && manualExposureNanos != null

    if (hasManualExposure) {
      builder.setCaptureRequestOption(
        CaptureRequest.CONTROL_AE_MODE,
        CaptureRequest.CONTROL_AE_MODE_OFF
      )
      builder.setCaptureRequestOption(
        CaptureRequest.SENSOR_SENSITIVITY,
        manualIso!!
      )
      builder.setCaptureRequestOption(
        CaptureRequest.SENSOR_EXPOSURE_TIME,
        manualExposureNanos!!
      )
    } else {
      builder.setCaptureRequestOption(
        CaptureRequest.CONTROL_AE_MODE,
        CaptureRequest.CONTROL_AE_MODE_ON
      )
    }

    val minFocusDistance = info.getCameraCharacteristic(
      CameraCharacteristics.LENS_INFO_MINIMUM_FOCUS_DISTANCE
    ) ?: 0f

    if (manualFocusPosition != null && minFocusDistance > 0f) {
      builder.setCaptureRequestOption(
        CaptureRequest.CONTROL_AF_MODE,
        CaptureRequest.CONTROL_AF_MODE_OFF
      )
      builder.setCaptureRequestOption(
        CaptureRequest.LENS_FOCUS_DISTANCE,
        minFocusDistance * (1f - manualFocusPosition!!)
      )
    } else {
      builder.setCaptureRequestOption(
        CaptureRequest.CONTROL_AF_MODE,
        CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE
      )
    }

    val temperature = manualWhiteBalanceTemperature
    if (temperature != null) {
      builder.setCaptureRequestOption(
        CaptureRequest.CONTROL_AWB_MODE,
        CaptureRequest.CONTROL_AWB_MODE_OFF
      )
      builder.setCaptureRequestOption(
        CaptureRequest.COLOR_CORRECTION_MODE,
        CaptureRequest.COLOR_CORRECTION_MODE_TRANSFORM_MATRIX
      )
      builder.setCaptureRequestOption(
        CaptureRequest.COLOR_CORRECTION_GAINS,
        temperatureToGains(temperature, manualWhiteBalanceTint)
      )
    } else {
      builder.setCaptureRequestOption(
        CaptureRequest.CONTROL_AWB_MODE,
        CaptureRequest.CONTROL_AWB_MODE_AUTO
      )
    }

    control.setCaptureRequestOptions(builder.build())
  }

  private fun activeCamera2Info(): Camera2CameraInfo? {
    return camera?.cameraInfo?.let { Camera2CameraInfo.from(it) }
  }

  private fun supportedRawFormats(info: CameraInfo?): Set<Int> {
    if (info == null) return emptySet()

    return try {
      ImageCapture.getImageCaptureCapabilities(info)
        .supportedOutputFormats
        .filter {
          it == ImageCapture.OUTPUT_FORMAT_RAW ||
            it == ImageCapture.OUTPUT_FORMAT_RAW_JPEG
        }
        .toSet()
    } catch (_: Throwable) {
      emptySet()
    }
  }

  private fun supportsRaw(info: CameraInfo?): Boolean {
    return supportedRawFormats(info).isNotEmpty()
  }

  private fun emitCapabilities() {
    val activeCamera = camera ?: return
    val info = Camera2CameraInfo.from(activeCamera.cameraInfo)

    val capabilities = info.getCameraCharacteristic(
      CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES
    ) ?: intArrayOf()

    val manualSensor = capabilities.contains(
      CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES_MANUAL_SENSOR
    )
    val manualPost = capabilities.contains(
      CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES_MANUAL_POST_PROCESSING
    )

    val isoRange = info.getCameraCharacteristic(
      CameraCharacteristics.SENSOR_INFO_SENSITIVITY_RANGE
    )
    val shutterRange = info.getCameraCharacteristic(
      CameraCharacteristics.SENSOR_INFO_EXPOSURE_TIME_RANGE
    )
    val minimumFocusDistance = info.getCameraCharacteristic(
      CameraCharacteristics.LENS_INFO_MINIMUM_FOCUS_DISTANCE
    ) ?: 0f

    val exposureState = activeCamera.cameraInfo.exposureState
    val exposureStep = exposureState.exposureCompensationStep.toFloat()
    val exposureRange = exposureState.exposureCompensationRange
    val zoomState = activeCamera.cameraInfo.zoomState.value

    val lenses = cameraProvider?.availableCameraInfos?.map { cameraInfo ->
      val camera2Info = Camera2CameraInfo.from(cameraInfo)
      val facing = camera2Info.getCameraCharacteristic(CameraCharacteristics.LENS_FACING)
      val focalLengths = camera2Info.getCameraCharacteristic(
        CameraCharacteristics.LENS_INFO_AVAILABLE_FOCAL_LENGTHS
      )?.map { it.toDouble() } ?: emptyList()

      mapOf(
        "id" to camera2Info.cameraId,
        "name" to "Camera ${camera2Info.cameraId}",
        "facing" to when (facing) {
          CameraCharacteristics.LENS_FACING_FRONT -> "front"
          CameraCharacteristics.LENS_FACING_BACK -> "back"
          else -> "unknown"
        },
        "focalLengths" to focalLengths
      )
    } ?: emptyList()

    val payload = mutableMapOf<String, Any>(
      "platform" to "android",
      "supportsManualExposure" to manualSensor,
      "supportsManualFocus" to (manualSensor && minimumFocusDistance > 0f),
      "supportsManualWhiteBalance" to manualPost,
      "supportsRaw" to supportsRaw(activeCamera.cameraInfo),
      "maxZoom" to (zoomState?.maxZoomRatio?.toDouble() ?: 1.0),
      "lenses" to lenses
    )

    isoRange?.let {
      payload["minISO"] = it.lower.toDouble()
      payload["maxISO"] = it.upper.toDouble()
    }

    shutterRange?.let {
      payload["minShutterSeconds"] = it.lower / 1_000_000_000.0
      payload["maxShutterSeconds"] = it.upper / 1_000_000_000.0
    }

    if (exposureState.isExposureCompensationSupported) {
      payload["minExposureBias"] = exposureRange.lower * exposureStep
      payload["maxExposureBias"] = exposureRange.upper * exposureStep
    }

    onCapabilities(payload)
  }

  private fun temperatureToGains(temperature: Double, tint: Double): RggbChannelVector {
    val temp = (temperature.coerceIn(2_000.0, 12_000.0) / 100.0)

    val red = if (temp <= 66) {
      255.0
    } else {
      329.698727446 * (temp - 60).pow(-0.1332047592)
    }.coerceIn(1.0, 255.0)

    val green = if (temp <= 66) {
      99.4708025861 * ln(temp) - 161.1195681661
    } else {
      288.1221695283 * (temp - 60).pow(-0.0755148492)
    }.coerceIn(1.0, 255.0)

    val blue = if (temp >= 66) {
      255.0
    } else if (temp <= 19) {
      1.0
    } else {
      138.5177312231 * ln(temp - 10) - 305.0447927307
    }.coerceIn(1.0, 255.0)

    val tintShift = (tint / 300.0).coerceIn(-0.5, 0.5)
    val redGain = ((green / red) * (1.0 + tintShift)).coerceIn(1.0, 8.0)
    val blueGain = ((green / blue) * (1.0 - tintShift)).coerceIn(1.0, 8.0)

    return RggbChannelVector(
      redGain.toFloat(),
      1f,
      1f,
      blueGain.toFloat()
    )
  }

  private fun emitError(code: String, message: String) {
    onError(mapOf("code" to code, "message" to message))
  }
}

class CameraEngineException(message: String) : Exception(message)
