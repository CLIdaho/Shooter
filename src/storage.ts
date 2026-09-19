import { Directory, File, Paths } from 'expo-file-system';

export type ShotKind = 'photo' | 'video';

export type Shot = {
  name: string;
  uri: string;
  kind: ShotKind;
  createdAt: number;
};

const mediaDirectory = new Directory(Paths.document, 'shooter-media');

function ensureDirectory() {
  if (!mediaDirectory.exists) {
    mediaDirectory.create({ idempotent: true, intermediates: true });
  }
}

function parseShot(file: File): Shot | null {
  const match = /^(\d+)-(photo|video)\.(jpg|mp4)$/i.exec(file.name);
  if (!match) return null;

  return {
    name: file.name,
    uri: file.uri,
    kind: match[2] as ShotKind,
    createdAt: Number(match[1]),
  };
}

export async function saveShot(sourceUri: string, kind: ShotKind): Promise<Shot> {
  ensureDirectory();

  const createdAt = Date.now();
  const extension = kind === 'photo' ? 'jpg' : 'mp4';
  const destination = new File(
    mediaDirectory,
    `${createdAt}-${kind}.${extension}`,
  );

  await new File(sourceUri).copy(destination);

  return {
    name: destination.name,
    uri: destination.uri,
    kind,
    createdAt,
  };
}

export function listShots(): Shot[] {
  ensureDirectory();

  return mediaDirectory
    .list()
    .filter((entry): entry is File => entry instanceof File)
    .map(parseShot)
    .filter((shot): shot is Shot => shot !== null)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteShot(shot: Shot): Promise<void> {
  const file = new File(shot.uri);
  if (file.exists) {
    await file.delete();
  }
}
