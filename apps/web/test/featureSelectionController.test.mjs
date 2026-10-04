import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { isValidElement } from 'react';
import { test } from 'vitest';
import { inspectGeoJSON } from '@nish-andran/spatial-doctor';
import InspectorPanel from '../src/components/InspectorPanel.tsx';
import { createSpatialDocument, getGeoJSONForViewer } from '../src/spatialDocument.ts';
import { FEATURE_INDEX_PROPERTY, getFeatureIndexFromProperties } from '../src/utils/diagnosticNavigation.ts';
import { createFeatureSelectionController } from '../src/utils/featureSelectionController.ts';

function makeDocument(rawText = JSON.stringify({
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    id: 'map-picked',
    properties: {},
    geometry: { type: 'Point', coordinates: [101.7, 3.1, 12] },
  }],
})) {
  return createSpatialDocument('map.geojson', rawText, inspectGeoJSON);
}

function createHarness(initialDocument) {
  let document = initialDocument;
  let selection = null;
  let panel = 'editor';
  let requestId = 0;
  const controller = createFeatureSelectionController({
    getDocument: () => document,
    nextRequestId: () => ++requestId,
    setSelection: (next) => { selection = next; },
    setPanel: (next) => { panel = next; },
  });

  return {
    controller,
    get document() { return document; },
    set document(next) { document = next; },
    get selection() { return selection; },
    get panel() { return panel; },
  };
}

function findElementWithActionText(node, text) {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElementWithActionText(child, text);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement(node)) return null;

  if (node.props.children === text && typeof node.props.onClick === 'function') return node;

  const localComponentNames = new Set(['SelectedFeatureDetails', 'DiagnosticList', 'Metric']);
  if (typeof node.type === 'function' && localComponentNames.has(node.type.name)) {
    return findElementWithActionText(node.type(node.props), text);
  }
  return findElementWithActionText(node.props.children, text);
}

test('map Feature index flows through the shared controller into Inspector and its source action', () => {
  const document = makeDocument();
  const harness = createHarness(document);
  const pickedIndex = getFeatureIndexFromProperties(
    { [FEATURE_INDEX_PROPERTY]: 0 },
    FEATURE_INDEX_PROPERTY,
  );

  const selection = harness.controller.selectFeatureFromMap(pickedIndex);
  assert.equal(selection?.featureIndex, 0);
  assert.notEqual(selection?.sourceLocation, null);
  assert.equal(harness.selection, selection);
  assert.equal(harness.panel, 'inspector');

  const inspector = InspectorPanel({
    document,
    selectedFeatureIndex: selection.featureIndex,
    selectedFeatureHasSourceLocation: Boolean(selection.sourceLocation),
    onShowFeatureSource: () => harness.controller.showFeatureSource(selection),
  });
  const sourceAction = findElementWithActionText(inspector, 'Show selected feature in source');

  assert.notEqual(sourceAction, null);
  sourceAction.props.onClick({});
  assert.equal(harness.panel, 'editor');
});

test('a selected Feature stays in Inspector when no structural source span is available', () => {
  const validDocument = makeDocument();
  const documentWithoutSourceSpan = {
    ...validDocument,
    source: { ...validDocument.source, rawText: 'source text with no matching JSON structure' },
  };
  const harness = createHarness(documentWithoutSourceSpan);
  const pickedIndex = getFeatureIndexFromProperties(
    { [FEATURE_INDEX_PROPERTY]: 0 },
    FEATURE_INDEX_PROPERTY,
  );

  const selection = harness.controller.selectFeatureFromMap(pickedIndex);
  assert.equal(selection?.featureIndex, 0);
  assert.equal(selection?.sourceLocation, null);
  assert.equal(harness.panel, 'inspector');

  const inspector = InspectorPanel({
    document: documentWithoutSourceSpan,
    selectedFeatureIndex: selection.featureIndex,
    selectedFeatureHasSourceLocation: Boolean(selection.sourceLocation),
    onShowFeatureSource: () => harness.controller.showFeatureSource(selection),
  });
  const markup = renderToStaticMarkup(inspector);
  assert.match(markup, /Selected feature/);
  assert.match(markup, /No useful source location is available for this feature/);
  assert.doesNotMatch(markup, /Show selected feature in source/);
  assert.equal(findElementWithActionText(inspector, 'Show selected feature in source'), null);
  assert.equal(harness.controller.showFeatureSource(selection), false);
  assert.equal(harness.panel, 'inspector');
});

