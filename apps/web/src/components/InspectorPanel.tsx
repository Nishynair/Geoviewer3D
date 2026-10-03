import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import {
  inspectGeoJSON,
  measureGeoJSONGeometry,
  type Diagnostic,
  type DistanceSummary,
} from 'spatial-doctor';
import type { Geometry, GeoJSON as GeoJsonValue } from 'geojson';
import type { SpatialDocument } from '../spatialDocument';
import {
  hasDiagnosticFeatureReference,
  resolveDiagnosticFeatureIndex,
} from '../utils/diagnosticNavigation';
import { getGeoJSONFeature } from '../utils/diagnosticNavigation';
import { resolveDiagnosticSourceLocation } from '../utils/featureSourceLocation';

interface InspectorPanelProps {
  document: SpatialDocument;
  onSelectDiagnostic?: (diagnostic: Diagnostic) => void;
  onShowFeatureSource?: () => void;
  selectedFeatureIndex?: number | null;
  selectedFeatureHasSourceLocation?: boolean;
}

const DIAGNOSTIC_DEFINITIONS: Record<Diagnostic['code'], { title: string; message: string }> = {
  'invalid-geojson': {
    title: 'Invalid GeoJSON',
    message: 'This document does not match the required GeoJSON structure.',
  },
};

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <Box component="div" sx={{ py: 1.25, borderBottom: 1, borderColor: 'divider' }}>
      <Typography component="dt" variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography component="dd" variant="body2" sx={{ m: 0, mt: 0.25, overflowWrap: 'anywhere' }}>
        {value}
      </Typography>
    </Box>
  );
}

function formatDistance(distance: DistanceSummary): string {
  if (distance.totalSegments === 0) return 'No line segments to measure';
  if (distance.meters === null) {
    return `Unavailable (${distance.measuredSegments} of ${distance.totalSegments} segments measured)`;
  }
  if (!distance.complete) {
    return `Partial: ${distance.meters.toFixed(1)} m (${distance.measuredSegments} of ${distance.totalSegments} segments); not a complete total`;
  }
  return `${distance.meters.toFixed(1)} m`;
}

