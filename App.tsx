import { Ionicons } from '@expo/vector-icons';
import {
  Camera,
  useCameraPermissions,
} from 'expo-camera';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import type { CameraCapabilities } from './modules/shooter-camera';
import { CameraSurface, CameraSurfaceHandle } from './src/CameraSurface';
import { GalleryScreen } from './src/GalleryScreen';
import {
  PRO_WHEEL_SEGMENTS,
  ProWheelAction,
  RadialWheel,
  WheelAction,
  WheelLayer,
  WheelSegment,
  WHEEL_SEGMENTS,
} from './src/RadialWheel';
import { listShots, saveCapturedPhoto, saveShot, Shot } from './src/storage';

type CaptureMode = 'photo' | 'video';
type Facing = 'back' | 'front';
type Flash = 'off' | 'on' | 'auto';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const WHEEL_RADIUS = 135;
const EDGE_ZONE = 28;
const PRO_ENTRY_RADIUS = 70;
const ADJUST_MIN_RADIUS = 58;
const ADJUST_MAX_RADIUS = 195;

const ADJUSTABLE_PRO_ACTIONS = new Set<ProWheelAction>([
  'iso',
  'shutter',
  'focus',
  'wb',
  'ev',
]);

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function clampWheelPoint(x: number, y: number) {
  return {
    x: Math.max(WHEEL_RADIUS + 12, Math.min(SCREEN_WIDTH - WHEEL_RADIUS - 12, x)),
    y: Math.max(WHEEL_RADIUS + 72, Math.min(SCREEN_HEIGHT - WHEEL_RADIUS - 72, y)),
  };
}

function radialAction<T extends string>(
  dx: number,
  dy: number,
  segments: WheelSegment<T>[],
): T | null {
  const distance = Math.hypot(dx, dy);
  if (distance < 42) return null;

  const degrees = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;

  let best: WheelSegment<T> | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const segment of segments) {
    const delta = Math.abs(((degrees - segment.angle + 540) % 360) - 180);
    if (delta < bestDistance) {
      best = segment;
      bestDistance = delta;
    }
  }

  return best?.action ?? null;
}

function adjustmentProgress(distance: number) {
  return clamp(
    (distance - ADJUST_MIN_RADIUS) / (ADJUST_MAX_RADIUS - ADJUST_MIN_RADIUS),
    0,
    1,
  );
}

function linear(min: number, max: number, progress: number) {
  return min + (max - min) * progress;
}

function logarithmic(min: number, max: number, progress: number) {
  const safeMin = Math.max(min, 0.0000001);
  const safeMax = Math.max(max, safeMin);
  return Math.exp(
    Math.log(safeMin) + (Math.log(safeMax) - Math.log(safeMin)) * progress,
  );
}

function formatShutter(seconds: number) {
  if (seconds >= 1) {
    return `${seconds >= 10 ? seconds.toFixed(0) : seconds.toFixed(1)}s`;
  }

  return `1/${Math.max(1, Math.round(1 / seconds))}`;
}

function defaultISO(capabilities: CameraCapabilities) {
  const min = capabilities.minISO ?? 25;
  const max = capabilities.maxISO ?? 6400;
  return clamp(100, min, max);
}