test('map picks and source actions from a previous document cannot change the current selection', () => {
  const documentA = makeDocument();
  const documentB = makeDocument(JSON.stringify({
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: [2, 1] },
    }],
  }));
  const harness = createHarness(documentA);
  const selection = harness.controller.selectFeatureFromMap(0);
  harness.document = documentB;

  assert.equal(harness.controller.showFeatureSource(selection), false);
  assert.equal(harness.panel, 'inspector');
  assert.equal(harness.controller.selectFeatureFromMap(1), null);
  assert.equal(harness.selection, selection);
});

test('selecting a safe diagnostic reveals its exact coordinate and selects its feature', () => {
  const rawText = JSON.stringify({
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      id: 'route',
      properties: {},
      geometry: { type: 'LineString', coordinates: [[1, 2], [1, 2]] },
    }],
  }, null, 2);
  const document = makeDocument(rawText);
  const harness = createHarness(document);
  const diagnostic = document.report.diagnostics.find(
    ({ code }) => code === 'duplicate-consecutive-position',
  );
  assert.notEqual(diagnostic, undefined);
  const inspector = InspectorPanel({
    document,
    onSelectDiagnostic: (selected) => harness.controller.selectDiagnostic(selected),
  });
  const action = findElementWithActionText(inspector, 'Show feature and source');

  assert.notEqual(action, null);
  action.props.onClick({});

  assert.equal(harness.selection.document, document);
  assert.equal(harness.selection.featureIndex, 0);
  assert.deepEqual(
    JSON.parse(rawText.slice(harness.selection.sourceLocation.start, harness.selection.sourceLocation.end)),
    [1, 2],
  );
  assert.equal(harness.panel, 'editor');
});

test('selecting an out-of-range diagnostic reveals source without selecting an unsafe feature', () => {
  const rawText = JSON.stringify({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        id: 'unsafe',
        properties: {},
        geometry: { type: 'Point', coordinates: [181, 2] },
      },
      {
        type: 'Feature',
        id: 'safe',
        properties: {},
        geometry: { type: 'Point', coordinates: [1, 2] },
      },
    ],
  }, null, 2);
  const document = makeDocument(rawText);
  const harness = createHarness(document);
  const diagnostic = document.report.diagnostics.find(
    ({ code }) => code === 'coordinate-out-of-range',
  );
  assert.notEqual(diagnostic, undefined);
  const inspector = InspectorPanel({
    document,
    onSelectDiagnostic: (selected) => harness.controller.selectDiagnostic(selected),
  });
  const action = findElementWithActionText(inspector, 'Show source');

  assert.notEqual(action, null);
  action.props.onClick({});

  assert.equal(harness.selection.document, document);
  assert.equal(harness.selection.featureIndex, null);
  assert.deepEqual(
    JSON.parse(rawText.slice(harness.selection.sourceLocation.start, harness.selection.sourceLocation.end)),
    [181, 2],
  );
  assert.equal(harness.panel, 'editor');

  const viewerData = getGeoJSONForViewer(document);
  assert.notEqual(viewerData, null);
  assert.equal(viewerData.features[0].geometry, null);
  assert.deepEqual(viewerData.features[1].geometry, document.parsed.features[1].geometry);
  assert.deepEqual(document.parsed.features[0].geometry.coordinates, [181, 2]);
});

