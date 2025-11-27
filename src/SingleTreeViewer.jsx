import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { createTreeSystem, getGrowthStage } from "./treeSystem.js";

export default function SingleTreeViewer({ growth = 0 }) {
  const containerRef = useRef(null);
  const contextRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    const scene = new THREE.Scene();
    scene.background = null;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setClearColor(0x000000, 0);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    container.appendChild(renderer.domElement);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(5.5, 7, 8);
    camera.lookAt(0, 3, 0);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(6, 10, 6);
    const rimLight = new THREE.DirectionalLight(0x88ccff, 0.6);
    rimLight.position.set(-5, 6, -4);
    scene.add(ambientLight, keyLight, rimLight);

    const treeSystem = createTreeSystem({ scene });
    const {
      createTree,
      switchTreeStage,
      getScaleForGrowth,
      updateTreeLifecycle,
      clearScheduledEffects,
    } = treeSystem;

    const baseHeight = 8;
    const clampedGrowth = Math.max(0, Math.min(100, growth ?? 0));
    const initialStage = getGrowthStage(clampedGrowth);

    const treeData = createTree({
      position: new THREE.Vector3(0, 0, 0),
      height: baseHeight,
      initialStage,
      scale: 0.12,
    });

    treeData.group.userData.growth = clampedGrowth;
    treeData.group.userData.growthState = {
      lastStage: initialStage,
      nextEffectThreshold: Math.floor(clampedGrowth) + 1,
      animation: null,
      initialized: true,
    };

    if (treeData.stage !== initialStage) {
      switchTreeStage(treeData, initialStage);
    }
    treeData.group.scale.setScalar(getScaleForGrowth(clampedGrowth));

    const baseDisc = new THREE.Mesh(
      new THREE.CircleGeometry(6, 48),
      new THREE.MeshStandardMaterial({
        color: 0x2c3e2f,
        metalness: 0,
        roughness: 0.95,
        transparent: true,
        opacity: 0.4,
      })
    );
    baseDisc.rotation.x = -Math.PI / 2;
    baseDisc.position.y = -0.02;
    scene.add(baseDisc);

    const resize = () => {
      const width = container.clientWidth || 320;
      const height = container.clientHeight || Math.round(width * (4 / 3));
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    resize();

    let resizeObserver = null;
    let windowResizeListener = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(container);
    } else {
      windowResizeListener = () => resize();
      window.addEventListener("resize", windowResizeListener);
    }

    const clock = new THREE.Clock();

    contextRef.current = {
      renderer,
      scene,
      camera,
      treeSystem,
      treeData,
      updateTreeLifecycle,
      clearScheduledEffects,
      resizeObserver,
      windowResizeListener,
      baseDisc,
      animationFrame: null,
      clock,
    };

    const animate = () => {
      const elapsedTime = clock.getElapsedTime();
      const nowMs = performance.now();
      updateTreeLifecycle(treeData, {
        growth: treeData.group.userData.growth ?? 0,
        elapsedTime,
        nowMs,
      });
      renderer.render(scene, camera);
      contextRef.current.animationFrame = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (contextRef.current?.animationFrame) {
        cancelAnimationFrame(contextRef.current.animationFrame);
      }
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (windowResizeListener) {
        window.removeEventListener("resize", windowResizeListener);
      }
      clearScheduledEffects(treeData);
      scene.remove(treeData.group);
      scene.remove(baseDisc);
      baseDisc.geometry.dispose();
      baseDisc.material.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      contextRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!contextRef.current) {
      return;
    }

    const { treeData, treeSystem } = contextRef.current;
    const nextGrowth = Math.max(0, Math.min(100, growth ?? 0));
    treeData.group.userData.growth = nextGrowth;

    const state =
      treeData.group.userData.growthState ??
      (treeData.group.userData.growthState = {
        lastStage: getGrowthStage(nextGrowth),
        nextEffectThreshold: Math.floor(nextGrowth) + 1,
        animation: null,
        initialized: true,
      });

    const targetStage = getGrowthStage(nextGrowth);
    if (state.lastStage !== targetStage) {
      contextRef.current.clearScheduledEffects(treeData);
      treeSystem.switchTreeStage(treeData, targetStage);
      state.lastStage = targetStage;
      state.nextEffectThreshold = Math.floor(nextGrowth) + 1;
      state.initialized = true;
    }

    if (nextGrowth < state.nextEffectThreshold - 1) {
      state.nextEffectThreshold = Math.floor(nextGrowth) + 1;
    }
  }, [growth]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        minHeight: 260,
        aspectRatio: "3 / 4",
        position: "relative",
      }}
    />
  );
}
