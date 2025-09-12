import React, { useRef, useEffect, useState, useCallback } from "react";
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Popover,
  Button,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

// Dummy Node generator (keeps object identity for in-place updates)
const generateNodes = (count = 12) => {
  const nodes = [];
  for (let i = 1; i <= count; i++) {
    nodes.push({
      id: i,
      name: `Node-${i}`,
      status: Math.random() > 0.2 ? "online" : "offline",
      phi: Math.random() * Math.PI,
      theta: Math.random() * 2 * Math.PI,
      lastSeen: new Date(Date.now() - Math.floor(Math.random() * 1000 * 60 * 60)).toISOString(),
      details: {
        cpu: `${Math.round(Math.random() * 80 + 10)}%`,
        mem: `${Math.round(Math.random() * 70 + 10)}%`,
        version: `v${Math.floor(Math.random() * 3) + 1}.${Math.floor(Math.random() * 10)}`,
      },
    });
  }
  return nodes;
};

// Dummy Alerts generator
const generateAlert = () => {
  const types = ["error", "warning", "info"];
  const messages = [
    "CPU usage high",
    "Memory spike detected",
    "Node disconnected",
    "New update available",
    "No recent errors",
  ];
  const type = types[Math.floor(Math.random() * types.length)];
  const msg = messages[Math.floor(Math.random() * messages.length)];
  return { type, msg, ts: new Date().toISOString() };
};

