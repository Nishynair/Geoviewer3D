import { useEffect, useRef, useState } from "react";
import * as Cesium from "cesium";
import { Box, FormControlLabel, Switch } from "@mui/material";
import type { GeoJSON as GeoJsonValue } from "geojson";
import type { SxProps, Theme } from "@mui/material/styles";

interface Viewer3DProps {
  geojson: GeoJsonValue;
  sx?: SxProps<Theme>;
}

interface RotationData {
  center: Cesium.Cartesian3;
  radius: number;
}

export default function Viewer3D({
  geojson,
  sx,
}: Viewer3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const [isRotating, setIsRotating] = useState(true);
  const [rotationData, setRotationData] = useState<RotationData | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    Cesium.Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_TOKEN;

    const viewer = new Cesium.Viewer(container, {
      // imagery: default is Ion/Bing world imagery
      terrain: Cesium.Terrain.fromWorldTerrain({
        requestVertexNormals: true,
      }),
      timeline: false,
      animation: false,
      baseLayerPicker: false,
      homeButton: false,
      sceneModePicker: false,
      selectionIndicator: false,
      infoBox: false,
      fullscreenButton: false,
      shadows: false,
    });
    viewer.scene.globe.enableLighting = true;
    viewerRef.current = viewer;

    // Add OSM Buildings
    (async () => {
      try {
        const osmBuildings = await Cesium.Cesium3DTileset.fromIonAssetId(96188);
        viewer.scene.primitives.add(osmBuildings);
      } catch (error: unknown) {
        console.warn("OSM Buildings not loaded:", error instanceof Error ? error.message : error);
      }
    })();

    // Make the canvas follow its container size
    const ro = new ResizeObserver(() => viewer.resize());
    ro.observe(container);

    return () => {
      ro.disconnect();
      if (!viewer.isDestroyed()) viewer.destroy();
    };
  }, []);


  useEffect(() => {
    const viewer = viewerRef.current;
    if (viewer) {
      // Remove the previously loaded geojson if any
      viewer.dataSources.removeAll();

      Cesium.GeoJsonDataSource.load(geojson, {
        clampToGround: false,
        markerColor: Cesium.Color.RED, // for point features
      }).then((ds) => {
        viewer.dataSources.add(ds);
        viewer.flyTo(ds).then(() => {
          // Compute bounding sphere center & radius
          const positions: Cesium.Cartesian3[] = [];
          const time = Cesium.JulianDate.now();
          ds.entities.values.forEach((entity) => {
            if (entity.position) {
              const position = entity.position.getValue(time);
              if (position) positions.push(position);
            } else if (entity.polygon) {
              const hierarchy = entity.polygon.hierarchy?.getValue(time);
              if (hierarchy) positions.push(...hierarchy.positions);
            } else if (entity.polyline) {
              const points = entity.polyline.positions?.getValue(time);
              if (points) positions.push(...points);
            }
          });

          const boundingSphere = Cesium.BoundingSphere.fromPoints(positions);
          setRotationData({
            center: boundingSphere.center,
            radius: boundingSphere.radius * 2.0,
          });
        });
      });
    }
    
  }, [geojson]);

  // Orbit logic
  useEffect(() => {
    if (!rotationData || !viewerRef.current) return;

    const viewer = viewerRef.current;
    let angle = 0;

    const tickCallback = () => {
      if (!isRotating) return;

      const { center, radius } = rotationData;
      angle += 0.001; // speed
      const x = radius * Math.cos(angle);
      const y = radius * Math.sin(angle);
      const offset = new Cesium.Cartesian3(x, y, radius * 1);

      viewer.camera.lookAtTransform(
        Cesium.Transforms.eastNorthUpToFixedFrame(center)
      );
      viewer.camera.lookAt(center, offset);
    };

    viewer.clock.onTick.addEventListener(tickCallback);

    return () => {
      viewer.clock.onTick.removeEventListener(tickCallback);
      viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY); // restore control
    };
  }, [isRotating, rotationData]);

 return (
    <Box sx={{ position: "relative", height: "100%", ...sx }}>
      <Box
        ref={containerRef}
        sx={{
          width: "100%",
          height: "100%",
          borderRadius: 2,
          overflow: "hidden",
        }}
      />
      <Box
        sx={{
          position: "absolute",
          top: 10,
          left: 10,
        }}
        >
          <FormControlLabel 
            control={<Switch checked={isRotating} />}
            label="Auto-rotate" 
            onChange={()=>setIsRotating(!isRotating)}
          />
      </Box>
    </Box>
  );
}
