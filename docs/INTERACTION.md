# Shooter interaction model

Shooter deliberately removes the permanent shutter button and gallery button.

## Camera-first rule

The live image owns the screen. Permanent chrome should be reduced to state, not controls.

| Gesture | Action |
| --- | --- |
| Single tap | Capture a photo, or start/stop recording when Video is active |
| Double tap | Toggle a fast zoom preset |
| Pinch | Continuous zoom |
| Long press | Materialize the radial control wheel under the finger |
| Hold + drag | Select a wheel control |
| Continue through Pro | Enter the native professional-control ring without lifting |
| Pull inward/outward in a Pro wedge | Set that control's value |
| Release | Commit the selection/value and dismiss the wheel |
| Swipe right from the left screen edge | Open the local Shooter gallery |

## Root wheel

The root ring intentionally stays small:

- Photo
- Video
- Flash
- Grid
- Timer
- Front/back camera
- Zoom
- Pro

There is still no permanent settings toolbar.

## Pro ring

Dragging through **Pro** transforms the wheel in-place. The same continuous gesture exposes:

- ISO
- Shutter speed
- Manual focus
- White-balance temperature
- Exposure compensation
- RAW
- Physical/available lens cycling
- Auto reset
- Back/cancel

Adjustable controls use radial distance as the value axis. Shooter previews the value beneath the wheel while the finger is held, then commits it on release. Unsupported controls remain visually disabled instead of pretending to work.

The Pro ring is capability-driven. It only enables a control when the native camera engine reports support from the active phone/camera.

## Native implementation

Photo mode prefers Shooter's local native camera module when it is present in a development/production build:

- iOS: AVFoundation
- Android: CameraX + Camera2 interop

The Expo camera surface remains a fallback and currently handles video while native video capture is still being built.

## Gallery

There is intentionally **no gallery button on the camera screen**. The left edge is the gallery affordance. A rightward edge swipe transitions into Shots; swiping right inside Shots returns to the camera.

Captured media is copied from the camera cache into the app's document directory, so the core capture and gallery flow does not require network access or a cloud account. When RAW+processed capture is enabled, the DNG is stored beside its processed image and deleted with that shot.

## Design principles

1. Camera always stays primary.
2. Controls appear at the point of intent.
3. Release returns the user to photography.
4. Common actions become muscle memory.
5. Unsupported hardware features never masquerade as working controls.
6. Offline is the default, not a degraded mode.
