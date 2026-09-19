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
  | 'lens';

export type ProWheelAction =
  | 'iso'
  | 'shutter'
  | 'focus'
  | 'wb'
  | 'ev'
  | 'raw'
  | 'auto'
  | 'back';

export type WheelLayer = 'root' | 'pro';

export type WheelSegment<T extends string> = {
  action: T;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  angle: number;
};

export const WHEEL_SEGMENTS: WheelSegment<WheelAction>[] = [
  { action: 'flash', label: 'FLASH', icon: 'flash-outline', angle: 0 },
  { action: 'timer', label: 'TIMER', icon: 'timer-outline', angle: 45 },
  { action: 'pro', label: 'PRO', icon: 'options-outline', angle: 90 },
  { action: 'photo', label: 'PHOTO', icon: 'camera-outline', angle: 135 },
  { action: 'video', label: 'VIDEO', icon: 'videocam-outline', angle: 180 },
  { action: 'flip', label: 'FLIP', icon: 'camera-reverse-outline', angle: 225 },
  { action: 'grid', label: 'GRID', icon: 'grid-outline', angle: 270 },
  { action: 'lens', label: 'LENS', icon: 'aperture-outline', angle: 315 },
];

export const PRO_WHEEL_SEGMENTS: WheelSegment<ProWheelAction>[] = [
  { action: 'iso', label: 'ISO', icon: 'analytics-outline', angle: 0 },
  { action: 'shutter', label: 'SHUTTER', icon: 'time-outline', angle: 45 },
  { action: 'focus', label: 'FOCUS', icon: 'scan-outline', angle: 90 },
  { action: 'wb', label: 'WB', icon: 'thermometer-outline', angle: 135 },
  { action: 'ev', label: 'EV', icon: 'contrast-outline', angle: 180 },
  { action: 'raw', label: 'RAW', icon: 'document-outline', angle: 225 },
  { action: 'auto', label: 'AUTO', icon: 'refresh-outline', angle: 270 },
  { action: 'back', label: 'BACK', icon: 'chevron-back-outline', angle: 315 },
];

type StateMap<T extends string> = Partial<Record<T, string>>;

type Props = {
  x: number;
  y: number;
  layer: WheelLayer;
  selected: WheelAction | null;
  proSelected?: ProWheelAction | null;
  disabledRootActions?: WheelAction[];
  disabledProActions?: ProWheelAction[];
  activeRootActions?: WheelAction[];
  activeProActions?: ProWheelAction[];
  rootStateLabels?: StateMap<WheelAction>;
  proStateLabels?: StateMap<ProWheelAction>;
  centerTitle?: string;
  centerSubtitle?: string;
  statusText?: string;
  adjustmentProgress?: number | null;
};

const OUTER = 286;
const INNER = 90;
const ROOT_RADIUS = 108;
const PRO_RADIUS = 109;

