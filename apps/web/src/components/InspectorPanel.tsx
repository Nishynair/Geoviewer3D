import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import type { Diagnostic } from 'spatial-doctor';
import type { GeoJSON as GeoJsonValue } from 'geojson';
import type { SpatialDocument } from '../spatialDocument';
import {
  hasDiagnosticFeatureReference,
  hasDiagnosticSourceLocation,
} from '../utils/diagnosticNavigation';

interface InspectorPanelProps {
  document: SpatialDocument;
  onSelectDiagnostic?: (diagnostic: Diagnostic) => void;
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

function DiagnosticList({
  diagnostics,
  onSelectDiagnostic,
  featureGeoJSON,
  sourceTextLength,
}: {
  diagnostics: Diagnostic[];
  onSelectDiagnostic?: (diagnostic: Diagnostic) => void;
  featureGeoJSON: GeoJsonValue | null;
  sourceTextLength: number;
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
        const hasSource = hasDiagnosticSourceLocation(diagnostic, sourceTextLength);
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

export default function InspectorPanel({ document, onSelectDiagnostic }: InspectorPanelProps) {
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
          sourceTextLength={document.source.rawText.length}
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
        sourceTextLength={document.source.rawText.length}
      />

    </Box>
  );
}
