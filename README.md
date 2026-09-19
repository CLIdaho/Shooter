# Shooter

Shooter is a camera-first mobile app built around touch.

## Interaction model

- **Tap** — capture instantly
- **Pinch** — zoom
- **Double tap** — jump between lenses
- **Long press** — open the radial control wheel
- **Drag** — choose or adjust a control
- **Release** — return to the live camera

The camera stays primary. Controls only appear when they are needed.

## Stack

- Expo SDK 57 / React Native
- TypeScript
- expo-camera
- expo-media-library
- expo-file-system
- expo-haptics

## Run

```bash
npm install
npx expo start
```

For real camera testing, use a physical iOS or Android device.

## Current scope

The first build focuses on the core camera experience: full-screen live camera, one-tap capture, pinch zoom, double-tap lens switching, a long-press radial control wheel, offline local media storage, a local gallery, and camera settings that remain out of the way.