test('invalid geometry diagnostics remain source-only and keep the viewer blocked', () => {
  const rawText = JSON.stringify({
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: [[1, 2]] },
  }, null, 2);
  const document = makeDocument(rawText);
  assert.equal(document.report.valid, false);
  assert.equal(document.parsed, null);
  const harness = createHarness(document);
  const inspector = InspectorPanel({
    document,
    onSelectDiagnostic: (selected) => harness.controller.selectDiagnostic(selected),
  });
  const action = findElementWithActionText(inspector, 'Show source');

  assert.notEqual(action, null);
  action.props.onClick({});

  assert.equal(harness.selection.featureIndex, null);
  assert.notEqual(harness.selection.sourceLocation, null);
  assert.equal(harness.panel, 'editor');
  assert.equal(getGeoJSONForViewer(document), null);
});

test('an unclosed ring diagnostic opens its source and never selects or renders the invalid feature', () => {
  const rawText = JSON.stringify({
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      id: 'open-lot',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [4, 0], [4, 4], [0, 4]]] },
    }],
  }, null, 2);
  const document = makeDocument(rawText);
  const diagnostic = document.report.diagnostics.find(
    ({ code }) => code === 'unclosed-polygon-ring',
  );

  assert.equal(document.report.valid, false);
  assert.equal(document.parsed, null);
  assert.equal(getGeoJSONForViewer(document), null);
  assert.notEqual(diagnostic, undefined);
  const ringOnlyDocument = {
    ...document,
    report: { ...document.report, diagnostics: [diagnostic] },
  };
  const harness = createHarness(ringOnlyDocument);
  const inspector = InspectorPanel({
    document: ringOnlyDocument,
    onSelectDiagnostic: (selected) => harness.controller.selectDiagnostic(selected),
  });
  const markup = renderToStaticMarkup(inspector);
  const action = findElementWithActionText(inspector, 'Show source');

  assert.match(markup, /1 finding: 1 error/);
  assert.match(markup, /Unclosed polygon ring/);
  assert.match(markup, /This ring finding uses only positions that could be read safely/);
  assert.match(markup, /This structurally invalid document is not shown on the globe/);
  assert.notEqual(action, null);
  action.props.onClick({});

  assert.equal(harness.selection.diagnostic.code, 'unclosed-polygon-ring');
  assert.equal(harness.selection.featureIndex, null);
  assert.deepEqual(
    JSON.parse(rawText.slice(harness.selection.sourceLocation.start, harness.selection.sourceLocation.end)),
    [0, 4],
  );
  assert.equal(harness.panel, 'editor');
});

test('precision warnings navigate to the valid feature while leaving it viewer eligible', () => {
  const rawText = JSON.stringify({
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      id: 'fine-line',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: [[0.12345678901234566, 10], [12.3456789012345, 20]],
      },
    }],
  }, null, 2);
  const document = makeDocument(rawText);
  const harness = createHarness(document);
  const diagnostic = document.report.diagnostics.find(
    ({ code }) => code === 'excess-coordinate-precision',
  );

  assert.equal(document.report.valid, true);
  assert.notEqual(getGeoJSONForViewer(document), null);
  assert.notEqual(diagnostic, undefined);
  const inspector = InspectorPanel({
    document,
    onSelectDiagnostic: (selected) => harness.controller.selectDiagnostic(selected),
  });
  const markup = renderToStaticMarkup(inspector);
  const action = findElementWithActionText(inspector, 'Show feature and source');

  assert.match(markup, /1 finding: 1 warning/);
  assert.match(markup, /High coordinate precision/);
  assert.match(markup, /does not establish accuracy or recover the original JSON text/);
  assert.match(markup, /numeric precision heuristic above 15 significant digits/);
  assert.notEqual(action, null);
  action.props.onClick({});

  assert.equal(harness.selection.diagnostic.code, 'excess-coordinate-precision');
  assert.equal(harness.selection.featureIndex, 0);
  assert.deepEqual(
    JSON.parse(rawText.slice(harness.selection.sourceLocation.start, harness.selection.sourceLocation.end)),
    [0.12345678901234566, 10],
  );
  assert.deepEqual(getGeoJSONForViewer(document), document.parsed);
  assert.equal(harness.panel, 'editor');
});
