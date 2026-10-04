import './App.css'
import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent as ReactDragEvent } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { TEXT_BOX_MIN_WIDTH, TEXT_BOX_MAX_WIDTH } from './consts';
import GeojsonEditor from './components/GeojsonEditor';
import KlccFlat from './assets/sampleJSON/klcc-flat.json';
import Viewer3D from './components/Viewer';
import MenuBar from './components/MenuBar';
import MinimizeMaximizeButton from './components/Buttons/MinimizeMaximizeButton';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import { inspectGeoJSON, measureGeoJSONGeometry } from '@nish-andran/spatial-doctor';
import type { Diagnostic } from '@nish-andran/spatial-doctor';
import type { GeoJSON as GeoJsonValue } from 'geojson';
import InspectorPanel from './components/InspectorPanel';
import StartingExperience from './components/StartingExperience';
import SnackbarAlert from './components/SnackbarAlert';
import {
  createLocalFileLoadGuard,
  SPATIAL_FILE_ACCEPT,
  type LocalSpatialFileCallbacks,
} from './utils/localFileLoading';
import {
  createSpatialDocument,
  getGeoJSONForViewer,
  type SpatialDocument,
} from './spatialDocument';
import { getGeoJSONFeature } from './utils/diagnosticNavigation';
import {
  createFeatureSelectionController,
  type WorkspaceSelection,
} from './utils/featureSelectionController';
import type {
  TerrainComparisonRequest,
  TerrainComparisonResult,
} from './utils/terrainComparison';
import {
  applyRepairPreview,
  previewGeoJSONRepair,
  undoAppliedRepair,
  type AppliedGeoJSONRepair,
  type GeoJSONRepairKind,
  type GeoJSONRepairPreview,
} from './utils/geoJsonRepairs';
import { createEditorTextChangeHandler } from './utils/editorChangeGuard';

interface TerrainComparisonDisplay {
  geojson: GeoJsonValue;
  featureIndex: number;
  result: TerrainComparisonResult;
}

