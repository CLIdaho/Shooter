# Shooter native camera engine

Shooter's professional controls require direct access to the platform camera stack. The native engine lives in `modules/shooter-camera` as a local Expo module so the app can keep its React Native gesture/UI layer while camera execution moves to AVFoundation and CameraX/Camera2.

## Phase 1 contract

The native view owns the preview session and exposes:

- capability discovery
- manual ISO + shutter
- exposure compensation
- manual focus + autofocus reset
- focus point
- white-balance temperature/tint
- zoom
- front/back selection
- lens selection hook
- flash mode
- RAW capability detection
- processed photo capture
- RAW + processed photo capture when supported

The JS API is intentionally capability-driven. A control should only appear in Shooter when the native engine reports that the active device supports it.

## Platform implementation

### iOS

AVFoundation is the source of truth:

- `AVCaptureSession`
- `AVCaptureDevice`
- `AVCaptureVideoPreviewLayer`
- `AVCapturePhotoOutput`
- `setExposureModeCustom`
- `setFocusModeLocked`
- locked white-balance gains
- `availableRawPhotoPixelFormatTypes`

### Android

CameraX 1.6.2 provides the lifecycle/preview/capture layer. Camera2 interop provides manual sensor controls where the device advertises the required capabilities.

CameraX 1.6 supports DNG RAW and RAW+JPEG capture. Shooter must query `ImageCaptureCapabilities` before exposing RAW.

## Important build change

This module contains custom Swift/Kotlin. It will not run inside stock Expo Go. Use a development build / native build:

```bash
npx expo prebuild --clean
npx expo run:ios --device
# or
npx expo run:android --device
```

Every native-code change requires rebuilding the native app binary.

## Rollout strategy

The current `expo-camera` surface remains the fallback while the native engine is being proven on physical devices. Once photo capture and manual controls pass device testing, Shooter can make the native surface the default and then move video capture into the same engine.
