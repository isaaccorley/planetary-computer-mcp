"use client";

import { useEffect, useRef, useState } from "react";

const EARTH_TEXTURE = "https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-blue-marble.jpg";
const EARTH_BUMP = "https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-topology.png";
const CLOUDS_IMG_URL =
  "https://raw.githubusercontent.com/turban/webgl-earth/master/images/fair_clouds_4k.png";
const LAND_TOPO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json";
const CLOUDS_ALT = 0.004;
const CLOUDS_ROTATION_SPEED = -0.006;

export function SpinningGlobe() {
  const globeRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let removeClouds: (() => void) | null = null;
    let disposeWorld: (() => void) | null = null;
    let mounted = true;

    (async () => {
      if (!globeRef.current) return;
      const [{ default: Globe }, THREE, topojson] = await Promise.all([
        import("globe.gl"),
        import("three"),
        import("topojson-client"),
      ]);

      if (!globeRef.current || !mounted) return;

      const GLOBE_SIZE = 950;

      const world = new Globe(globeRef.current, { animateIn: false })
        .width(GLOBE_SIZE)
        .height(GLOBE_SIZE)
        .backgroundColor("rgba(0,0,0,0)")
        .globeImageUrl(EARTH_TEXTURE)
        .bumpImageUrl(EARTH_BUMP)
        .showAtmosphere(false);

      world.controls().enableZoom = false;
      world.controls().autoRotate = false;
      world.controls().autoRotateSpeed = 0.25;

      const landTopo = await fetch(LAND_TOPO_URL).then((res) => res.json());
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const landPolygons = (topojson.feature(landTopo, landTopo.objects.land) as any).features;
      const {
        MeshLambertMaterial,
        DoubleSide,
        TextureLoader,
        SphereGeometry,
        MeshPhongMaterial,
        Mesh,
      } = THREE;

      world
        .showGraticules(false)
        .polygonsData(landPolygons)
        .polygonCapMaterial(
          new MeshLambertMaterial({ color: "rgba(15,23,42,0.6)", side: DoubleSide }),
        )
        .polygonSideColor(() => "rgba(0,0,0,0)");

      const textureLoader = new TextureLoader();
      textureLoader.load(CLOUDS_IMG_URL, (cloudsTexture: unknown) => {
        const clouds = new Mesh(
          new SphereGeometry(world.getGlobeRadius() * (1 + CLOUDS_ALT), 75, 75),
          new MeshPhongMaterial({ map: cloudsTexture as never, transparent: true }),
        );
        world.scene().add(clouds);

        let animationFrame: number;
        const rotate = () => {
          clouds.rotation.y += (CLOUDS_ROTATION_SPEED * Math.PI) / 180;
          animationFrame = requestAnimationFrame(rotate);
        };
        rotate();

        removeClouds = () => {
          cancelAnimationFrame(animationFrame);
          world.scene().remove(clouds);
        };

        setReady(true);
        world.controls().autoRotate = true;
      });

      disposeWorld = () => {
        world.controls().dispose();
        globeRef.current?.replaceChildren();
      };
    })();

    return () => {
      mounted = false;
      removeClouds?.();
      disposeWorld?.();
    };
  }, []);

  return (
    <div className="globe-container">
      <div
        className={`globe-placeholder transition-opacity duration-700 ${ready ? "opacity-0" : "opacity-100"}`}
      />
      <div
        ref={globeRef}
        className={`globe-canvas transition-opacity duration-700 ${ready ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  );
}
