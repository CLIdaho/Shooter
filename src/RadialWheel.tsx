import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export type WheelAction =
  | 'flash'
  | 'grid'
  | 'timer'
  | 'flip'
  | 'video'
  | 'photo'
  | 'pro'
  | 'zoom';

export type ProWheelAction =
  | 'iso'
  | 'shutter'
  | 'focus'
  | 'wb'
  | 'ev'
  | 'raw'
  | 'lens'
  | 'back'
  | 'auto';

export type WheelLayer = 'root' | 'pro';

export type WheelSegment<T extends string> = {
  action: T;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  angle: number;
};

export const WHEEL_SEGMENTS: WheelSegment<WheelAction>[] = [
  { action: 'flash', label: 'FLASH', icon: 'flash-outline', angle: 0 },
  { action: 'grid', label: 'GRID', icon: 'grid-outline', angle: 45 },
  { action: 'timer', label: 'TIMER', icon: 'timer-outline', angle: 90 },
  { action: 'flip', label: 'FLIP', icon: 'camera-reverse-outline', angle: 135 },
  { action: 'video', label: 'VIDEO', icon: 'videocam-outline', angle: 180 },
  { action: 'photo', label: 'PHOTO', icon: 'camera-outline', angle: 225 },
  { action: 'pro', label: 'PRO', icon: 'options-outline', angle: 270 },
  { action: 'zoom', label: 'ZOOM', icon: 'search-outline', angle: 315 },
];

export const PRO_WHEEL_SEGMENTS: WheelSegment<ProWheelAction>[] = [
  { action: 'iso', label: 'ISO', icon: 'analytics-outline', angle: 0 },
  { action: 'shutter', label: 'SHUTTER', icon: 'time-outline', angle: 40 },
  { action: 'focus', label: 'FOCUS', icon: 'scan-outline', angle: 80 },
  { action: 'wb', label: 'WB', icon: 'thermometer-outline', angle: 120 },
  { action: 'ev', label: 'EV', icon: 'contrast-outline', angle: 160 },
  { action: 'raw', label: 'RAW', icon: 'document-outline', angle: 200 },
  { action: 'lens', label: 'LENS', icon: 'layers-outline', angle: 240 },
  { action: 'back', label: 'BACK', icon: 'chevron-back-outline', angle: 280 },
  { action: 'auto', label: 'AUTO', icon: 'refresh-outline', angle: 320 },
];

type Props = {
  x: number;
  y: number;
  layer: WheelLayer;
  selected: WheelAction | null;
  proSelected?: ProWheelAction | null;
  disabledProActions?: ProWheelAction[];
  statusText?: string;
  adjustmentProgress?: number | null;
};

const OUTER = 270;
const INNER = 76;
const ROOT_RADIUS = 102;
const PRO_RADIUS = 104;

export function RadialWheel({
  x,
  y,
  layer,
  selected,
  proSelected = null,
  disabledProActions = [],
  statusText,
  adjustmentProgress = null,
}: Props) {
  const segments =
    layer === 'pro' ? PRO_WHEEL_SEGMENTS : WHEEL_SEGMENTS;
  const radius = layer === 'pro' ? PRO_RADIUS : ROOT_RADIUS;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View
        style={[
          styles.wheel,
          layer === 'pro' && styles.proWheel,
          {
            left: x - OUTER / 2,
            top: y - OUTER / 2,
            width: OUTER,
            height: OUTER,
            borderRadius: OUTER / 2,
          },
        ]}
      >
        {segments.map((segment) => {
          const radians = (segment.angle * Math.PI) / 180;
          const cx = OUTER / 2 + Math.cos(radians) * radius;
          const cy = OUTER / 2 + Math.sin(radians) * radius;
          const active =
            layer === 'pro'
              ? proSelected === segment.action
              : selected === segment.action;
          const disabled =
            layer === 'pro' &&
            disabledProActions.includes(segment.action as ProWheelAction);

          return (
            <View
              key={segment.action}
              style={[
                styles.item,
                {
                  left: cx - 38,
                  top: cy - 29,
                },
                active && !disabled && styles.itemActive,
                disabled && styles.itemDisabled,
              ]}
            >
              <Ionicons
                name={segment.icon}
                size={19}
                color={
                  disabled
                    ? 'rgba(255,255,255,0.20)'
                    : active
                      ? '#ffffff'
                      : 'rgba(255,255,255,0.70)'
                }
              />
              <Text
                style={[
                  styles.label,
                  active && !disabled && styles.labelActive,
                  disabled && styles.labelDisabled,
                ]}
              >
                {segment.label}
              </Text>
            </View>
          );
        })}

        <View
          style={[
            styles.hub,
            {
              width: INNER,
              height: INNER,
              borderRadius: INNER / 2,
              left: (OUTER - INNER) / 2,
              top: (OUTER - INNER) / 2,
            },
          ]}
        >
          {layer === 'pro' ? (
            <>
              <Text style={styles.hubTitle}>PRO</Text>
              <Text style={styles.hubSub}>DRAG</Text>
            </>
          ) : (
            <View style={styles.hubDot} />
          )}
        </View>
      </View>

      {statusText ? (
        <View style={[styles.status, { left: x - 116, top: y + OUTER / 2 + 16 }]}>
          <Text style={styles.statusText}>{statusText}</Text>
          {adjustmentProgress !== null ? (
            <View style={styles.adjustTrack}>
              <View
                style={[
                  styles.adjustFill,
                  {
                    width: `${Math.round(
                      Math.max(0, Math.min(1, adjustmentProgress)) * 100,
                    )}%`,
                  },
                ]}
              />
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wheel: {
    position: 'absolute',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.26)',
    backgroundColor: 'rgba(8,8,10,0.70)',
    shadowColor: '#000',
    shadowOpacity: 0.40,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 18,
  },
  proWheel: {
    borderColor: 'rgba(255,255,255,0.36)',
    backgroundColor: 'rgba(6,6,8,0.78)',
  },
  hub: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.58)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.19)',
  },
  hubDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.62)',
  },
  hubTitle: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
  },
  hubSub: {
    marginTop: 3,
    color: 'rgba(255,255,255,0.38)',
    fontSize: 6,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  item: {
    position: 'absolute',
    width: 76,
    height: 58,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  itemActive: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.30)',
  },
  itemDisabled: {
    opacity: 0.52,
  },
  label: {
    color: 'rgba(255,255,255,0.60)',
    fontSize: 7.5,
    letterSpacing: 1.18,
    fontWeight: '700',
  },
  labelActive: {
    color: '#fff',
  },
  labelDisabled: {
    color: 'rgba(255,255,255,0.22)',
  },
  status: {
    position: 'absolute',
    width: 232,
    alignItems: 'center',
  },
  statusText: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 10,
    letterSpacing: 1.35,
    fontWeight: '600',
    textAlign: 'center',
  },
  adjustTrack: {
    marginTop: 10,
    width: 154,
    height: 2,
    borderRadius: 1,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  adjustFill: {
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.82)',
  },
});
