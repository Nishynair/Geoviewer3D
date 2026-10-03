import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { isValidElement } from 'react';
import { test } from 'vitest';
import { inspectGeoJSON } from 'spatial-doctor';
import InspectorPanel from '../src/components/InspectorPanel.tsx';
import { createSpatialDocument } from '../src/spatialDocument.ts';
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
