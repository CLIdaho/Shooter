# Native camera test plan

The JavaScript/TypeScript build can validate the interaction and bridge contract, but manual camera behavior must be proven on physical hardware.

## iOS

Test at least one modern multi-camera iPhone and one older supported iPhone.

- Preview starts/stops cleanly through foreground/background transitions.
- Tap capture writes a processed image.
- RAW capture creates DNG + processed companion when advertised.
- ISO changes exposure while shutter remains fixed.
- Shutter changes exposure/motion rendering while ISO remains fixed.
- Manual focus reaches near and far endpoints.
- Auto reset restores continuous AF/AE/AWB.
- White-balance temperature visibly changes color balance.
- EV respects the device-advertised range.
- Lens cycling never selects a camera from the wrong facing direction.
- Flash Off/Auto/On does not crash on cameras without flash.
- Rapid tap capture does not lose files or leak capture promises.
- Repeated front/back switching keeps preview and capture orientation correct.

## Android

Test at least one Pixel, one Samsung Galaxy, and one device that lacks full manual Camera2 capability.

- CameraX preview and JPEG capture work before testing pro controls.
- Capability discovery matches Camera2 hardware support.
- Manual ISO/shutter only enable when MANUAL_SENSOR exists.
- Manual focus only enables when a focus-distance range exists.
- Manual white balance only enables when MANUAL_POST_PROCESSING exists.
- DNG/RAW appears only when ImageCapture advertises RAW output.
- RAW+JPEG returns and persists both files where supported.
- Camera selection by ID survives rebind.
- Unsupported features remain disabled in the UI.
- Background/foreground lifecycle does not leave the camera locked.

## Interaction

- Long press opens the root wheel at the finger without covering the full view.
- Dragging through Pro changes to the Pro ring without lifting.
- Entering the Pro ring at the Back sector is a safe no-op if the user releases immediately.
- Moving radially changes the preview value.
- Release commits exactly once.
- The wheel disappears immediately after release.
- Left-edge swipe still owns gallery navigation and never adds a gallery button.
