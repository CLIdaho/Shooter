import {
  CameraView,
  type CameraType,
} from 'expo-camera';
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import {
  CameraCapabilities,
  isShooterNativeCameraAvailable,
  NativeCaptureResult,
  ShooterNativeCameraView,
  ShooterNativeCameraViewHandle,
} from '../modules/shooter-camera';

export type CameraSurfaceMode = 'photo' | 'video';

export type CameraEngineStatus = {
  engine: 'native' | 'expo';
  state: 'starting' | 'ready' | 'fallback';
  reason?: string;
};

export type CameraSurfaceHandle = {
  takePhoto(): Promise<NativeCaptureResult | null>;
  startRecording(): Promise<{ uri: string } | null>;
  stopRecording(): void;
  setManualExposure(iso: number, shutterSeconds: number): Promise<void>;
  setAutoExposure(): Promise<void>;
  setExposureBias(ev: number): Promise<void>;
  setManualFocus(position: number): Promise<void>;
  setAutoFocus(): Promise<void>;
  setFocusPoint(x: number, y: number): Promise<void>;
  setWhiteBalanceTemperature(temperature: number, tint: number): Promise<void>;
  setAutoWhiteBalance(): Promise<void>;
  setLens(lensId: string): Promise<void>;
  resetControls(): Promise<void>;
};

type Props = {
  style?: StyleProp<ViewStyle>;
  mode: CameraSurfaceMode;
  facing: CameraType;
  flash: 'off' | 'on' | 'auto';
  zoom: number;
  rawEnabled?: boolean;
  onCapabilities?: (capabilities: CameraCapabilities) => void;
  onNativeError?: (error: { code: string; message: string }) => void;
  onEngineStatus?: (status: CameraEngineStatus) => void;
};

const NATIVE_PREVIEW_TIMEOUT_MS = 5200;

export const CameraSurface = forwardRef<CameraSurfaceHandle, Props>(
  function CameraSurface(
    {
      style,
      mode,
      facing,
      flash,
      zoom,
      rawEnabled = false,
      onCapabilities,
      onNativeError,
      onEngineStatus,
    },
    ref,
  ) {
    const expoRef = useRef<CameraView>(null);
    const nativeRef = useRef<ShooterNativeCameraViewHandle>(null);
    const nativeReadyRef = useRef(false);

    const [nativeFailed, setNativeFailed] = useState(false);

    const nativeCandidate =
      mode === 'photo' && isShooterNativeCameraAvailable;
    const useNativePhotoEngine = nativeCandidate && !nativeFailed;

    useEffect(() => {
      nativeReadyRef.current = false;

      if (!nativeCandidate) {
        setNativeFailed(false);
        onEngineStatus?.({
          engine: 'expo',
          state: 'ready',
          reason: mode === 'video' ? 'VIDEO_ENGINE' : 'NATIVE_UNAVAILABLE',
        });
        return;
      }

      setNativeFailed(false);
      onEngineStatus?.({ engine: 'native', state: 'starting' });

      const timeout = setTimeout(() => {
        if (nativeReadyRef.current) return;

        setNativeFailed(true);
        onEngineStatus?.({
          engine: 'expo',
          state: 'fallback',
          reason: 'E_NATIVE_PREVIEW_TIMEOUT',
        });
        onNativeError?.({
          code: 'E_NATIVE_PREVIEW_TIMEOUT',
          message:
            'The native camera bound but did not confirm a streaming preview. Shooter switched to the Expo camera fallback.',
        });
      }, NATIVE_PREVIEW_TIMEOUT_MS);

      return () => clearTimeout(timeout);
    // Callback identities can change when the parent re-renders. They must not
    // restart the native-camera watchdog or clear a fallback decision.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, nativeCandidate]);

    function requireNative() {
      if (!nativeRef.current || nativeFailed) {
        throw new Error(
          'This control requires the Shooter native camera engine and an active native preview.',
        );
      }

      return nativeRef.current;
    }

    useImperativeHandle(
      ref,
      () => ({
        async takePhoto() {
          if (useNativePhotoEngine) {
            return (await nativeRef.current?.takePhoto(rawEnabled)) ?? null;
          }

          const result = await expoRef.current?.takePictureAsync({
            quality: 0.96,
            shutterSound: true,
          });

          return result?.uri ? { uri: result.uri } : null;
        },

        async startRecording() {
          const result = await expoRef.current?.recordAsync();
          return result?.uri ? { uri: result.uri } : null;
        },

        stopRecording() {
          expoRef.current?.stopRecording();
        },

        setManualExposure(iso, shutterSeconds) {
          return requireNative().setManualExposure(iso, shutterSeconds);
        },

        setAutoExposure() {
          return requireNative().setAutoExposure();
        },

        setExposureBias(ev) {
          return requireNative().setExposureBias(ev);
        },

        setManualFocus(position) {
          return requireNative().setManualFocus(position);
        },

        setAutoFocus() {
          return requireNative().setAutoFocus();
        },

        setFocusPoint(x, y) {
          return requireNative().setFocusPoint(x, y);
        },

        setWhiteBalanceTemperature(temperature, tint) {
          return requireNative().setWhiteBalanceTemperature(temperature, tint);
        },

        setAutoWhiteBalance() {
          return requireNative().setAutoWhiteBalance();
        },

        setLens(lensId) {
          return requireNative().setLens(lensId);
        },

        resetControls() {
          return requireNative().resetControls();
        },
      }),
      [nativeFailed, rawEnabled, useNativePhotoEngine],
    );

    if (useNativePhotoEngine) {
      return (
        <ShooterNativeCameraView
          ref={nativeRef}
          style={style}
          facing={facing}
          flash={flash}
          zoom={zoom}
          rawEnabled={rawEnabled}
          onCameraReady={() => {
            nativeReadyRef.current = true;
            onEngineStatus?.({ engine: 'native', state: 'ready' });
          }}
          onCapabilities={(event) => onCapabilities?.(event.nativeEvent)}
          onError={(event) => {
            const error = event.nativeEvent;
            onNativeError?.(error);

            if (
              error.code === 'E_CAMERA_PROVIDER' ||
              error.code === 'E_NO_LIFECYCLE' ||
              error.code === 'E_CAMERA_BIND' ||
              error.code === 'E_PREVIEW_TIMEOUT'
            ) {
              setNativeFailed(true);
              onEngineStatus?.({
                engine: 'expo',
                state: 'fallback',
                reason: error.code,
              });
            }
          }}
        />
      );
    }

    return (
      <CameraView
        ref={expoRef}
        style={style}
        facing={facing}
        mode={mode === 'video' ? 'video' : 'picture'}
        flash={flash}
        zoom={zoom}
      />
    );
  },
);
