export const SPATIAL_FILE_ACCEPT = '.json,.geojson,.jsonfg,.json-fg';

const SUPPORTED_SPATIAL_FILE_EXTENSION = /\.(?:json|geojson|jsonfg|json-fg)$/i;

export interface LocalSpatialFileCallbacks {
  onReading: (fileName: string) => void;
  onFileLoad: (fileName: string, rawText: string) => void;
  onUnsupportedFile: (fileName: string) => void;
  onReadError: (fileName: string) => void;
}

export interface LocalFileLoadGuard {
  invalidate(): void;
  load(file: File, callbacks: LocalSpatialFileCallbacks): Promise<void>;
  drop(event: Pick<DragEvent, 'dataTransfer' | 'preventDefault'>, callbacks: LocalSpatialFileCallbacks): Promise<void>;
}

export function isSupportedSpatialFileName(fileName: string): boolean {
  return SUPPORTED_SPATIAL_FILE_EXTENSION.test(fileName);
}

export function readSpatialFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('The selected file could not be read as text.'));
      }
    };

    reader.onerror = () => {
      reject(reader.error ?? new Error('The selected file could not be read.'));
    };

    reader.readAsText(file);
  });
}

export async function loadLocalSpatialFile(
  file: File,
  callbacks: LocalSpatialFileCallbacks,
): Promise<void> {
  if (!isSupportedSpatialFileName(file.name)) {
    callbacks.onUnsupportedFile(file.name);
    return;
  }

  callbacks.onReading(file.name);

  try {
    callbacks.onFileLoad(file.name, await readSpatialFile(file));
  } catch {
    callbacks.onReadError(file.name);
  }
}

export async function dropSpatialFile(
  event: Pick<DragEvent, 'dataTransfer' | 'preventDefault'>,
  callbacks: LocalSpatialFileCallbacks,
): Promise<void> {
  const files = Array.from(event.dataTransfer?.files ?? []);
  if (files.length === 0) return;

  event.preventDefault();
  const file = files.find(({ name }) => isSupportedSpatialFileName(name));
  if (!file) {
    callbacks.onUnsupportedFile(files[0].name);
    return;
  }

  await loadLocalSpatialFile(file, callbacks);
}

export function createLocalFileLoadGuard(): LocalFileLoadGuard {
  let generation = 0;

  const guardCallbacks = (
    requestGeneration: number,
    callbacks: LocalSpatialFileCallbacks,
  ): LocalSpatialFileCallbacks => {
    const isCurrent = () => requestGeneration === generation;
    return {
      onReading: (fileName) => {
        if (isCurrent()) callbacks.onReading(fileName);
      },
      onFileLoad: (fileName, rawText) => {
        if (isCurrent()) callbacks.onFileLoad(fileName, rawText);
      },
      onUnsupportedFile: (fileName) => {
        if (isCurrent()) callbacks.onUnsupportedFile(fileName);
      },
      onReadError: (fileName) => {
        if (isCurrent()) callbacks.onReadError(fileName);
      },
    };
  };

  return {
    invalidate() {
      generation += 1;
    },
    load(file, callbacks) {
      generation += 1;
      return loadLocalSpatialFile(file, guardCallbacks(generation, callbacks));
    },
    drop(event, callbacks) {
      if ((event.dataTransfer?.files.length ?? 0) === 0) return Promise.resolve();
      generation += 1;
      return dropSpatialFile(event, guardCallbacks(generation, callbacks));
    },
  };
}
