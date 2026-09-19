import { Ionicons } from '@expo/vector-icons';
import {
  Camera,
  CameraView,
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
import { GalleryScreen } from './src/GalleryScreen';
import {
  RadialWheel,
  WheelAction,
  WHEEL_SEGMENTS,
} from './src/RadialWheel';
import { listShots, saveShot, Shot } from './src/storage';

type CaptureMode = 'photo' | 'video';
type Facing = 'back' | 'front';
type Flash = 'off' | 'on' | 'auto';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const WHEEL_RADIUS = 126;
const EDGE_ZONE = 28;

function clampWheelPoint(x: number, y: number) {
  return {
    x: Math.max(WHEEL_RADIUS + 12, Math.min(SCREEN_WIDTH - WHEEL_RADIUS - 12, x)),
    y: Math.max(WHEEL_RADIUS + 72, Math.min(SCREEN_HEIGHT - WHEEL_RADIUS - 72, y)),
  };
}

function actionFromVector(dx: number, dy: number): WheelAction | null {
  const distance = Math.hypot(dx, dy);
  if (distance < 42) return null;

  const degrees = (Math.atan2(dy, dx) * 180) / Math.PI;
  const normalized = (degrees + 360) % 360;
  const index = Math.round(normalized / 45) % 8;
  return WHEEL_SEGMENTS[index]?.action ?? null;
}

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

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

  const [wheelOpen, setWheelOpen] = useState(false);
  const [wheelPoint, setWheelPoint] = useState({ x: SCREEN_WIDTH / 2, y: SCREEN_HEIGHT / 2 });
  const wheelPointRef = useRef(wheelPoint);
  const [wheelSelection, setWheelSelection] = useState<WheelAction | null>(null);
  const wheelSelectionRef = useRef<WheelAction | null>(null);

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
    const result = await cameraRef.current.takePictureAsync({
      quality: 0.96,
      shutterSound: true,
    });

    if (!result?.uri) return;

    fireVisualShutter();
    await saveShot(result.uri, 'photo');
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
      const result = await cameraRef.current.recordAsync();
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
    setFlash((current) => (current === 'off' ? 'auto' : current === 'auto' ? 'on' : 'off'));
  }, []);

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
          break;
        case 'zoom':
          setZoom((value) => (value < 0.12 ? 0.22 : 0));
          break;
        case 'auto':
          setFlash('off');
          setTimerSeconds(0);
          setZoom(0);
          break;
      }
    },
    [cycleFlash, cycleTimer],
  );

  const wheelStatus = useMemo(() => {
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
        return 'PHOTO';
      case 'zoom':
        return zoom < 0.12 ? 'ZOOM · 2×' : 'ZOOM · 1×';
      case 'auto':
        return 'RESET TO AUTO';
    }
  }, [facing, flash, grid, timerSeconds, wheelSelection, zoom]);

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
          setZoom(Math.max(0, Math.min(1, pinchStartZoom.current + delta)));
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
          wheelSelectionRef.current = null;
          setWheelPoint(point);
          setWheelSelection(null);
          setWheelOpen(true);
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        })
        .onUpdate((event) => {
          const point = wheelPointRef.current;
          const next = actionFromVector(event.x - point.x, event.y - point.y);

          if (next !== wheelSelectionRef.current) {
            wheelSelectionRef.current = next;
            setWheelSelection(next);
            if (next) void Haptics.selectionAsync();
          }
        })
        .onEnd(() => {
          const action = wheelSelectionRef.current;
          applyWheelAction(action);
          setWheelOpen(false);
          setWheelSelection(null);
          wheelSelectionRef.current = null;
        })
        .onFinalize(() => {
          setWheelOpen(false);
        }),
    [applyWheelAction],
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
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing={facing}
            mode={captureMode === 'video' ? 'video' : 'picture'}
            flash={flash}
            zoom={zoom}
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
                {recording ? 'REC' : captureMode.toUpperCase()}
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
              selected={wheelSelection}
              statusText={wheelStatus}
            />
          ) : null}

          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, styles.flashOverlay, { opacity: shutterFlash }]}
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
    ...StyleSheet.absoluteFillObject,
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
    ...StyleSheet.absoluteFillObject,
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
