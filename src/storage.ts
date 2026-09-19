import { Directory, File, Paths } from 'expo-file-system';

export type ShotKind = 'photo' | 'video';

export type Shot = {
  name: string;
  uri: string;
  kind: ShotKind;
  createdAt: number;
  rawUri?: string;
};

const mediaDirectory = new Directory(Paths.document, 'shooter-media');

function ensureDirectory() {
  if (!mediaDirectory.exists) {
    mediaDirectory.create({ idempotent: true, intermediates: true });
  }
}

function rawCompanionFor(createdAt: number): File {
  return new File(mediaDirectory, `${createdAt}-raw.dng`);
}

function parseShot(file: File): Shot | null {
  const match = /^(\d+)-(photo|video)\.(jpg|mp4)$/i.exec(file.name);
  if (!match) return null;

  const createdAt = Number(match[1]);
  const rawFile = rawCompanionFor(createdAt);

  return {
    name: file.name,
    uri: file.uri,
    kind: match[2] as ShotKind,
    createdAt,
    rawUri: rawFile.exists ? rawFile.uri : undefined,
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

export async function saveCapturedPhoto(
  sourceUri: string,
  rawSourceUri?: string | null,
): Promise<Shot> {
  ensureDirectory();

  const createdAt = Date.now();
  const destination = new File(mediaDirectory, `${createdAt}-photo.jpg`);

  await new File(sourceUri).copy(destination);

  let rawUri: string | undefined;
  if (rawSourceUri && rawSourceUri !== sourceUri) {
    const rawDestination = rawCompanionFor(createdAt);
    await new File(rawSourceUri).copy(rawDestination);
    rawUri = rawDestination.uri;
  }

  return {
    name: destination.name,
    uri: destination.uri,
    kind: 'photo',
    createdAt,
    rawUri,
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

  const rawFile = rawCompanionFor(shot.createdAt);
  if (rawFile.exists) {
    await rawFile.delete();
  }
}
