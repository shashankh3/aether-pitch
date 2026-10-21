"use client";
// AETHER PITCH — GPU resource disposal helpers.
//
// React 18 StrictMode mounts, unmounts and remounts every component in
// development, and R3F allocates GPU buffers for every THREE geometry and
// material. Anything created imperatively (a `useMemo` that calls
// `new THREE.*`) has to be released explicitly or the scene slowly grows.
//
// These hooks make that a one-liner.

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

/** Anything that owns GPU buffers we need to release. */
export interface Disposable3D {
  dispose?: () => void;
  geometry?: { dispose: () => void } | null;
  material?: { dispose: () => void } | { dispose: () => void }[] | null;
}

/** Release a THREE object's geometry, material and the object itself. */
export function dispose3D(target: Disposable3D | null | undefined): void {
  if (!target) return;
  const geometry = target.geometry;
  if (geometry && typeof geometry.dispose === "function") geometry.dispose();
  const material = target.material;
  if (Array.isArray(material)) {
    material.forEach((m) => m?.dispose?.());
  } else if (material && typeof material.dispose === "function") {
    material.dispose();
  }
  target.dispose?.();
}

/**
 * Create a THREE resource and dispose it when the component unmounts or when
 * the dependencies change.
 *
 * @param factory creates the resource; re-created when `deps` change.
 * @param deps   dependency list for the factory.
 */
export function useDisposable<T extends Disposable3D | null>(
  factory: () => T,
  deps: React.DependencyList = [],
): T {
  const ref = useRef<T | null>(null);
  const key = JSON.stringify(deps);
  const value = useMemo(() => {
    // Release the previous instance before the next one is built.
    dispose3D(ref.current);
    const created = factory();
    ref.current = created;
    return created;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => () => {
    dispose3D(ref.current);
    ref.current = null;
  }, []);
  return value;
}

/**
 * Dispose every resource in a list when the component unmounts.
 */
export function useDisposableList<T extends Disposable3D | null>(items: T[]): void {
  const ref = useRef<T[]>(items);
  ref.current = items;
  useEffect(() => () => {
    ref.current.forEach((item) => dispose3D(item));
    ref.current = [];
  }, []);
}
