import { useEffect, useRef, useState } from "react";
import * as Cesium from "cesium";
import { Box, FormControlLabel, Switch } from "@mui/material";

export default function Viewer3D({
  geojson,
}) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const [isRotating, setIsRotating] = useState(false);
  const [rotationData, setRotationData] = useState(null);
  const [isFlying, setIsFlying] = useState(null);

  useEffect(() => {
    Cesium.Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_TOKEN;

    const viewer = new Cesium.Viewer(containerRef.current, {
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
    viewer.scene.screenSpaceCameraController.minimumZoomDistance = 10.0;
    viewer.scene.screenSpaceCameraController.maximumZoomDistance = 1000.0;
    viewerRef.current = viewer;

    // Add OSM Buildings
    (async () => {
      try {
        const osmBuildings = await Cesium.Cesium3DTileset.fromIonAssetId(96188);
        viewer.scene.primitives.add(osmBuildings);
        await osmBuildings.readyPromise;
      } catch (e) {
        console.warn("OSM Buildings not loaded:", e?.message || e);
      }
    })();

    // Make the canvas follow its container size
    const ro = new ResizeObserver(() => viewer.resize());
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      if (!viewer.isDestroyed()) viewer.destroy();
    };
  }, []);


  useEffect(() => {
    if (viewerRef?.current?.dataSources){

      const viewer = viewerRef.current;
      // Remove the previously loaded geojson if any
      viewer.dataSources.removeAll();

      Cesium.GeoJsonDataSource.load(geojson, {
        clampToGround: false,
        markerColor: Cesium.Color.RED, // for point features
      }).then((ds) => {
        viewer.dataSources.add(ds);

        // Compute bounding sphere center & radius
        const positions = [];
        const time = Cesium.JulianDate.now();
        ds.entities.values.forEach((entity) => {
          if (entity.position) {
            positions.push(entity.position.getValue(time));
          } else if (entity.polygon) {
            const hierarchy = entity.polygon.hierarchy.getValue(time);
            positions.push(...hierarchy.positions);
          } else if (entity.polyline) {
            const pts = entity.polyline.positions.getValue(time);
            positions.push(...pts);
          }
        });
        	
        if (positions.length === 0) return;

        const boundingSphere = Cesium.BoundingSphere.fromPoints(positions);
        setRotationData({
          center: boundingSphere.center,
          radius: boundingSphere.radius * 1.5,
        });

        const carto = Cesium.Cartographic.fromCartesian(boundingSphere.center);
        const destination = Cesium.Cartesian3.fromRadians(
          carto.longitude,
          carto.latitude,
          boundingSphere.radius * 2
        );
        console.log(destination)

        setIsFlying(true)
        return viewer.camera.flyTo({
          destination,
          complete:()=>setIsFlying(false), 
          duration:0
        })
      });
    }
    
  }, [geojson]);

  useEffect(() => {
    if(viewerRef?.current && rotationData?.center && !isFlying){
      const viewer = viewerRef.current;

      const scene = viewer.scene;
      const camera = scene.camera;
      const canvas = viewer.canvas;

      // Disable Cesium default interactions
      const controller = scene.screenSpaceCameraController;
      controller.enableRotate = false;
      controller.enableTranslate = false;
      controller.enableZoom = true;
      controller.enableTilt = false;
      controller.enableLook = false;

      // Compute initial offset (distance, heading, pitch) 	
      const target = rotationData.center;
      let heading = 0.0;
      let pitch = -Cesium.Math.toRadians(30);
      let currentRange = Cesium.Cartesian3.distance(camera.position, target);
      let lastX, lastY;
      let isOrbiting = false;
      
      
      camera.lookAt(target, new Cesium.HeadingPitchRange(heading, pitch, currentRange));

      const handler = new Cesium.ScreenSpaceEventHandler(canvas);

      handler.setInputAction((movement) => {
        isOrbiting = true;
        lastX = movement.position.x;
        lastY = movement.position.y;
      }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

      handler.setInputAction(() => {
        isOrbiting = false;
      }, Cesium.ScreenSpaceEventType.LEFT_UP);

      handler.setInputAction((movement) => {
        if (!isOrbiting) return;

        const deltaX = movement.endPosition.x - lastX;
        const deltaY = movement.endPosition.y - lastY;

        lastX = movement.endPosition.x;
        lastY = movement.endPosition.y;

        const sensitivity = 0.005;

        // Inverted drag for natural orbit
        heading += deltaX * sensitivity;
        pitch -= deltaY * sensitivity;

        pitch = Cesium.Math.clamp(
          pitch,
          -Cesium.Math.toRadians(89),
          -Cesium.Math.toRadians(5)
        );

        camera.lookAt(target, new Cesium.HeadingPitchRange(heading, pitch, currentRange));
      }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

      return () => {
        handler.destroy();
        camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
      };
    }
  }, [rotationData, isFlying]);

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
    <Box sx={{ position: "relative", height: "100%" }}>
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
