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
| Release | Apply the selection and dismiss the wheel |
| Swipe right from the left screen edge | Open the local Shooter gallery |

## Radial controls

The first working wheel contains controls that can be honored by the current Expo camera layer:

- Photo / Video capture mode
- Flash
- Front/back camera
- Grid
- Timer
- Zoom preset
- Reset to Auto

Manual shutter speed, ISO, focus distance, white balance, RAW and physical-lens selection belong in the native camera-engine phase rather than being represented as fake controls.

## Gallery

There is intentionally **no gallery button on the camera screen**. The left edge is the gallery affordance. A rightward edge swipe transitions into Shots; swiping right inside Shots returns to the camera.

Captured media is copied from the camera cache into the app's document directory, so the core capture and gallery flow does not require network access or a cloud account.

## Design principles

1. Camera always stays primary.
2. Controls appear at the point of intent.
3. Release returns the user to photography.
4. Common actions become muscle memory.
5. Offline is the default, not a degraded mode.