function SelectedGeometryMeasurements({ geometry }: { geometry: Geometry | null }) {
  if (geometry === null) return null;
  const measurement = measureGeoJSONGeometry(geometry);
  if (!measurement) return null;

  return (
    <Box component="section" aria-labelledby="selected-geometry-measurements-heading" sx={{ mt: 1.5 }}>
      <Typography id="selected-geometry-measurements-heading" component="h4" variant="subtitle1">
        Elevation and line measurements
      </Typography>
      <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5 }}>
        Horizontal lengths use a spherical longitude/latitude approximation in meters. Z values use the third ordinate as meters for arithmetic only; no vertical datum is inferred or converted.
      </Typography>
      <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', columnGap: 2, m: 0 }}>
        <Metric
          label="Z statistics (m, third ordinate)"
          value={measurement.zStatistics.measuredCoordinates === 0
            ? 'No Z values'
            : `Min ${measurement.zStatistics.minimum}; max ${measurement.zStatistics.maximum}; mean ${measurement.zStatistics.mean?.toFixed(2)} (${measurement.zStatistics.measuredCoordinates} present, ${measurement.zStatistics.missingCoordinates} missing)`}
        />
        <Metric
          label="2D line length"
          value={measurement.lineProfiles.length === 0
            ? 'Not applicable to this geometry'
            : formatDistance(measurement.horizontalLength)}
        />
        <Metric
          label="3D line length"
          value={measurement.lineProfiles.length === 0
            ? 'Not applicable to this geometry'
            : formatDistance(measurement.threeDimensionalLength)}
        />
      </Box>

      <Typography component="h5" variant="body2" sx={{ mt: 1.5, fontWeight: 600 }}>
        Per-coordinate Z values
      </Typography>
      {measurement.coordinateZ.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          No coordinate tuples.
        </Typography>
      ) : (
        <Box component="ul" aria-label="Per-coordinate Z values" sx={{ listStyle: 'none', p: 0, m: 0, mt: 0.5, maxHeight: 180, overflowY: 'auto' }}>
          {measurement.coordinateZ.map(({ path, z }, index) => (
            <Box component="li" key={`${path.join('.')}-${index}`} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.25 }}>
              <Typography variant="body2">Coordinate {index + 1} · path {path.length > 0 ? path.map((part) => part + 1).join('.') : 'point'}</Typography>
              <Typography variant="body2" color="text.secondary">{z === null ? 'No Z (XY)' : `${z} m`}</Typography>
            </Box>
          ))}
        </Box>
      )}

      <Typography component="h5" variant="body2" sx={{ mt: 1.5, fontWeight: 600 }}>
        Elevation profile
      </Typography>
      {measurement.lineProfiles.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          No supported LineString components; line length and elevation profile are unavailable.
        </Typography>
      ) : (
        measurement.lineProfiles.map((line, lineIndex) => (
          <Box component="section" key={line.path.join('.') || 'root-line'} sx={{ mt: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Line component {lineIndex + 1}{line.path.length > 0 ? ` · path ${line.path.map((part) => part + 1).join('.')}` : ''}
            </Typography>
            <Typography variant="caption" color="text.secondary" component="p" sx={{ my: 0.5 }}>
              2D length: {formatDistance(line.horizontalLength)} · 3D length: {formatDistance(line.threeDimensionalLength)}
            </Typography>
            <Table size="small" aria-label={`Line component ${lineIndex + 1} elevation profile`}>
              <TableHead>
                <TableRow>
                  <TableCell>Vertex</TableCell>
                  <TableCell>Distance along line</TableCell>
                  <TableCell>Z</TableCell>
                  <TableCell>Next segment grade</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {line.coordinates.map((coordinate) => {
                  const nextSegment = line.segments[coordinate.coordinateIndex];
                  const grade = nextSegment?.gradePercent;
                  const gradeLabel = grade === undefined || grade === null
                    ? nextSegment?.horizontalMeters === 0
                      ? 'Unavailable (zero run)'
                      : nextSegment?.verticalChangeMeters === null
                        ? 'Unavailable (missing Z)'
                        : 'Unavailable'
                    : `${grade.toFixed(2)}%`;
                  return (
                    <TableRow key={coordinate.coordinateIndex}>
                      <TableCell>{coordinate.coordinateIndex + 1}</TableCell>
                      <TableCell>{coordinate.distanceAlongMeters === null ? 'Unavailable' : `${coordinate.distanceAlongMeters.toFixed(1)} m`}</TableCell>
                      <TableCell>{coordinate.z === null ? 'No Z' : `${coordinate.z} m`}</TableCell>
                      <TableCell>{nextSegment ? gradeLabel : '—'}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Box>
        ))
      )}
    </Box>
  );
}

function SelectedFeatureDetails({
  document,
  featureIndex,
  hasSourceLocation,
  onSelectDiagnostic,
  onShowFeatureSource,
}: {
  document: SpatialDocument;
  featureIndex: number;
  hasSourceLocation: boolean;
  onSelectDiagnostic?: (diagnostic: Diagnostic) => void;
  onShowFeatureSource?: () => void;
}) {
  if (document.report?.valid !== true || document.parsed === null) return null;
  const feature = getGeoJSONFeature(document.parsed, featureIndex);
  if (!feature) return null;

  const report = inspectGeoJSON(feature);
  const matchingDiagnostics = document.report.diagnostics.filter(
    (diagnostic) => resolveDiagnosticFeatureIndex(document.parsed, diagnostic) === featureIndex,
  );
  const geometryEntries = report.valid
    ? Object.entries(report.summary.geometryCounts).sort(([left], [right]) => left.localeCompare(right))
    : [];
  const geometryType = feature.geometry?.type ?? 'No geometry';

  return (
    <Box component="section" aria-labelledby="selected-feature-heading" sx={{ mb: 2 }}>
      <Typography id="selected-feature-heading" component="h3" variant="subtitle1">
        Selected feature
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Feature {featureIndex + 1} · collection index {featureIndex}
      </Typography>
      <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', columnGap: 2, m: 0 }}>
        <Metric label="Feature ID" value={feature.id === undefined ? 'No ID' : String(feature.id)} />
        <Metric label="Geometry" value={geometryType} />
        {report.valid && (
          <>
            <Metric label="Coordinate tuples" value={report.coordinates.coordinateCount} />
            <Metric label="Dimensions" value={report.coordinates.dimensions} />
            <Metric
              label="Bounds"
              value={report.coordinates.bounds
                ? `X ${report.coordinates.bounds.minX} to ${report.coordinates.bounds.maxX}; Y ${report.coordinates.bounds.minY} to ${report.coordinates.bounds.maxY}`
                : 'No coordinate bounds'}
            />
            <Metric
              label="Z range"
              value={report.coordinates.zRange
                ? `${report.coordinates.zRange.min} to ${report.coordinates.zRange.max}`
                : 'No Z values'}
            />
          </>
        )}
      </Box>
      <SelectedGeometryMeasurements geometry={feature.geometry} />
      {geometryEntries.length > 0 && (
        <Box component="ul" aria-label="Selected feature geometry counts" sx={{ listStyle: 'none', p: 0, m: 0, mt: 1 }}>
          {geometryEntries.map(([geometry, count]) => (
            <Box component="li" key={geometry} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
              <Typography variant="body2">{geometry}</Typography>
              <Typography variant="body2" color="text.secondary">{count}</Typography>
            </Box>
          ))}
        </Box>
      )}
      {!hasSourceLocation && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          No useful source location is available for this feature.
        </Typography>
      )}
      {hasSourceLocation && onShowFeatureSource && (
        <Button size="small" sx={{ mt: 1 }} onClick={onShowFeatureSource}>
          Show selected feature in source
        </Button>
      )}
      <Typography component="h4" variant="body2" sx={{ mt: 1.5, fontWeight: 600 }}>
        Feature diagnostics
      </Typography>
      {matchingDiagnostics.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
          No feature-specific diagnostics in this report.
        </Typography>
      ) : (
        <DiagnosticList
          diagnostics={matchingDiagnostics}
          onSelectDiagnostic={onSelectDiagnostic}
          featureGeoJSON={document.parsed}
          sourceText={document.source.rawText}
        />
      )}
    </Box>
  );
}

function DiagnosticList({
  diagnostics,
  onSelectDiagnostic,
  featureGeoJSON,
  sourceText,
}: {
  diagnostics: Diagnostic[];
  onSelectDiagnostic?: (diagnostic: Diagnostic) => void;
  featureGeoJSON: GeoJsonValue | null;
  sourceText: string;
}) {
  if (diagnostics.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
        No package diagnostics for this document.
      </Typography>
    );
  }

  return (
    <Box component="ul" aria-label="Inspection diagnostics" sx={{ listStyle: 'none', p: 0, m: 0 }}>
      {diagnostics.map((diagnostic, index) => {
        const definition = DIAGNOSTIC_DEFINITIONS[diagnostic.code];
        const hasFeature = hasDiagnosticFeatureReference(diagnostic, featureGeoJSON);
        const hasSource = resolveDiagnosticSourceLocation(sourceText, featureGeoJSON, diagnostic) !== null;
        return (
          <Box component="li" key={`${diagnostic.code}-${index}`} sx={{ mt: 1.5 }}>
            <Alert severity={diagnostic.severity}>
              <Typography component="h3" variant="subtitle1">
                {definition.title}
              </Typography>
              <Typography component="p" variant="body2" sx={{ mb: 0, mt: 0.5 }}>
                {definition.message}
              </Typography>
              <Typography component="code" variant="caption" sx={{ display: 'block', mt: 0.75 }}>
                {diagnostic.code} · {diagnostic.severity}
              </Typography>
              {onSelectDiagnostic && (hasFeature || hasSource) && (
                <Button
                  size="small"
                  sx={{ mt: 1 }}
                  onClick={() => onSelectDiagnostic(diagnostic)}
                >
                  {hasSource
                    ? hasFeature
                      ? 'Show feature and source'
                      : 'Show source'
                    : 'Show feature'}
                </Button>
              )}
            </Alert>
          </Box>
        );
      })}
    </Box>
  );
}

