import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { deleteShot, Shot } from './storage';

type Props = {
  shots: Shot[];
  onClose: () => void;
  onChanged: () => void;
};

const GAP = 2;
const COLUMNS = 3;
const WIDTH = Dimensions.get('window').width;
const TILE = (WIDTH - GAP * (COLUMNS - 1)) / COLUMNS;

export function GalleryScreen({ shots, onClose, onChanged }: Props) {
  const [selected, setSelected] = useState<Shot | null>(null);

  const closeGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX(20)
        .failOffsetY([-40, 40])
        .runOnJS(true)
        .onEnd((event) => {
          if (event.translationX > 80) onClose();
        }),
    [onClose],
  );

  async function removeSelected() {
    if (!selected) return;
    await deleteShot(selected);
    setSelected(null);
    onChanged();
  }

  if (selected) {
    return (
      <GestureDetector gesture={closeGesture}>
        <View style={styles.preview}>
          {selected.kind === 'photo' ? (
            <Image source={{ uri: selected.uri }} style={styles.previewImage} resizeMode="contain" />
          ) : (
            <View style={styles.videoPreview}>
              <Ionicons name="videocam-outline" size={44} color="#fff" />
              <Text style={styles.videoTitle}>VIDEO</Text>
              <Text style={styles.videoMeta}>Stored locally in Shooter</Text>
            </View>
          )}

          <SafeAreaView style={StyleSheet.absoluteFill} pointerEvents="box-none">
            <View style={styles.previewTop}>
              <Pressable onPress={() => setSelected(null)} hitSlop={16} style={styles.iconButton}>
                <Ionicons name="close" size={25} color="#fff" />
              </Pressable>
              <Pressable onPress={removeSelected} hitSlop={16} style={styles.iconButton}>
                <Ionicons name="trash-outline" size={22} color="#fff" />
              </Pressable>
            </View>
          </SafeAreaView>
        </View>
      </GestureDetector>
    );
  }

  return (
    <GestureDetector gesture={closeGesture}>
      <View style={styles.container}>
        <SafeAreaView style={styles.safe}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>SHOTS</Text>
              <Text style={styles.subtitle}>{shots.length} LOCAL</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={16} style={styles.iconButton}>
              <Ionicons name="close" size={25} color="#fff" />
            </Pressable>
          </View>

          {shots.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="images-outline" size={28} color="rgba(255,255,255,0.42)" />
              <Text style={styles.emptyTitle}>NO SHOTS YET</Text>
              <Text style={styles.emptyBody}>
                Swipe right to return to the camera. Your captures stay on this device.
              </Text>
            </View>
          ) : (
            <FlatList
              data={shots}
              keyExtractor={(item) => item.name}
              numColumns={COLUMNS}
              contentContainerStyle={styles.grid}
              columnWrapperStyle={styles.row}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.tile}
                  onPress={() => setSelected(item)}
                >
                  {item.kind === 'photo' ? (
                    <Image source={{ uri: item.uri }} style={StyleSheet.absoluteFillObject} />
                  ) : (
                    <View style={styles.videoTile}>
                      <Ionicons name="videocam" size={24} color="#fff" />
                    </View>
                  )}
                </Pressable>
              )}
            />
          )}
        </SafeAreaView>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050506' },
  safe: { flex: 1 },
  header: {
    height: 88,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: '#fff',
    fontSize: 16,
    letterSpacing: 4,
    fontWeight: '600',
  },
  subtitle: {
    marginTop: 5,
    color: 'rgba(255,255,255,0.42)',
    fontSize: 9,
    letterSpacing: 1.6,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  grid: { paddingBottom: 28 },
  row: { gap: GAP, marginBottom: GAP },
  tile: {
    width: TILE,
    height: TILE * 1.24,
    backgroundColor: '#111',
    overflow: 'hidden',
  },
  videoTile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#141416',
  },
  empty: {
    flex: 1,
    paddingHorizontal: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    marginTop: 18,
    color: '#fff',
    fontSize: 12,
    letterSpacing: 2.2,
    fontWeight: '600',
  },
  emptyBody: {
    marginTop: 10,
    maxWidth: 280,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    lineHeight: 19,
  },
  preview: { flex: 1, backgroundColor: '#000' },
  previewImage: { flex: 1, width: '100%', height: '100%' },
  previewTop: {
    paddingHorizontal: 18,
    paddingTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  videoPreview: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoTitle: {
    marginTop: 14,
    color: '#fff',
    fontSize: 13,
    letterSpacing: 2.2,
    fontWeight: '600',
  },
  videoMeta: {
    marginTop: 7,
    color: 'rgba(255,255,255,0.46)',
    fontSize: 12,
  },
});
