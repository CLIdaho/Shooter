import {
  requireNativeViewManager,
  requireOptionalNativeModule,
} from 'expo-modules-core';
import React, { forwardRef } from 'react';
import type { ViewProps } from 'react-native';

export type CameraLens = {
  id: string;
  name: string;
  facing: 'front' | 'back' | 'unknown';
  focalLengths?: number[];
};

export type CameraCapabilities = {
  platform: 'ios' | 'android';
  supportsManualExposure: boolean;
  supportsManualFocus: boolean;
  supportsManualWhiteBalance: boolean;
  supportsRaw: boolean;
  minISO: number | null;
  maxISO: number | null;
  minShutterSeconds: number | null;
  maxShutterSeconds: number | null;
  minExposureBias: number | null;
  maxExposureBias: number | null;
  maxZoom: number;
  lenses: CameraLens[];
};

export type NativeCaptureResult = {
  uri: string;
  rawUri?: string | null;
  width?: number;
  height?: number;
};

export type ShooterNativeCameraViewHandle = {
  takePhoto(raw: boolean): Promise<NativeCaptureResult>;
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

export type ShooterNativeCameraViewProps = ViewProps & {
  facing?: 'front' | 'back';
  flash?: 'off' | 'on' | 'auto';
  zoom?: number;
  rawEnabled?: boolean;
  onCameraReady?: (event: { nativeEvent: { ready: boolean } }) => void;
  onCapabilities?: (event: { nativeEvent: CameraCapabilities }) => void;
  onError?: (event: {
    nativeEvent: { code: string; message: string };
  }) => void;
};

type NativeCameraComponent = React.ComponentType<
  ShooterNativeCameraViewProps &
    React.RefAttributes<ShooterNativeCameraViewHandle>
>;

const nativeModule = requireOptionalNativeModule('ShooterCamera');

let NativeView: NativeCameraComponent | null = null;

if (nativeModule) {
  try {
    NativeView = requireNativeViewManager(
      'ShooterCamera',
    ) as unknown as NativeCameraComponent;
  } catch {
    NativeView = null;
  }
}

export const isShooterNativeCameraAvailable = NativeView !== null;

export const ShooterNativeCameraView = forwardRef<
  ShooterNativeCameraViewHandle,
  ShooterNativeCameraViewProps
>(function ShooterNativeCameraView(props, ref) {
  const Component = NativeView;
  if (!Component) return null;

  return <Component {...props} ref={ref} />;
});
