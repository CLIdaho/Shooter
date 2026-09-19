import {
  CameraView,
  type CameraType,
  type FlashMode,
} from 'expo-camera';
import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
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
  flash: FlashMode;
  zoom: number;
  rawEnabled?: boolean;
  onCapabilities?: (capabilities: CameraCapabilities) => void;
  onNativeError?: (error: { code: string; message: string }) => void;
};

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
    },
    ref,
  ) {
    const expoRef = useRef<CameraView>(null);
    const nativeRef = useRef<ShooterNativeCameraViewHandle>(null);

    const useNativePhotoEngine =
      mode === 'photo' && isShooterNativeCameraAvailable;

    function requireNative() {
      if (!nativeRef.current) {
        throw new Error(
          'This control requires the Shooter native camera engine and a development/native build.',
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
      [rawEnabled, useNativePhotoEngine],
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
          onCapabilities={(event) => onCapabilities?.(event.nativeEvent)}
          onError={(event) => onNativeError?.(event.nativeEvent)}
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