function RightSidebar() {
  const mountRef = useRef(null);

  // React-visible state (for UI lists)
  const [nodes, setNodes] = useState(generateNodes());
  const [alerts, setAlerts] = useState([{ type: "info", msg: "⚠️ No recent errors", ts: new Date().toISOString() }]);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedAnchorPos, setSelectedAnchorPos] = useState(null); // {left, top}

  // Mutable refs used by Three.js loop (avoid recreating scene on every nodes change)
  const nodesRef = useRef(nodes);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const instancedRef = useRef(null); // InstancedMesh reference
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const lastHoveredId = useRef(null);
  const isVisibleRef = useRef(true); // track document visibility / intersection

  // Keep nodesRef in sync when React state changes (we'll update nodesRef inside simulation instead)
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  // Helper: compute screen position from instance index
  const computeScreenPosForInstance = useCallback((index) => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const instanced = instancedRef.current;
    if (!renderer || !camera || !instanced) return null;
    const tempMat = new THREE.Matrix4();
    instanced.getMatrixAt(index, tempMat);
    const pos = new THREE.Vector3().setFromMatrixPosition(tempMat);
    pos.project(camera);
    const clientRect = renderer.domElement.getBoundingClientRect();
    const x = (pos.x + 1) / 2 * clientRect.width + clientRect.left;
    const y = (-pos.y + 1) / 2 * clientRect.height + clientRect.top;
    return { left: Math.round(x), top: Math.round(y) };
  }, []);

  // Create or recreate instanced mesh (with color fallback)
  const createInstancedMesh = useCallback((count) => {
    const scene = sceneRef.current;
    if (!scene) return null;

    // Dispose previous if exists
    if (instancedRef.current) {
      try {
        scene.remove(instancedRef.current);
        if (instancedRef.current.geometry) instancedRef.current.geometry.dispose();
        if (instancedRef.current.material) instancedRef.current.material.dispose();
      } catch (err) {
        // ignore disposal errors
      }
      instancedRef.current = null;
    }

    const nodeGeometry = new THREE.SphereGeometry(3.2, 12, 12);
    const nodeMaterial = new THREE.MeshBasicMaterial({ vertexColors: true }); // prefer vertex colors for setColorAt
    const instancedMesh = new THREE.InstancedMesh(nodeGeometry, nodeMaterial, Math.max(1, count));
    instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    // Ensure instanceColor exists as InstancedBufferAttribute (fallback)
    try {
      // new three builds support setColorAt; we'll still create instanceColor for reliability
      const colorArray = new Float32Array(instancedMesh.count * 3);
      const instanceColorAttr = new THREE.InstancedBufferAttribute(colorArray, 3);
      instancedMesh.instanceColor = instanceColorAttr;
    } catch (err) {
      // ignore if cannot create
    }

    scene.add(instancedMesh);
    instancedRef.current = instancedMesh;
    return instancedMesh;
  }, []);

  // Initialize Three.js scene once on mount
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth || 220;
    const height = 200;

    // scene / camera / renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0b1827");
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.z = 200;
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(width, height);
    renderer.setClearColor(0x0b1827, 0); // transparent bg
    rendererRef.current = renderer;

    mount.appendChild(renderer.domElement);

    // controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controlsRef.current = controls;

    // globe
    const globeGeometry = new THREE.SphereGeometry(50, 32, 32);
    const globeMaterial = new THREE.MeshBasicMaterial({
      color: 0x38c0fc,
      wireframe: true,
      opacity: 0.22,
      transparent: true,
    });
    const globe = new THREE.Mesh(globeGeometry, globeMaterial);
    scene.add(globe);

    // create instanced mesh initially
    const initialCount = nodesRef.current.length;
    const instancedMesh = createInstancedMesh(initialCount);

    // populate instance matrices & colors
    const dummy = new THREE.Object3D();
    const tmpColor = new THREE.Color();
    const r = 50;
    for (let i = 0; i < instancedMesh.count; i++) {
      const node = nodesRef.current[i] || generateNodes(1)[0];
      const x = r * Math.sin(node.phi) * Math.cos(node.theta);
      const y = r * Math.cos(node.phi);
      const z = r * Math.sin(node.phi) * Math.sin(node.theta);
      dummy.position.set(x, y, z);
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(i, dummy.matrix);
      const hex = node.status === "online" ? 0x38c0fc : 0xe04c4c;
      tmpColor.setHex(hex);
      // try to use setColorAt, fallback to instanceColor attribute
      try {
        if (typeof instancedMesh.setColorAt === "function") {
          instancedMesh.setColorAt(i, tmpColor);
        } else if (instancedMesh.instanceColor) {
          const ia = instancedMesh.instanceColor;
          ia.setXYZ(i, tmpColor.r, tmpColor.g, tmpColor.b);
        }
      } catch (err) {
        // ignore color set errors
      }
    }
    instancedMesh.instanceMatrix.needsUpdate = true;
    if (instancedMesh.instanceColor) instancedMesh.instanceColor.needsUpdate = true;

    // pointer handlers
    const rect = () => renderer.domElement.getBoundingClientRect();

    const onPointerMove = (e) => {
      const rct = rect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      mouseRef.current.x = ((clientX - rct.left) / rct.width) * 2 - 1;
      mouseRef.current.y = -((clientY - rct.top) / rct.height) * 2 + 1;
    };

    const onClick = (e) => {
      const rct = rect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      mouseRef.current.x = ((clientX - rct.left) / rct.width) * 2 - 1;
      mouseRef.current.y = -((clientY - rct.top) / rct.height) * 2 + 1;

      raycasterRef.current.setFromCamera(mouseRef.current, camera);
      const intersects = raycasterRef.current.intersectObject(instancedMesh);
      if (intersects.length > 0) {
        const idx = intersects[0].instanceId ?? null;
        if (idx !== null && idx >= 0) {
          const node = nodesRef.current[idx];
          if (node) {
            const pos = computeScreenPosForInstance(idx);
            setSelectedAnchorPos(pos);
            setSelectedNode(node);
          }
        }
      } else {
        setSelectedNode(null);
        setSelectedAnchorPos(null);
      }
    };

    renderer.domElement.addEventListener("mousemove", onPointerMove);
    renderer.domElement.addEventListener("touchmove", onPointerMove, { passive: true });
    renderer.domElement.addEventListener("click", onClick);
    renderer.domElement.addEventListener("touchstart", onClick);

    // resize observer to keep renderer responsive
    const safeResize = () => {
      const w = mount.clientWidth || 220;
      const h = mount.clientHeight || 200;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      // also recompute selectedAnchorPos if a node is open
      if (selectedNode) {
        const idx = nodesRef.current.findIndex((n) => n.id === selectedNode.id);
        if (idx >= 0) {
          const pos = computeScreenPosForInstance(idx);
          setSelectedAnchorPos(pos);
        }
      }
    };

    let ro;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(safeResize);
      ro.observe(mount);
    } else {
      window.addEventListener("resize", safeResize);
    }

    // update on scroll to keep popover position correct
    const onScroll = () => {
      if (!selectedNode) return;
      const idx = nodesRef.current.findIndex((n) => n.id === selectedNode.id);
      if (idx >= 0) {
        const pos = computeScreenPosForInstance(idx);
        setSelectedAnchorPos(pos);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    // pause rendering when tab hidden
    const handleVisibility = () => {
      isVisibleRef.current = !document.hidden;
    };
    document.addEventListener("visibilitychange", handleVisibility);

    // animation loop: update globe, update instances from nodesRef.current, run raycaster hover detection
    const tmpMat = new THREE.Matrix4();
    const tmpCol = new THREE.Color();
    let frameId;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      if (!isVisibleRef.current) return;

      // rotate globe slowly
      globe.rotation.y += 0.0018;

      // update instanced matrices & colors
      const count = Math.min(instancedMesh.count, nodesRef.current.length);
      const rLocal = 50;
      for (let i = 0; i < count; i++) {
        const node = nodesRef.current[i];
        if (!node) continue;
        const x = rLocal * Math.sin(node.phi) * Math.cos(node.theta);
        const y = rLocal * Math.cos(node.phi);
        const z = rLocal * Math.sin(node.phi) * Math.sin(node.theta);
        tmpMat.identity();
        tmpMat.setPosition(x, y, z);
        instancedMesh.setMatrixAt(i, tmpMat);

        const desiredHex = node.status === "online" ? 0x38c0fc : 0xe04c4c;
        tmpCol.setHex(desiredHex);
        try {
          if (typeof instancedMesh.setColorAt === "function") {
            instancedMesh.setColorAt(i, tmpCol);
          } else if (instancedMesh.instanceColor) {
            instancedMesh.instanceColor.setXYZ(i, tmpCol.r, tmpCol.g, tmpCol.b);
          }
        } catch (err) {
          // ignore
        }
      }
      instancedMesh.instanceMatrix.needsUpdate = true;
      if (instancedMesh.instanceColor) instancedMesh.instanceColor.needsUpdate = true;

      // hover detection
      raycasterRef.current.setFromCamera(mouseRef.current, camera);
      const intersects = raycasterRef.current.intersectObject(instancedMesh);
      const newHoveredIdx = intersects.length ? (intersects[0].instanceId ?? null) : null;
      if (lastHoveredId.current !== newHoveredIdx) {
        lastHoveredId.current = newHoveredIdx;
        if (newHoveredIdx == null) {
          setHoveredNode(null);
        } else {
          const node = nodesRef.current[newHoveredIdx];
          setHoveredNode(node || null);
        }
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // expose recreate function to recreate instanced mesh when count changes significantly
    // attach to ref so other effects can call it
    instancedRef.current = instancedMesh;

    // cleanup when unmount
    return () => {
      cancelAnimationFrame(frameId);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("scroll", onScroll);
      if (ro) ro.disconnect();
      else window.removeEventListener("resize", safeResize);
      renderer.domElement.removeEventListener("mousemove", onPointerMove);
      renderer.domElement.removeEventListener("touchmove", onPointerMove);
      renderer.domElement.removeEventListener("click", onClick);
      renderer.domElement.removeEventListener("touchstart", onClick);
      controls.dispose();
      // dispose scene geometries/materials
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
      renderer.dispose();
      if (mount && renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
      sceneRef.current = null;
      rendererRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      instancedRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createInstancedMesh, computeScreenPosForInstance]);

  // Recreate instanced mesh if node count grows beyond current count (or reduces significantly)
  useEffect(() => {
    const inst = instancedRef.current;
    if (!inst) return;
    const currentCount = inst.count;
    const desired = Math.max(1, nodesRef.current.length);
    if (desired !== currentCount) {
      // recreate with new count and preserve existing instance data where possible
      const scene = sceneRef.current;
      if (!scene) return;

      // store old data
      const oldInst = instancedRef.current;
      const oldCount = oldInst.count;

      // create new instanced mesh
      const newInst = createInstancedMesh(desired);

      // copy old matrices/colors into newInst
      const tmpMat = new THREE.Matrix4();
      const tmpColor = new THREE.Color();
      for (let i = 0; i < Math.min(oldCount, newInst.count); i++) {
        try {
          oldInst.getMatrixAt(i, tmpMat);
          newInst.setMatrixAt(i, tmpMat);
        } catch (err) {
          // ignore
        }
        try {
          if (oldInst.instanceColor) {
            const r = oldInst.instanceColor.getX ? oldInst.instanceColor.getX(i) : null;
            if (r !== null) {
              const g = oldInst.instanceColor.getY(i);
              const b = oldInst.instanceColor.getZ(i);
              if (newInst.instanceColor) newInst.instanceColor.setXYZ(i, r, g, b);
              else {
                tmpColor.setRGB(r, g, b);
                if (typeof newInst.setColorAt === "function") newInst.setColorAt(i, tmpColor);
              }
            }
          } else if (typeof oldInst.getColorAt === "function" && typeof newInst.setColorAt === "function") {
            // try copy via API if available
            try {
              const c = new THREE.Color();
              oldInst.getColorAt(i, c);
       newInst.setColorAt(i, c);
            } catch (err) {}
          }
        } catch (err) {
          // ignore
        }
      }
      newInst.instanceMatrix.needsUpdate = true;
      if (newInst.instanceColor) newInst.instanceColor.needsUpdate = true;

      // remove old from scene (done inside createInstancedMesh, but ensure cleanup)
      try {
        scene.remove(oldInst);
        if (oldInst.geometry) oldInst.geometry.dispose();
        if (oldInst.material) oldInst.material.dispose();
      } catch (err) {}

      instancedRef.current = newInst;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes.length, createInstancedMesh]);

  // Node simulation: update nodesRef in-place and mirror to React state periodically
  useEffect(() => {
    nodesRef.current = nodesRef.current.length ? nodesRef.current : generateNodes();
    const interval = setInterval(() => {
      // mutate nodesRef.current in place
      nodesRef.current.forEach((n) => {
        // gently change spherical coords and status
        n.phi += (Math.random() - 0.5) * 0.01;
        n.theta += (Math.random() - 0.5) * 0.01;
        // random status flip occasionally
        if (Math.random() < 0.08) n.status = n.status === "online" ? "offline" : "online";
        n.lastSeen = new Date().toISOString();
        // random detail changes
        n.details.cpu = `${Math.round(Math.random() * 80 + 10)}%`;
        n.details.mem = `${Math.round(Math.random() * 70 + 10)}%`;
      });

      // occasionally add an alert
      if (Math.random() < 0.25) {
        setAlerts((prev) => [generateAlert(), ...prev].slice(0, 6));
      }

      // trigger React re-render with a shallow copy (keeps objects same identity)
      setNodes((prev) => [...nodesRef.current]);
    }, 3000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // close selected popup
  const handleCloseSelected = () => {
    setSelectedNode(null);
    setSelectedAnchorPos(null);
  };

  // keyboard accessibility: focus the mount area and use arrow keys to cycle selected nodes
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        handleCloseSelected();
        return;
      }
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        const idx = selectedNode ? nodesRef.current.findIndex((n) => n.id === selectedNode.id) : -1;
        const next = Math.min(nodesRef.current.length - 1, idx + 1);
        const node = nodesRef.current[next];
        if (node) {
          const pos = computeScreenPosForInstance(next);
          setSelectedAnchorPos(pos);
          setSelectedNode(node);
        }
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        const idx = selectedNode ? nodesRef.current.findIndex((n) => n.id === selectedNode.id) : nodesRef.current.length;
        const prevIdx = Math.max(0, idx - 1);
        const node = nodesRef.current[prevIdx];
        if (node) {
          const pos = computeScreenPosForInstance(prevIdx);
          setSelectedAnchorPos(pos);
          setSelectedNode(node);
        }
      } else if (e.key === "Enter") {
        // toggle detail for currently hovered node
        if (hoveredNode) {
          const idx = nodesRef.current.findIndex((n) => n.id === hoveredNode.id);
          const pos = computeScreenPosForInstance(idx);
          setSelectedAnchorPos(pos);
          setSelectedNode(hoveredNode);
        }
      }
    };
    mount.setAttribute("tabIndex", "0");
    mount.addEventListener("keydown", onKeyDown);
    return () => {
      mount.removeEventListener("keydown", onKeyDown);
    };
  }, [selectedNode, hoveredNode, computeScreenPosForInstance]);

  // compute popover props
  const popoverAnchor = selectedAnchorPos ? { left: selectedAnchorPos.left, top: selectedAnchorPos.top } : null;

  return (
    <Box sx={{ width: 280, display: "flex", flexDirection: "column", gap: 2, mt: 1, position: "relative" }}>
      {/* Globe container */}
      <Paper sx={{ p: 2, bgcolor: "#182844", position: "relative", overflow: "visible" }}>
        <Typography variant="subtitle1" sx={{ color: "#38c0fc", mb: 1 }}>
          Globe & Node List
        </Typography>

        <div
          ref={mountRef}
          style={{ width: "100%", height: 200, margin: "0 auto 8px", outline: "none" }}
          role="region"
          aria-label="Nodes Globe - interactive"
          tabIndex={0}
        />

        <Typography variant="body2" sx={{ color: "#bbb" }}>
          Nodes: {nodes.length}
        </Typography>

        {/* hover mini-tooltip */}
        {hoveredNode && !selectedNode && (
          <Box
            sx={{
              position: "absolute",
              top: 42,
              left: 16,
              bgcolor: "#0b1827cc",
              color: "#fff",
              px: 1,
              py: 0.5,
              borderRadius: 1,
              fontSize: 12,
              pointerEvents: "none",
            }}
            aria-hidden
          >
            {hoveredNode.name} — {hoveredNode.status.toUpperCase()}
          </Box>
        )}

        {/* Selected node popover (uses absolute positioning via anchor position) */}
        <Popover
          open={!!selectedNode}
          anchorReference="anchorPosition"
          anchorPosition={popoverAnchor || { top: 0, left: 0 }}
          onClose={handleCloseSelected}
          anchorOrigin={{ vertical: "top", horizontal: "left" }}
          transformOrigin={{ vertical: "top", horizontal: "left" }}
          PaperProps={{
            sx: {
              bgcolor: "#0e2130cc",
              color: "#fff",
              minWidth: 220,
              p: 1,
              borderRadius: 1,
            },
            role: "dialog",
            "aria-modal": false,
          }}
        >
          {selectedNode && (
            <Box>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
                <Typography variant="subtitle2">{selectedNode.name}</Typography>
                <IconButton size="small" onClick={handleCloseSelected} sx={{ color: "#fff" }} aria-label="Close details">
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Box>
              <Typography variant="caption" sx={{ color: "#9fb3c9" }}>
                Status:{" "}
                <span style={{ color: selectedNode.status === "online" ? "#8ef0ff" : "#ff7b7b" }}>
                  {selectedNode.status.toUpperCase()}
                </span>
              </Typography>
              <Box sx={{ mt: 1 }}>
                <Typography variant="body2" sx={{ fontSize: 12 }}>
                  Last seen: {new Date(selectedNode.lastSeen).toLocaleString()}
                </Typography>
                <Typography variant="body2" sx={{ fontSize: 12 }}>
                  CPU: {selectedNode.details?.cpu}
                </Typography>
                <Typography variant="body2" sx={{ fontSize: 12 }}>
                  Memory: {selectedNode.details?.mem}
                </Typography>
                <Typography variant="body2" sx={{ fontSize: 12 }}>
                  Version: {selectedNode.details?.version}
                </Typography>
                <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
                  <Button size="small" variant="contained" aria-label={`Ping ${selectedNode.name}`}>Ping</Button>
                  <Button size="small" variant="outlined" aria-label={`Open ${selectedNode.name}`}>Open</Button>
                </Box>
              </Box>
            </Box>
          )}
        </Popover>
      </Paper>

      {/* Alerts */}
      <Paper sx={{ p: 1, bgcolor: "#182844", minHeight: 100 }}>
        <Typography variant="subtitle2" sx={{ color: "#38c0fc", mb: 1 }}>
          Alerts
        </Typography>
        {alerts.length === 0 && <Typography variant="body2" sx={{ color: "#bbb" }}>No alerts</Typography>}
        {alerts.map((a, i) => (
          <Typography
            key={i}
            variant="body2"
            sx={{
              color:
                a.type === "error"
                  ? "#e04c4c"
                  : a.type === "warning"
                  ? "#ffc107"
                  : "#38c0fc",
              mb: 0.5,
            }}
          >
            {a.type === "error" ? "❌" : a.type === "warning" ? "⚠️" : "ℹ️"} {a.msg}
            <span style={{ color: "#6f8aa1", marginLeft: 8, fontSize: 11 }}>· {new Date(a.ts).toLocaleTimeString()}</span>
          </Typography>
        ))}
      </Paper>

      {/* Footer */}
      <Paper sx={{ p: 1, bgcolor: "#182844" }}>
        <Typography variant="caption" sx={{ color: "#bbb" }}>
          RightSidebar v3.3 - 3D Globe (InstancedMesh) • Hover & Select • Optimized
        </Typography>
      </Paper>
    </Box>
  );
}

export default RightSidebar;