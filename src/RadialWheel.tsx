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
  | 'auto'
  | 'zoom';

type Segment = {
  action: WheelAction;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  angle: number;
};

const SEGMENTS: Segment[] = [
  { action: 'flash', label: 'FLASH', icon: 'flash-outline', angle: 0 },
  { action: 'grid', label: 'GRID', icon: 'grid-outline', angle: 45 },
  { action: 'timer', label: 'TIMER', icon: 'timer-outline', angle: 90 },
  { action: 'flip', label: 'FLIP', icon: 'camera-reverse-outline', angle: 135 },
  { action: 'video', label: 'VIDEO', icon: 'videocam-outline', angle: 180 },
  { action: 'photo', label: 'PHOTO', icon: 'camera-outline', angle: 225 },
  { action: 'auto', label: 'AUTO', icon: 'aperture-outline', angle: 270 },
  { action: 'zoom', label: 'ZOOM', icon: 'search-outline', angle: 315 },
];

export const WHEEL_SEGMENTS = SEGMENTS;

type Props = {
  x: number;
  y: number;
  selected: WheelAction | null;
  statusText?: string;
};

const OUTER = 252;
const INNER = 78;
const ITEM_RADIUS = 96;

export function RadialWheel({ x, y, selected, statusText }: Props) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View
        style={[
          styles.wheel,
          {
            left: x - OUTER / 2,
            top: y - OUTER / 2,
            width: OUTER,
            height: OUTER,
            borderRadius: OUTER / 2,
          },
        ]}
      >
        {SEGMENTS.map((segment) => {
          const radians = (segment.angle * Math.PI) / 180;
          const cx = OUTER / 2 + Math.cos(radians) * ITEM_RADIUS;
          const cy = OUTER / 2 + Math.sin(radians) * ITEM_RADIUS;
          const active = selected === segment.action;

          return (
            <View
              key={segment.action}
              style={[
                styles.item,
                {
                  left: cx - 36,
                  top: cy - 28,
                },
                active && styles.itemActive,
              ]}
            >
              <Ionicons
                name={segment.icon}
                size={20}
                color={active ? '#ffffff' : 'rgba(255,255,255,0.72)'}
              />
              <Text style={[styles.label, active && styles.labelActive]}>
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
          <View style={styles.hubDot} />
        </View>
      </View>

      {statusText ? (
        <View style={[styles.status, { left: x - 90, top: y + OUTER / 2 + 18 }]}>
          <Text style={styles.statusText}>{statusText}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wheel: {
    position: 'absolute',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.28)',
    backgroundColor: 'rgba(10,10,12,0.72)',
    shadowColor: '#000',
    shadowOpacity: 0.38,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 18,
  },
  hub: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.56)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  hubDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.62)',
  },
  item: {
    position: 'absolute',
    width: 72,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  itemActive: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  label: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 8,
    letterSpacing: 1.35,
    fontWeight: '600',
  },
  labelActive: {
    color: '#fff',
  },
  status: {
    position: 'absolute',
    width: 180,
    alignItems: 'center',
  },
  statusText: {
    color: 'rgba(255,255,255,0.76)',
    fontSize: 11,
    letterSpacing: 1.2,
  },
});
