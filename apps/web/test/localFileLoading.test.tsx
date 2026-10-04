import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  dropSpatialFile,
  createLocalFileLoadGuard,
  isSupportedSpatialFileName,
  loadLocalSpatialFile,
  readSpatialFile,
  type LocalSpatialFileCallbacks,
} from '../src/utils/localFileLoading';

class SuccessfulFileReader {
  result: string | ArrayBuffer | null = null;
  error: DOMException | null = null;
  onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
  onerror: ((event: ProgressEvent<FileReader>) => void) | null = null;

  readAsText(file: File) {
    this.result = file.name === 'map.geojson' ? '{"type":"FeatureCollection","features":[]}' : 'file text';
    this.onload?.({ target: this } as unknown as ProgressEvent<FileReader>);
  }
}

class FailedFileReader extends SuccessfulFileReader {
  override readAsText() {
    this.error = new DOMException('File read failed');
    this.onerror?.({ target: this } as unknown as ProgressEvent<FileReader>);
  }
}

class DeferredFileReader {
  static instances: DeferredFileReader[] = [];
  result: string | ArrayBuffer | null = null;
  error: DOMException | null = null;
  onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
  onerror: ((event: ProgressEvent<FileReader>) => void) | null = null;

  readAsText() {
    DeferredFileReader.instances.push(this);
  }

  complete(text: string) {
    this.result = text;
    this.onload?.({ target: this } as unknown as ProgressEvent<FileReader>);
  }

  fail(message: string) {
    this.error = new DOMException(message);
    this.onerror?.({ target: this } as unknown as ProgressEvent<FileReader>);
  }
}

afterEach(() => vi.unstubAllGlobals());

function createCallbacks(): LocalSpatialFileCallbacks {
  return {
    onReading: vi.fn(),
    onFileLoad: vi.fn(),
    onUnsupportedFile: vi.fn(),
    onReadError: vi.fn(),
  };
}

describe('local spatial file loading', () => {
  it('recognizes the supported file extensions case-insensitively', () => {
    expect(isSupportedSpatialFileName('site.geojson')).toBe(true);
    expect(isSupportedSpatialFileName('site.JSON')).toBe(true);
    expect(isSupportedSpatialFileName('site.jsonfg')).toBe(true);
    expect(isSupportedSpatialFileName('site.json-fg')).toBe(true);
    expect(isSupportedSpatialFileName('site.csv')).toBe(false);
  });

  it('reads a selected file in the browser and rejects reader errors', async () => {
    vi.stubGlobal('FileReader', SuccessfulFileReader);
    await expect(readSpatialFile({ name: 'sample.geojson' } as File)).resolves.toBe('file text');

    vi.stubGlobal('FileReader', FailedFileReader);
    await expect(readSpatialFile({ name: 'sample.geojson' } as File)).rejects.toThrow('File read failed');
  });

  it('prevents browser navigation and reads the first supported dropped file', async () => {
    vi.stubGlobal('FileReader', SuccessfulFileReader);
    const callbacks = createCallbacks();
    const event = {
      dataTransfer: { files: [{ name: 'notes.txt' }, { name: 'map.geojson' }] },
      preventDefault: vi.fn(),
    };

    await dropSpatialFile(event as unknown as DragEvent, callbacks);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(callbacks.onReading).toHaveBeenCalledWith('map.geojson');
    expect(callbacks.onFileLoad).toHaveBeenCalledWith('map.geojson', '{"type":"FeatureCollection","features":[]}');
    expect(callbacks.onUnsupportedFile).not.toHaveBeenCalled();
  });

  it('explains when a dropped file type is unsupported', async () => {
    const callbacks = createCallbacks();
    const event = {
      dataTransfer: { files: [{ name: 'notes.txt' }] },
      preventDefault: vi.fn(),
    };

    await dropSpatialFile(event as unknown as DragEvent, callbacks);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(callbacks.onUnsupportedFile).toHaveBeenCalledWith('notes.txt');
    expect(callbacks.onFileLoad).not.toHaveBeenCalled();
    expect(callbacks.onReading).not.toHaveBeenCalled();
  });

  it('reports unsupported selections and file-reader errors without replacing the current document', async () => {
    const callbacks = createCallbacks();
    await loadLocalSpatialFile({ name: 'data.csv' } as File, callbacks);
    expect(callbacks.onUnsupportedFile).toHaveBeenCalledWith('data.csv');
    expect(callbacks.onReading).not.toHaveBeenCalled();

    vi.stubGlobal('FileReader', FailedFileReader);
    await loadLocalSpatialFile({ name: 'broken.geojson' } as File, callbacks);
    expect(callbacks.onReading).toHaveBeenCalledWith('broken.geojson');
    expect(callbacks.onReadError).toHaveBeenCalledWith('broken.geojson');
    expect(callbacks.onFileLoad).not.toHaveBeenCalled();
  });

  it('commits only the latest file when reads finish out of order', async () => {
    DeferredFileReader.instances = [];
    vi.stubGlobal('FileReader', DeferredFileReader);
    const guard = createLocalFileLoadGuard();
    const firstCallbacks = createCallbacks();
    const secondCallbacks = createCallbacks();

    const firstRead = guard.load({ name: 'first.geojson' } as File, firstCallbacks);
    const secondRead = guard.load({ name: 'second.geojson' } as File, secondCallbacks);

    DeferredFileReader.instances[1]?.complete('{"type":"FeatureCollection","features":[]}');
    await secondRead;
    DeferredFileReader.instances[0]?.complete('{"type":"FeatureCollection","features":[]}');
    await firstRead;

    expect(firstCallbacks.onFileLoad).not.toHaveBeenCalled();
    expect(secondCallbacks.onFileLoad).toHaveBeenCalledOnce();
    expect(firstCallbacks.onReadError).not.toHaveBeenCalled();
  });

  it('ignores stale failures after a newer file succeeds', async () => {
    DeferredFileReader.instances = [];
    vi.stubGlobal('FileReader', DeferredFileReader);
    const guard = createLocalFileLoadGuard();
    const firstCallbacks = createCallbacks();
    const secondCallbacks = createCallbacks();

    const firstRead = guard.load({ name: 'first.geojson' } as File, firstCallbacks);
    const secondRead = guard.load({ name: 'second.geojson' } as File, secondCallbacks);

    DeferredFileReader.instances[1]?.complete('{"type":"FeatureCollection","features":[]}');
    await secondRead;
    DeferredFileReader.instances[0]?.fail('late failure');
    await firstRead;

    expect(secondCallbacks.onFileLoad).toHaveBeenCalledOnce();
    expect(firstCallbacks.onReadError).not.toHaveBeenCalled();
  });

  it('ignores a file read invalidated by an edit to the current document', async () => {
    DeferredFileReader.instances = [];
    vi.stubGlobal('FileReader', DeferredFileReader);
    const guard = createLocalFileLoadGuard();
    const callbacks = createCallbacks();
    const pendingRead = guard.load({ name: 'pending.geojson' } as File, callbacks);

    guard.invalidate();
    DeferredFileReader.instances[0]?.complete('{"type":"FeatureCollection","features":[]}');
    await pendingRead;

    expect(callbacks.onReading).toHaveBeenCalledOnce();
    expect(callbacks.onFileLoad).not.toHaveBeenCalled();
    expect(callbacks.onReadError).not.toHaveBeenCalled();
  });
});