function App() {
  const [document, setDocument] = useState<SpatialDocument>(() =>
    createSpatialDocument('klcc-flat.json', JSON.stringify(KlccFlat, null, 2), inspectGeoJSON),
  );
  const [viewerDocument, setViewerDocument] = useState(document);
  const [selection, setSelection] = useState<WorkspaceSelection | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const selectionSequence = useRef(0);
  const theme = useTheme();
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('md'));
  const [expanded, setExpanded] = useState(false);
  const [rightPanel, setRightPanel] = useState<'editor' | 'inspector'>('inspector');
  const [hasStartedWorkspace, setHasStartedWorkspace] = useState(false);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [fileReadError, setFileReadError] = useState<string | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const localFileLoadGuardRef = useRef(createLocalFileLoadGuard());
  const [terrainRequest, setTerrainRequest] = useState<TerrainComparisonRequest | null>(null);
  const [terrainResult, setTerrainResult] = useState<TerrainComparisonDisplay | null>(null);
  const [repairPreview, setRepairPreview] = useState<GeoJSONRepairPreview | null>(null);
  const [appliedRepair, setAppliedRepair] = useState<AppliedGeoJSONRepair | null>(null);
  const currentSourceTextRef = useRef(document.source.rawText);
  currentSourceTextRef.current = document.source.rawText;
  const activeSelection = selection?.document === document ? selection : null;
  const featureSelectionController = createFeatureSelectionController({
    getDocument: () => document,
    nextRequestId: () => {
      selectionSequence.current += 1;
      return selectionSequence.current;
    },
    setSelection,
    setPanel: setRightPanel,
  });

  const handleSelectDiagnostic = (diagnostic: Diagnostic) => {
    featureSelectionController.selectDiagnostic(diagnostic);
  };

  const handleFeatureSelect = (featureIndex: number) => {
    featureSelectionController.selectFeatureFromMap(featureIndex);
  };

  const handleCompareTerrain = () => {
    if (
      document.report?.valid !== true ||
      document.parsed === null ||
      !activeSelection ||
      activeSelection.featureIndex === null
    ) return;
    const feature = getGeoJSONFeature(document.parsed, activeSelection.featureIndex);
    const measurement = feature?.geometry === null || !feature?.geometry
      ? null
      : measureGeoJSONGeometry(feature.geometry);
    selectionSequence.current += 1;
    const request: TerrainComparisonRequest = {
      requestId: selectionSequence.current,
      geojson: document.parsed,
      featureIndex: activeSelection.featureIndex,
      coordinates: measurement?.coordinateZ.map(({ path, longitude, latitude, z }) => ({
        path,
        longitude,
        latitude,
        sourceZ: z,
      })) ?? [],
    };
    setTerrainResult(null);
    setTerrainRequest(request);
  };

  const handleTerrainComparisonResult = (
    requestId: number,
    result: TerrainComparisonResult,
  ) => {
    if (
      !terrainRequest ||
      terrainRequest.requestId !== requestId ||
      terrainRequest.geojson !== document.parsed ||
      terrainRequest.featureIndex !== activeSelection?.featureIndex
    ) {
      return;
    }
    setTerrainResult({
      geojson: terrainRequest.geojson,
      featureIndex: terrainRequest.featureIndex,
      result,
    });
    setTerrainRequest(null);
  };

  useEffect(() => {
    const timeout = window.setTimeout(() => setViewerDocument(document), 1000);
    return () => window.clearTimeout(timeout);
  }, [document]);

  useEffect(() => {
    setTerrainRequest(null);
    setTerrainResult(null);
  }, [document, activeSelection?.featureIndex]);

  const terrainRequestForViewer = terrainRequest
    && viewerDocument === document
    && document.parsed === terrainRequest.geojson
    && activeSelection?.featureIndex === terrainRequest.featureIndex
    ? terrainRequest
    : null;
  const terrainResultForInspector = terrainResult
    && terrainResult.geojson === document.parsed
    && terrainResult.featureIndex === activeSelection?.featureIndex
    ? terrainResult.result
    : null;

  const handleTextChange = createEditorTextChangeHandler(
    () => currentSourceTextRef.current,
    (rawText) => {
      invalidatePendingFileRead();
      setHasStartedWorkspace(true);
      // The separate Monaco subscription also receives @monaco-editor/react's
      // controlled executeEdits update after Apply/Undo. Ignore that echo so it
      // cannot discard the undo snapshot for a repair.
      setRepairPreview(null);
      setAppliedRepair(null);
      setDocument((currentDocument) =>
        createSpatialDocument(currentDocument.source.name, rawText, inspectGeoJSON),
      );
    },
  );

  const invalidatePendingFileRead = () => {
    localFileLoadGuardRef.current.invalidate();
    setIsReadingFile(false);
    setFileReadError(null);
  };

  const handleFileLoad = (name: string, rawText: string) => {
    invalidatePendingFileRead();
    setHasStartedWorkspace(true);
    setSelection(null);
    setRightPanel('inspector');
    setRepairPreview(null);
    setAppliedRepair(null);
    setDocument(createSpatialDocument(name, rawText, inspectGeoJSON));
  };

  const handleLocalFileLoad = (name: string, rawText: string) => {
    setIsReadingFile(false);
    setFileReadError(null);
    setSelection(null);
    setRightPanel('inspector');
    handleFileLoad(name, rawText);
  };

  const fileCallbacks: LocalSpatialFileCallbacks = {
    onReading: () => {
      setIsReadingFile(true);
      setFileReadError(null);
    },
    onFileLoad: handleLocalFileLoad,
    onUnsupportedFile: (fileName) => {
      setIsReadingFile(false);
      setFileReadError(`“${fileName}” is not a supported spatial file. Choose or drop a .geojson, .json, .jsonfg, or .json-fg file.`);
    },
    onReadError: (fileName) => {
      setIsReadingFile(false);
      setFileReadError(`Could not read “${fileName}”. Choose another file.`);
    },
  };

  const handleLocalFileSelected = (file: File) => {
    void localFileLoadGuardRef.current.load(file, fileCallbacks);
  };

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (file) handleLocalFileSelected(file);
  };

  const openFilePicker = () => fileInputRef.current?.click();

  const handleFileDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!Array.from(event.dataTransfer.types).includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setIsDraggingFile(true);
  };

  const handleFileDragLeave = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!Array.from(event.dataTransfer.types).includes('Files')) return;
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    setIsDraggingFile(false);
  };

  const handleFileDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    setIsDraggingFile(false);
    void localFileLoadGuardRef.current.drop(event.nativeEvent, fileCallbacks);
  };

  const handlePreviewRepair = (kind: GeoJSONRepairKind) => {
    setRepairPreview(previewGeoJSONRepair(document.source, kind));
  };

  const handleApplyRepair = () => {
    if (!repairPreview) return;
    invalidatePendingFileRead();
    const applied = applyRepairPreview(document.source, repairPreview);
    if (!applied) {
      setRepairPreview(null);
      return;
    }

    setAppliedRepair(applied);
    setRepairPreview(null);
    setSelection(null);
    setDocument(createSpatialDocument(applied.current.name, applied.current.rawText, inspectGeoJSON));
  };

  const handleUndoRepair = () => {
    if (!appliedRepair) return;
    invalidatePendingFileRead();
    const previous = undoAppliedRepair(document.source, appliedRepair);
    if (!previous) {
      setAppliedRepair(null);
      return;
    }

    setAppliedRepair(null);
    setRepairPreview(null);
    setSelection(null);
    setDocument(createSpatialDocument(previous.name, previous.rawText, inspectGeoJSON));
  };

  const visibleRepairPreview = repairPreview
    && repairPreview.source.name === document.source.name
    && repairPreview.source.rawText === document.source.rawText
    ? repairPreview
    : null;
  const canUndoRepair = appliedRepair?.current.name === document.source.name
    && appliedRepair.current.rawText === document.source.rawText;

  return (
    <Box
      component="main"
      onDragOver={handleFileDragOver}
      onDragLeave={handleFileDragLeave}
      onDrop={handleFileDrop}
      sx={{
        position: 'relative',
        display: "flex",
        flexDirection: "column",
        width: "100%",
        minWidth: 0,
        minHeight: "100%",
      }}
    >
      <MenuBar
        document={document}
        onFileLoad={handleFileLoad}
        onOpenFile={openFilePicker}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept={SPATIAL_FILE_ACCEPT}
        aria-hidden="true"
        tabIndex={-1}
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
      />

      {!hasStartedWorkspace && (
        <StartingExperience
          onOpenFile={openFilePicker}
          isReadingFile={isReadingFile}
          errorMessage={fileReadError}
        />
      )}
      {hasStartedWorkspace && fileReadError && (
        <SnackbarAlert key={fileReadError} message={fileReadError} severity="error" />
      )}
      {hasStartedWorkspace && isReadingFile && (
        <SnackbarAlert message="Reading your file…" severity="info" />
      )}

      <Box
        sx={{
          display: "grid",
          flex: 1,
          transition: "all 0.3s ease",
          gridTemplateColumns: isSmallScreen
            ? "1fr"
            : expanded
              ? "1fr 0fr"
              : `minmax(0, 1fr) clamp(${TEXT_BOX_MIN_WIDTH}, 40vw, ${TEXT_BOX_MAX_WIDTH})`,
          gridTemplateRows: isSmallScreen
            ? expanded
              ? "1fr 0fr"
              : "minmax(0, 0.55fr) minmax(0, 0.45fr)"
            : "minmax(0, 1fr)",
          gap: 1,
          padding: 1,
          overflow: "hidden",
        }}
      >
        {/* LEFT: 3D Viewer */}
        <Box
          sx={{
            position: "relative",
            minWidth: 0,
            minHeight: { xs: "45vh", md: 0 },
            borderRadius: 2,
            overflow: "hidden",
          }}
        >
          <MinimizeMaximizeButton expanded={expanded} setExpanded={setExpanded} isSmallScreen={isSmallScreen}/>
          
          <Viewer3D
            geojson={getGeoJSONForViewer(viewerDocument)}
            selectedFeatureIndex={viewerDocument === document
              ? activeSelection?.featureIndex ?? null
              : null}
            navigationRequestId={viewerDocument === document
              ? activeSelection?.requestId ?? 0
              : 0}
            onFeatureSelect={viewerDocument === document ? handleFeatureSelect : undefined}
            terrainComparisonRequest={terrainRequestForViewer}
            onTerrainComparisonResult={handleTerrainComparisonResult}
            sx={{
              width: "100%",
              height: "100%",
            }}
          />
        </Box>

        {/* RIGHT: GeoJSON Editor */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
            height: "100%",
            borderRadius: 2,
            overflow: "hidden",
            bgcolor: theme.palette.background.default,
            visibility: expanded ? "hidden" : "visible",
            pointerEvents: expanded ? "none" : "auto",
          }}
        >
          <Tabs
            value={rightPanel}
            onChange={(_event, value: 'editor' | 'inspector') => setRightPanel(value)}
            aria-label="Document workspace"
            sx={{ flex: '0 0 auto', minHeight: 42 }}
          >
            <Tab label="Editor" value="editor" id="workspace-tab-editor" aria-controls="workspace-panel-editor" />
            <Tab label="Inspector" value="inspector" id="workspace-tab-inspector" aria-controls="workspace-panel-inspector" />
          </Tabs>
          <Box
            role="tabpanel"
            id="workspace-panel-editor"
            aria-labelledby="workspace-tab-editor"
            hidden={rightPanel !== 'editor'}
            sx={{ flex: '1 1 auto', minHeight: 0, overflow: 'hidden', display: rightPanel === 'editor' ? 'block' : 'none' }}
          >
            <GeojsonEditor
              document={document}
              onTextChange={handleTextChange}
              isCompact={isSmallScreen}
              sourceLocation={activeSelection?.sourceLocation ?? null}
              sourceLocationRequestId={activeSelection?.requestId ?? 0}
            />
          </Box>
          <Box
            role="tabpanel"
            id="workspace-panel-inspector"
            aria-labelledby="workspace-tab-inspector"
            hidden={rightPanel !== 'inspector'}
            sx={{ flex: '1 1 auto', minHeight: 0, overflow: 'hidden', display: rightPanel === 'inspector' ? 'block' : 'none' }}
          >
            <InspectorPanel
              document={document}
              repairPreview={visibleRepairPreview}
              canUndoRepair={canUndoRepair}
              onPreviewRepair={document.format === 'geojson' ? handlePreviewRepair : undefined}
              onApplyRepair={document.format === 'geojson' ? handleApplyRepair : undefined}
              onUndoRepair={document.format === 'geojson' ? handleUndoRepair : undefined}
              onSelectDiagnostic={handleSelectDiagnostic}
              onShowFeatureSource={() => featureSelectionController.showFeatureSource(activeSelection)}
              selectedFeatureIndex={activeSelection?.featureIndex ?? null}
              selectedFeatureHasSourceLocation={Boolean(activeSelection?.sourceLocation)}
              onCompareTerrain={activeSelection ? handleCompareTerrain : undefined}
              terrainComparisonPending={terrainRequestForViewer !== null}
              terrainComparison={terrainResultForInspector}
            />
          </Box>
        </Box>
      </Box>

      {isDraggingFile && (
        <Box
          role="status"
          aria-live="polite"
          sx={{
            position: 'absolute',
            inset: 8,
            zIndex: 1500,
            display: 'grid',
            placeItems: 'center',
            border: '3px dashed',
            borderColor: 'primary.main',
            borderRadius: 2,
            bgcolor: 'rgba(10, 25, 41, 0.82)',
            pointerEvents: 'none',
            textAlign: 'center',
            p: 2,
          }}
        >
          <Box>
            <Typography component="p" variant="h5" sx={{ color: 'common.white', mb: 0.5 }}>
              Drop to inspect
            </Typography>
            <Typography component="p" variant="body2" sx={{ color: 'common.white' }}>
              GeoJSON or supported JSON-FG files
            </Typography>
          </Box>
        </Box>
      )}
    </Box>
  );
}

export default App