export function RadialWheel({
  x,
  y,
  layer,
  selected,
  proSelected = null,
  disabledRootActions = [],
  disabledProActions = [],
  activeRootActions = [],
  activeProActions = [],
  rootStateLabels = {},
  proStateLabels = {},
  centerTitle = 'PHOTO',
  centerSubtitle = 'TAP TO SHOOT',
  statusText,
  adjustmentProgress = null,
}: Props) {
  const segments = layer === 'pro' ? PRO_WHEEL_SEGMENTS : WHEEL_SEGMENTS;
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
        <View style={styles.innerGuide} />

        {segments.map((segment) => {
          const radians = (segment.angle * Math.PI) / 180;
          const cx = OUTER / 2 + Math.cos(radians) * radius;
          const cy = OUTER / 2 + Math.sin(radians) * radius;

          const selectedNow =
            layer === 'pro'
              ? proSelected === segment.action
              : selected === segment.action;

          const persistentActive =
            layer === 'pro'
              ? activeProActions.includes(segment.action as ProWheelAction)
              : activeRootActions.includes(segment.action as WheelAction);

          const disabled =
            layer === 'pro'
              ? disabledProActions.includes(segment.action as ProWheelAction)
              : disabledRootActions.includes(segment.action as WheelAction);

          const stateLabel =
            layer === 'pro'
              ? proStateLabels[segment.action as ProWheelAction]
              : rootStateLabels[segment.action as WheelAction];

          return (
            <View
              key={segment.action}
              style={[
                styles.item,
                {
                  left: cx - 40,
                  top: cy - 31,
                },
                persistentActive && !disabled && styles.itemPersistent,
                selectedNow && !disabled && styles.itemSelected,
                disabled && styles.itemDisabled,
              ]}
            >
              <Ionicons
                name={segment.icon}
                size={20}
                color={
                  disabled
                    ? 'rgba(255,255,255,0.18)'
                    : selectedNow
                      ? '#ffffff'
                      : persistentActive
                        ? 'rgba(255,255,255,0.96)'
                        : 'rgba(255,255,255,0.62)'
                }
              />
              <Text
                style={[
                  styles.label,
                  (selectedNow || persistentActive) &&
                    !disabled &&
                    styles.labelActive,
                  disabled && styles.labelDisabled,
                ]}
              >
                {segment.label}
              </Text>
              {stateLabel ? (
                <Text
                  numberOfLines={1}
                  style={[
                    styles.stateLabel,
                    persistentActive && !disabled && styles.stateLabelActive,
                    disabled && styles.stateLabelDisabled,
                  ]}
                >
                  {stateLabel}
                </Text>
              ) : null}
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
          <Text style={styles.hubTitle}>
            {layer === 'pro' ? 'PRO' : centerTitle}
          </Text>
          <Text style={styles.hubSub}>
            {layer === 'pro' ? 'SLIDE TO SET' : centerSubtitle}
          </Text>
        </View>
      </View>

      {statusText ? (
        <View style={[styles.status, { left: x - 128, top: y + OUTER / 2 + 15 }]}>
          <View style={styles.statusPill}>
            <Text style={styles.statusText}>{statusText}</Text>
          </View>
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
              <View style={styles.adjustCenter} />
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
    borderColor: 'rgba(255,255,255,0.24)',
    backgroundColor: 'rgba(7,8,10,0.74)',
    shadowColor: '#000',
    shadowOpacity: 0.42,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 15 },
    elevation: 20,
  },
  proWheel: {
    borderColor: 'rgba(255,255,255,0.32)',
    backgroundColor: 'rgba(5,6,8,0.82)',
  },
  innerGuide: {
    position: 'absolute',
    left: 66,
    top: 66,
    right: 66,
    bottom: 66,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  hub: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.66)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
  },
  hubTitle: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.7,
  },
  hubSub: {
    marginTop: 4,
    color: 'rgba(255,255,255,0.42)',
    fontSize: 6.2,
    fontWeight: '700',
    letterSpacing: 1.05,
  },
  item: {
    position: 'absolute',
    width: 80,
    height: 62,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  itemPersistent: {
    backgroundColor: 'rgba(255,255,255,0.065)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  itemSelected: {
    backgroundColor: 'rgba(255,255,255,0.17)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.42)',
    transform: [{ scale: 1.04 }],
  },
  itemDisabled: {
    opacity: 0.43,
  },
  label: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 7.3,
    letterSpacing: 1.18,
    fontWeight: '800',
  },
  labelActive: {
    color: '#fff',
  },
  labelDisabled: {
    color: 'rgba(255,255,255,0.20)',
  },
  stateLabel: {
    maxWidth: 70,
    color: 'rgba(255,255,255,0.34)',
    fontSize: 6.1,
    fontWeight: '700',
    letterSpacing: 0.7,
  },
  stateLabelActive: {
    color: 'rgba(255,255,255,0.64)',
  },
  stateLabelDisabled: {
    color: 'rgba(255,255,255,0.16)',
  },
  status: {
    position: 'absolute',
    width: 256,
    alignItems: 'center',
  },
  statusPill: {
    minHeight: 28,
    maxWidth: 248,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(4,5,7,0.72)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  statusText: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 9,
    letterSpacing: 1.05,
    fontWeight: '700',
    textAlign: 'center',
  },
  adjustTrack: {
    position: 'relative',
    marginTop: 10,
    width: 172,
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  adjustFill: {
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.86)',
  },
  adjustCenter: {
    position: 'absolute',
    left: '50%',
    top: 0,
    width: StyleSheet.hairlineWidth,
    height: 3,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
});
