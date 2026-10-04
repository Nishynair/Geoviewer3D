import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import StartingExperience from '../src/components/StartingExperience';

describe('StartingExperience', () => {
  it('shows the local-file action, drop instruction, and observed service disclosure', () => {
    const markup = renderToStaticMarkup(
      <StartingExperience onOpenFile={() => undefined} />,
    );

    expect(markup).toContain('Open or drop a spatial file');
    expect(markup).toContain('Choose a file');
    expect(markup).toContain('Drop a GeoJSON or supported JSON-FG file anywhere in the workspace.');
    expect(markup).toContain('Your file is read and inspected in this browser.');
    expect(markup).toContain('Map requests can reveal the area in view:');
    expect(markup).toContain('Comparing a feature with terrain sends its coordinates to Cesium for terrain sampling.');
    expect(markup).not.toContain('Your data never leaves your device');
  });

  it('shows read progress and file errors without hiding the file action', () => {
    const markup = renderToStaticMarkup(
      <StartingExperience
        onOpenFile={() => undefined}
        isReadingFile
        errorMessage="The selected file could not be read. Choose another file."
      />,
    );

    expect(markup).toContain('Reading your file');
    expect(markup).toContain('The selected file could not be read. Choose another file.');
    expect(markup).toContain('Choose a file');
  });
});