export default function InspectorPanel({
  document,
  onSelectDiagnostic,
  onShowFeatureSource,
  selectedFeatureIndex = null,
  selectedFeatureHasSourceLocation = false,
}: InspectorPanelProps) {
  if (document.parseError?.kind === 'json-syntax') {
    return (
      <Box component="section" aria-labelledby="inspector-heading" sx={{ height: '100%', overflowY: 'auto', p: 2 }}>
        <Typography id="inspector-heading" component="h2" variant="h6" sx={{ mb: 0.5 }}>
          Dataset overview
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, overflowWrap: 'anywhere' }}>
          {document.source.name}
        </Typography>
        <Alert severity="error">
          <Typography component="h3" variant="subtitle1">
            JSON syntax error
          </Typography>
          <Typography component="p" variant="body2" sx={{ mb: 0, mt: 0.5 }}>
            The source text could not be parsed as JSON. Correct the JSON text to see a GeoJSON overview.
          </Typography>
        </Alert>
      </Box>
    );
  }

  if (document.report?.valid === false) {
    return (
      <Box component="section" aria-labelledby="inspector-heading" sx={{ height: '100%', overflowY: 'auto', p: 2 }}>
        <Typography id="inspector-heading" component="h2" variant="h6" sx={{ mb: 0.5 }}>
          Dataset overview
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, overflowWrap: 'anywhere' }}>
          {document.source.name}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          The current document is not valid GeoJSON, so its summary metrics are unavailable.
        </Typography>
        <DiagnosticList
          diagnostics={document.report.diagnostics}
          onSelectDiagnostic={onSelectDiagnostic}
          featureGeoJSON={null}
          sourceText={document.source.rawText}
        />
      </Box>
    );
  }

  if (!document.report?.valid) return null;

  const { summary, coordinates } = document.report;
  const geometryEntries = Object.entries(summary.geometryCounts).sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
  const dimensionLabel = coordinates.dimensions === 'mixed'
    ? 'Mixed XY/XYZ'
    : coordinates.dimensions === 'empty'
      ? 'Empty'
      : coordinates.dimensions;

  return (
    <Box component="section" aria-labelledby="inspector-heading" sx={{ height: '100%', overflowY: 'auto', p: 2 }}>
      <Typography id="inspector-heading" component="h2" variant="h6" sx={{ mb: 0.5 }}>
        Dataset overview
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, overflowWrap: 'anywhere' }}>
        {document.source.name}
      </Typography>

      {selectedFeatureIndex !== null && (
        <SelectedFeatureDetails
          document={document}
          featureIndex={selectedFeatureIndex}
          hasSourceLocation={selectedFeatureHasSourceLocation}
          onSelectDiagnostic={onSelectDiagnostic}
          onShowFeatureSource={onShowFeatureSource}
        />
      )}

      {coordinates.dimensions === 'mixed' && (
        <Alert severity="warning" sx={{ mb: 1.5 }}>
          This valid document contains both XY and XYZ coordinate tuples.
        </Alert>
      )}

      <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', columnGap: 2, m: 0 }}>
        <Metric label="Feature count" value={summary.featureCount} />
        <Metric label="Dimensions" value={dimensionLabel} />
        <Metric label="Coordinate tuples" value={coordinates.coordinateCount} />
        <Metric
          label="Bounds"
          value={coordinates.bounds
            ? `X ${coordinates.bounds.minX} to ${coordinates.bounds.maxX}; Y ${coordinates.bounds.minY} to ${coordinates.bounds.maxY}`
            : 'No coordinate bounds'}
        />
        <Metric
          label="Z range"
          value={coordinates.zRange
            ? `${coordinates.zRange.min} to ${coordinates.zRange.max}`
            : 'No Z values'}
        />
      </Box>

      <Box component="section" aria-labelledby="geometry-distribution-heading" sx={{ mt: 2 }}>
        <Typography id="geometry-distribution-heading" component="h3" variant="subtitle1">
          Geometry distribution
        </Typography>
        {geometryEntries.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
            No geometries in this document.
          </Typography>
        ) : (
          <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
            {geometryEntries.map(([geometryType, count]) => (
              <Box component="li" key={geometryType} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.75 }}>
                <Typography variant="body2">{geometryType}</Typography>
                <Typography variant="body2" color="text.secondary">{count}</Typography>
              </Box>
            ))}
          </Box>
        )}
      </Box>

      <DiagnosticList
        diagnostics={document.report.diagnostics}
        onSelectDiagnostic={onSelectDiagnostic}
        featureGeoJSON={document.parsed}
        sourceText={document.source.rawText}
      />

    </Box>
  );
}