function defaultShutter(capabilities: CameraCapabilities) {
  const min = capabilities.minShutterSeconds ?? 1 / 8000;
  const max = capabilities.maxShutterSeconds ?? 1;
  return clamp(1 / 125, min, max);
}

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraSurfaceHandle>(null);

  const [screen, setScreen] = useState<'camera' | 'gallery'>('camera');
  const [shots, setShots] = useState<Shot[]>([]);
  const [captureMode, setCaptureMode] = useState<CaptureMode>('photo');
  const [facing, setFacing] = useState<Facing>('back');
  const [flash, setFlash] = useState<Flash>('off');
  const [grid, setGrid] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState<0 | 3 | 10>(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [zoom, setZoom] = useState(0);
  const [recording, setRecording] = useState(false);

  const [nativeCapabilities, setNativeCapabilities] =
    useState<CameraCapabilities | null>(null);
  const [rawEnabled, setRawEnabled] = useState(false);
  const [manualISO, setManualISO] = useState<number | null>(null);
  const [manualShutter, setManualShutter] = useState<number | null>(null);
  const [manualFocus, setManualFocus] = useState<number | null>(null);
  const [whiteBalanceTemperature, setWhiteBalanceTemperature] =
    useState<number | null>(null);
  const [exposureBias, setExposureBias] = useState(0);
  const [activeLensId, setActiveLensId] = useState<string | null>(null);

  const [wheelOpen, setWheelOpen] = useState(false);
  const [wheelPoint, setWheelPoint] = useState({
    x: SCREEN_WIDTH / 2,
    y: SCREEN_HEIGHT / 2,
  });
  const wheelPointRef = useRef(wheelPoint);

  const [wheelLayer, setWheelLayer] = useState<WheelLayer>('root');
  const wheelLayerRef = useRef<WheelLayer>('root');

  const [wheelSelection, setWheelSelection] = useState<WheelAction | null>(null);
  const wheelSelectionRef = useRef<WheelAction | null>(null);

  const [proSelection, setProSelection] = useState<ProWheelAction | null>(null);
  const proSelectionRef = useRef<ProWheelAction | null>(null);

  const [proAdjustment, setProAdjustment] = useState<number | null>(null);
  const proAdjustmentRef = useRef(0.5);

  const pinchStartZoom = useRef(0);
  const edgeStart = useRef(false);
  const shutterFlash = useRef(new Animated.Value(0)).current;

  const refreshShots = useCallback(() => setShots(listShots()), []);

  useEffect(() => {
    refreshShots();
  }, [refreshShots]);

  const fireVisualShutter = useCallback(() => {
    shutterFlash.setValue(0.72);
    Animated.timing(shutterFlash, {
      toValue: 0,
      duration: 130,
      useNativeDriver: true,
    }).start();
  }, [shutterFlash]);

  const takePhotoNow = useCallback(async () => {
    if (!cameraRef.current) return;

    const result = await cameraRef.current.takePhoto();
    if (!result?.uri) return;

    fireVisualShutter();
    await saveCapturedPhoto(result.uri, result.rawUri);
    refreshShots();
  }, [fireVisualShutter, refreshShots]);

  const beginTimedPhoto = useCallback(async () => {
    if (countdown !== null) return;

    if (timerSeconds === 0) {
      await takePhotoNow();
      return;
    }

    for (let remaining = timerSeconds; remaining > 0; remaining -= 1) {
      setCountdown(remaining);
      await Haptics.selectionAsync();
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    setCountdown(null);
    await takePhotoNow();
  }, [countdown, takePhotoNow, timerSeconds]);

  const toggleRecording = useCallback(async () => {
    if (!cameraRef.current) return;

    if (recording) {
      cameraRef.current.stopRecording();
      return;
    }

    const microphone = await Camera.requestMicrophonePermissionsAsync();
    if (!microphone.granted) return;

    setRecording(true);
    try {
      const result = await cameraRef.current.startRecording();
      if (result?.uri) {
        await saveShot(result.uri, 'video');
        refreshShots();
      }
    } finally {
      setRecording(false);
    }
  }, [recording, refreshShots]);

  const capture = useCallback(() => {
    if (wheelOpen) return;

    if (captureMode === 'video') {
      void toggleRecording();
    } else {
      void beginTimedPhoto();
    }
  }, [beginTimedPhoto, captureMode, toggleRecording, wheelOpen]);

  const cycleTimer = useCallback(() => {
    setTimerSeconds((current) => (current === 0 ? 3 : current === 3 ? 10 : 0));
  }, []);

  const cycleFlash = useCallback(() => {
    setFlash((current) =>
      current === 'off' ? 'auto' : current === 'auto' ? 'on' : 'off',
    );
  }, []);

  const disabledProActions = useMemo<ProWheelAction[]>(() => {
    if (captureMode !== 'photo' || !nativeCapabilities) {
      return [
        'iso',
        'shutter',
        'focus',
        'wb',
        'ev',
        'raw',
        'lens',
        'auto',
      ];
    }

    const disabled: ProWheelAction[] = [];

    if (!nativeCapabilities.supportsManualExposure) {
      disabled.push('iso', 'shutter');
    }

    if (!nativeCapabilities.supportsManualFocus) {
      disabled.push('focus');
    }

    if (!nativeCapabilities.supportsManualWhiteBalance) {
      disabled.push('wb');
    }

    if (
      nativeCapabilities.minExposureBias === null ||
      nativeCapabilities.maxExposureBias === null
    ) {
      disabled.push('ev');
    }

    if (!nativeCapabilities.supportsRaw) {
      disabled.push('raw');
    }

    const facingLenses = nativeCapabilities.lenses.filter(
      (lens) => lens.facing === facing,
    );
    if (facingLenses.length <= 1) {
      disabled.push('lens');
    }

    return disabled;
  }, [captureMode, facing, nativeCapabilities]);

  const applyWheelAction = useCallback(
    (action: WheelAction | null) => {
      if (!action) return;

      switch (action) {
        case 'photo':
          setCaptureMode('photo');
          break;
        case 'video':
          setCaptureMode('video');
          break;
        case 'flash':
          cycleFlash();
          break;
        case 'grid':
          setGrid((value) => !value);
          break;
        case 'timer':
          cycleTimer();
          break;
        case 'flip':
          setFacing((value) => (value === 'back' ? 'front' : 'back'));
          setActiveLensId(null);
          break;
        case 'zoom':
          setZoom((value) => (value < 0.12 ? 0.22 : 0));
          break;
        case 'pro':
          break;
      }
    },
    [cycleFlash, cycleTimer],
  );

  const applyProWheelAction = useCallback(
    async (action: ProWheelAction | null, progress: number) => {
      if (
        !action ||
        action === 'back' ||
        disabledProActions.includes(action) ||
        !nativeCapabilities ||
        !cameraRef.current
      ) {
        return;
      }

      const camera = cameraRef.current;

      switch (action) {
        case 'iso': {
          const min = nativeCapabilities.minISO ?? 25;
          const max = nativeCapabilities.maxISO ?? 6400;
          const iso = Math.round(logarithmic(min, max, progress));
          const shutter =
            manualShutter ?? defaultShutter(nativeCapabilities);

          await camera.setManualExposure(iso, shutter);
          setManualISO(iso);
          if (manualShutter === null) setManualShutter(shutter);
          break;
        }

        case 'shutter': {
          const min = nativeCapabilities.minShutterSeconds ?? 1 / 8000;
          const max = nativeCapabilities.maxShutterSeconds ?? 1;
          const shutter = logarithmic(min, max, progress);
          const iso = manualISO ?? defaultISO(nativeCapabilities);

          await camera.setManualExposure(iso, shutter);
          setManualShutter(shutter);
          if (manualISO === null) setManualISO(iso);
          break;
        }

        case 'focus': {
          const position = clamp(progress, 0, 1);
          await camera.setManualFocus(position);
          setManualFocus(position);
          break;
        }

        case 'wb': {
          const temperature = Math.round(linear(2000, 12000, progress) / 50) * 50;
          await camera.setWhiteBalanceTemperature(temperature, 0);
          setWhiteBalanceTemperature(temperature);
          break;
        }

        case 'ev': {
          const min = nativeCapabilities.minExposureBias ?? -3;
          const max = nativeCapabilities.maxExposureBias ?? 3;
          const ev = Math.round(linear(min, max, progress) * 10) / 10;
          await camera.setExposureBias(ev);
          setExposureBias(ev);
          break;
        }

        case 'raw':
          setRawEnabled((value) => !value);
          break;

        case 'lens': {
          const facingLenses = nativeCapabilities.lenses.filter(
            (lens) => lens.facing === facing,
          );
          if (facingLenses.length <= 1) return;

          const currentIndex = facingLenses.findIndex(
            (lens) => lens.id === activeLensId,
          );
          const nextIndex =
            currentIndex < 0 ? 1 % facingLenses.length : (currentIndex + 1) % facingLenses.length;
          const nextLens = facingLenses[nextIndex];
          if (!nextLens) return;

          await camera.setLens(nextLens.id);
          setActiveLensId(nextLens.id);
          break;
        }

        case 'auto':
          await camera.resetControls();
          setManualISO(null);
          setManualShutter(null);
          setManualFocus(null);
          setWhiteBalanceTemperature(null);
          setExposureBias(0);
          setRawEnabled(false);
          setZoom(0);
          break;

        case 'back':
          break;
      }
    },
    [
      activeLensId,
      disabledProActions,
      facing,
      manualISO,
      manualShutter,
      nativeCapabilities,
    ],
  );

  const proStatus = useMemo(() => {
    if (!proSelection) {
      if (!nativeCapabilities || captureMode !== 'photo') {
        return 'PRO · NATIVE PHOTO ENGINE REQUIRED';
      }
      return 'PRO · SWEEP TO A CONTROL';
    }

    if (disabledProActions.includes(proSelection)) {
      return `${proSelection.toUpperCase()} · UNSUPPORTED ON THIS CAMERA`;
    }

    const progress = proAdjustment ?? proAdjustmentRef.current;

    switch (proSelection) {
      case 'iso': {
        if (!nativeCapabilities) return 'ISO';
        const min = nativeCapabilities.minISO ?? 25;
        const max = nativeCapabilities.maxISO ?? 6400;
        return `ISO · ${Math.round(logarithmic(min, max, progress))}`;
      }
      case 'shutter': {
        if (!nativeCapabilities) return 'SHUTTER';
        const min = nativeCapabilities.minShutterSeconds ?? 1 / 8000;
        const max = nativeCapabilities.maxShutterSeconds ?? 1;
        return `SHUTTER · ${formatShutter(logarithmic(min, max, progress))}`;
      }
      case 'focus':
        return `FOCUS · ${Math.round(progress * 100)}%`;
      case 'wb':
        return `WB · ${Math.round(linear(2000, 12000, progress) / 50) * 50}K`;
      case 'ev': {
        if (!nativeCapabilities) return 'EV';
        const min = nativeCapabilities.minExposureBias ?? -3;
        const max = nativeCapabilities.maxExposureBias ?? 3;
        const ev = Math.round(linear(min, max, progress) * 10) / 10;
        return `EV · ${ev > 0 ? '+' : ''}${ev.toFixed(1)}`;
      }
      case 'raw':
        return `RAW · ${rawEnabled ? 'TURN OFF' : 'TURN ON'}`;
      case 'lens': {
        const facingLenses =
          nativeCapabilities?.lenses.filter((lens) => lens.facing === facing) ?? [];
        const currentIndex = facingLenses.findIndex(
          (lens) => lens.id === activeLensId,
        );
        const nextIndex =
          currentIndex < 0 ? 1 % Math.max(facingLenses.length, 1) : (currentIndex + 1) % Math.max(facingLenses.length, 1);
        return `LENS · ${facingLenses[nextIndex]?.name ?? 'NEXT'}`;
      }
      case 'auto':
        return 'AUTO · RESET PRO CONTROLS';
      case 'back':
        return 'BACK · RELEASE TO CLOSE';
    }
  }, [
    activeLensId,
    captureMode,
    disabledProActions,
    facing,
    nativeCapabilities,
    proAdjustment,
    proSelection,
    rawEnabled,
  ]);

  const wheelStatus = useMemo(() => {
    if (wheelLayer === 'pro') return proStatus;
    if (!wheelSelection) return 'DRAG TO A CONTROL';

    switch (wheelSelection) {
      case 'flash':
        return `FLASH · ${flash.toUpperCase()}`;
      case 'grid':
        return `GRID · ${grid ? 'ON' : 'OFF'}`;
      case 'timer':
        return `TIMER · ${timerSeconds === 0 ? 'OFF' : `${timerSeconds}S`}`;
      case 'flip':
        return `CAMERA · ${facing.toUpperCase()}`;
      case 'video':
        return 'VIDEO';
      case 'photo':
        return rawEnabled ? 'PHOTO · RAW ENABLED' : 'PHOTO';
      case 'zoom':
        return zoom < 0.12 ? 'ZOOM · 2×' : 'ZOOM · 1×';
      case 'pro':
        return 'PRO · KEEP DRAGGING';
    }
  }, [
    facing,
    flash,
    grid,
    proStatus,
    rawEnabled,
    timerSeconds,
    wheelLayer,
    wheelSelection,
    zoom,
  ]);

  const singleTap = useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(1)
        .maxDuration(220)
        .runOnJS(true)
        .onEnd((_event, success) => {
          if (success) capture();
        }),
    [capture],
  );

  const doubleTap = useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(2)
        .maxDelay(250)
        .runOnJS(true)
        .onEnd((_event, success) => {
          if (!success) return;
          setZoom((value) => (value < 0.12 ? 0.22 : 0));
        }),
    [],
  );

  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .runOnJS(true)
        .onBegin(() => {
          pinchStartZoom.current = zoom;
        })
        .onUpdate((event) => {
          const delta = (event.scale - 1) * 0.25;
          setZoom(clamp(pinchStartZoom.current + delta, 0, 1));
        }),
    [zoom],
  );

  const controlWheel = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .activateAfterLongPress(340)
        .runOnJS(true)
        .onStart((event) => {
          const point = clampWheelPoint(event.x, event.y);

          wheelPointRef.current = point;
          wheelLayerRef.current = 'root';
          wheelSelectionRef.current = null;
          proSelectionRef.current = null;
          proAdjustmentRef.current = 0.5;

          setWheelPoint(point);
          setWheelLayer('root');
          setWheelSelection(null);
          setProSelection(null);
          setProAdjustment(null);
          setWheelOpen(true);

          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        })
        .onUpdate((event) => {
          const point = wheelPointRef.current;
          const dx = event.x - point.x;
          const dy = event.y - point.y;
          const distance = Math.hypot(dx, dy);

          if (wheelLayerRef.current === 'root') {
            const next = radialAction(dx, dy, WHEEL_SEGMENTS);

            if (next !== wheelSelectionRef.current) {
              wheelSelectionRef.current = next;
              setWheelSelection(next);
              if (next) void Haptics.selectionAsync();
            }

            if (next === 'pro' && distance >= PRO_ENTRY_RADIUS) {
              wheelLayerRef.current = 'pro';
              proSelectionRef.current = null;
              setWheelLayer('pro');
              setProSelection(null);
              setProAdjustment(null);
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            }

            return;
          }

          const next = radialAction(dx, dy, PRO_WHEEL_SEGMENTS);

          if (next !== proSelectionRef.current) {
            proSelectionRef.current = next;
            setProSelection(next);
            if (next) void Haptics.selectionAsync();
          }

          if (next && ADJUSTABLE_PRO_ACTIONS.has(next)) {
            const progress = adjustmentProgress(distance);
            proAdjustmentRef.current = progress;
            setProAdjustment(progress);
          } else {
            setProAdjustment(null);
          }
        })
        .onEnd(() => {
          if (wheelLayerRef.current === 'pro') {
            const action = proSelectionRef.current;
            const progress = proAdjustmentRef.current;
            void applyProWheelAction(action, progress);
          } else {
            applyWheelAction(wheelSelectionRef.current);
          }

          setWheelOpen(false);
          setWheelSelection(null);
          setProSelection(null);
          setProAdjustment(null);

          wheelLayerRef.current = 'root';
          wheelSelectionRef.current = null;
          proSelectionRef.current = null;
        })
        .onFinalize(() => {
          setWheelOpen(false);
        }),
    [applyProWheelAction, applyWheelAction],
  );

  const galleryEdgeSwipe = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX(18)
        .failOffsetY([-36, 36])
        .runOnJS(true)
        .onBegin((event) => {
          edgeStart.current = event.x <= EDGE_ZONE;
        })
        .onEnd((event) => {
          if (edgeStart.current && event.translationX > 76) {
            refreshShots();
            setScreen('gallery');
          }
          edgeStart.current = false;
        }),
    [refreshShots],
  );

  const cameraGesture = useMemo(
    () =>
      Gesture.Simultaneous(
        Gesture.Exclusive(doubleTap, singleTap),
        pinch,
        controlWheel,
        galleryEdgeSwipe,
      ),
    [controlWheel, doubleTap, galleryEdgeSwipe, pinch, singleTap],
  );

  if (!permission) {
    return <View style={styles.permissionScreen} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionScreen}>
        <Ionicons name="camera-outline" size={34} color="#fff" />
        <Text style={styles.permissionTitle}>SHOOTER</Text>
        <Text style={styles.permissionBody}>
          The camera is the interface. Shooter needs camera access to begin.
        </Text>
        <Pressable style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>ALLOW CAMERA</Text>
        </Pressable>
      </View>
    );
  }

  if (screen === 'gallery') {
    return (
      <GestureHandlerRootView style={styles.root}>
        <GalleryScreen
          shots={shots}
          onClose={() => setScreen('camera')}
          onChanged={refreshShots}
        />
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <GestureDetector gesture={cameraGesture}>
        <View style={styles.root}>
          <CameraSurface
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing={facing}
            mode={captureMode}
            flash={flash}
            zoom={zoom}
            rawEnabled={rawEnabled}
            onCapabilities={setNativeCapabilities}
            onNativeError={(error) => {
              console.warn('[Shooter native camera]', error.code, error.message);
            }}
          />

          {grid ? (
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              <View style={[styles.gridLineV, { left: '33.333%' }]} />
              <View style={[styles.gridLineV, { left: '66.666%' }]} />
              <View style={[styles.gridLineH, { top: '33.333%' }]} />
              <View style={[styles.gridLineH, { top: '66.666%' }]} />
            </View>
          ) : null}

          <SafeAreaView pointerEvents="none" style={styles.hud}>
            <View style={styles.modePill}>
              {recording ? <View style={styles.recordDot} /> : null}
              <Text style={styles.modeText}>
                {recording
                  ? 'REC'
                  : captureMode === 'photo' && rawEnabled
                    ? 'PHOTO · RAW'
                    : captureMode.toUpperCase()}
              </Text>
            </View>

            <View style={styles.hudBottom}>
              <Text style={styles.hudHint}>
                HOLD FOR CONTROLS · SWIPE FROM LEFT FOR SHOTS
              </Text>
            </View>
          </SafeAreaView>

          {countdown !== null ? (
            <View pointerEvents="none" style={styles.countdownWrap}>
              <Text style={styles.countdown}>{countdown}</Text>
            </View>
          ) : null}

          {wheelOpen ? (
            <RadialWheel
              x={wheelPoint.x}
              y={wheelPoint.y}
              layer={wheelLayer}
              selected={wheelSelection}
              proSelected={proSelection}
              disabledProActions={disabledProActions}
              statusText={wheelStatus}
              adjustmentProgress={
                wheelLayer === 'pro' &&
                proSelection &&
                ADJUSTABLE_PRO_ACTIONS.has(proSelection)
                  ? proAdjustment
                  : null
              }
            />
          ) : null}

          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              styles.flashOverlay,
              { opacity: shutterFlash },
            ]}
          />
        </View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  permissionScreen: {
    flex: 1,
    backgroundColor: '#050506',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 42,
  },
  permissionTitle: {
    marginTop: 18,
    color: '#fff',
    fontSize: 18,
    letterSpacing: 5,
    fontWeight: '600',
  },
  permissionBody: {
    marginTop: 14,
    maxWidth: 300,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    lineHeight: 20,
  },
  permissionButton: {
    marginTop: 28,
    minWidth: 180,
    height: 50,
    paddingHorizontal: 24,
    borderRadius: 25,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.34)',
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 11,
    letterSpacing: 1.8,
    fontWeight: '600',
  },
  hud: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modePill: {
    marginTop: 8,
    minWidth: 72,
    height: 30,
    paddingHorizontal: 13,
    borderRadius: 15,
    flexDirection: 'row',
    gap: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  modeText: {
    color: '#fff',
    fontSize: 9,
    letterSpacing: 1.9,
    fontWeight: '700',
  },
  recordDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ff3b30',
  },
  hudBottom: {
    width: '100%',
    alignItems: 'center',
    paddingBottom: 12,
  },
  hudHint: {
    color: 'rgba(255,255,255,0.52)',
    fontSize: 8,
    letterSpacing: 1.25,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowRadius: 8,
  },
  gridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.26)',
  },
  gridLineH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.26)',
  },
  countdownWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdown: {
    color: '#fff',
    fontSize: 88,
    fontWeight: '200',
    textShadowColor: 'rgba(0,0,0,0.32)',
    textShadowRadius: 18,
  },
  flashOverlay: {
    backgroundColor: '#fff',
  },
});
