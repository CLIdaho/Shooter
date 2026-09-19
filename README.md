# Shooter

Shooter is a camera-first mobile app built around touch.

## The rule

**No permanent shutter button. No gallery button on the camera.**

The live camera is the interface.

## Interaction model

- **Single tap** — capture instantly
- **Double tap** — toggle a fast zoom preset
- **Pinch** — continuous zoom
- **Long press** — materialize the radial control wheel under your finger
- **Hold + drag** — choose a camera control
- **Release** — apply it and return to the live camera
- **Swipe right from the left edge** — enter the local Shooter gallery

## Current radial controls

- Photo / Video
- Flash
- Front / back camera
- Timer
- Grid
- Zoom preset
- Auto reset

The first build only exposes camera controls the current cross-platform camera layer can genuinely honor. Manual shutter speed, ISO, white balance, focus distance, RAW, and physical-lens selection are reserved for the native camera-engine phase rather than being represented as fake controls.

## Offline-first storage

Photos and videos are copied out of the temporary camera cache and into Shooter's app document storage. Capturing and reviewing media does not require a network connection, cloud account, or sync service.

## Stack

- Expo SDK 57
- React Native 0.86
- TypeScript
- expo-camera
- expo-file-system
- expo-haptics
- react-native-gesture-handler

## Run

```bash
npm install
npx expo start
```

Use a physical iOS or Android device for real camera testing.

See [docs/INTERACTION.md](docs/INTERACTION.md) for the UX contract.
