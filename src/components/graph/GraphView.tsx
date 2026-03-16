"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

interface Node {
  id: string;
  title: string;
  icon: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  connected: boolean;
}

interface Edge {
  source: string;
  target: string;
}

interface GraphViewProps {
  workspaceId: string;
  currentPageId?: string;
}

export function GraphView({ workspaceId, currentPageId }: GraphViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const nodesRef = useRef<Node[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  const [nodeCount, setNodeCount] = useState(0);

  // Camera state
  const cameraRef = useRef({ x: 0, y: 0, scale: 1 });
  // Interaction state
  const dragRef = useRef<{
    type: "node" | "pan" | null;
    nodeId: string | null;
    startX: number;
    startY: number;
    camStartX: number;
    camStartY: number;
  }>({ type: null, nodeId: null, startX: 0, startY: 0, camStartX: 0, camStartY: 0 });

  // CSS variable colors
  const colorsRef = useRef({
    bg: "#ffffff",
    primary: "#2563eb",
    muted: "#9ca3af",
    border: "#e5e7eb",
    text: "#111827",
  });

  const readColors = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const s = getComputedStyle(el);
    colorsRef.current = {
      bg: s.getPropertyValue("--background").trim() || "#ffffff",
      primary: s.getPropertyValue("--primary").trim() || "#2563eb",
      muted: s.getPropertyValue("--muted").trim() || "#9ca3af",
      border: s.getPropertyValue("--border").trim() || "#e5e7eb",
      text: s.getPropertyValue("--foreground").trim() || "#111827",
    };
  }, []);

  // Fetch data
  useEffect(() => {
    fetch(`/api/graph?workspaceId=${workspaceId}`)
      .then((r) => r.json())
      .then((data) => {
        const connectedIds = new Set<string>();
        data.edges.forEach((e: Edge) => {
          connectedIds.add(e.source);
          connectedIds.add(e.target);
        });

        const nodes: Node[] = data.nodes.map((n: { id: string; title: string; icon: string }, i: number) => {
          const angle = (i / data.nodes.length) * Math.PI * 2;
          const r = 150 + Math.random() * 100;
          return {
            ...n,
            x: Math.cos(angle) * r,
            y: Math.sin(angle) * r,
            vx: 0,
            vy: 0,
            connected: connectedIds.has(n.id),
          };
        });

        nodesRef.current = nodes;
        edgesRef.current = data.edges;
        setNodeCount(nodes.length);
      })
      .catch(() => {});
  }, [workspaceId]);

  // Screen to world coordinates
  const screenToWorld = useCallback((sx: number, sy: number) => {
    const cam = cameraRef.current;
    return {
      x: (sx - cam.x) / cam.scale,
      y: (sy - cam.y) / cam.scale,
    };
  }, []);

  const findNodeAt = useCallback((wx: number, wy: number): Node | null => {
    const nodes = nodesRef.current;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      const dx = n.x - wx;
      const dy = n.y - wy;
      if (dx * dx + dy * dy < 100) return n; // radius ~10
    }
    return null;
  }, []);

  // Animation loop + physics
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    readColors();
    let animId = 0;
    let alpha = 0.3; // cooling factor
    let tickCount = 0;

    function resize() {
      const container = containerRef.current;
      if (!container || !canvas) return;
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = rect.width + "px";
      canvas.style.height = rect.height + "px";
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Center camera on first resize
      if (cameraRef.current.x === 0 && cameraRef.current.y === 0) {
        cameraRef.current.x = rect.width / 2;
        cameraRef.current.y = rect.height / 2;
      }
    }
    resize();
    window.addEventListener("resize", resize);

    // Watch for dark mode changes
    const observer = new MutationObserver(() => readColors());
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });

    function simulate() {
      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      if (nodes.length === 0) return;

      // Only simulate when not fully cooled
      if (alpha < 0.001) return;

      const nodeMap = new Map<string, Node>();
      for (const n of nodes) nodeMap.set(n.id, n);

      // Repulsion between all nodes
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = -300 / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          a.vx -= fx * alpha;
          a.vy -= fy * alpha;
          b.vx += fx * alpha;
          b.vy += fy * alpha;
        }
      }

      // Attraction along edges
      for (const edge of edges) {
        const a = nodeMap.get(edge.source);
        const b = nodeMap.get(edge.target);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (dist - 80) * 0.05;
        const fx = (dx / dist) * force * alpha;
        const fy = (dy / dist) * force * alpha;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }

      // Centering force
      for (const n of nodes) {
        n.vx -= n.x * 0.005 * alpha;
        n.vy -= n.y * 0.005 * alpha;
      }

      // Apply velocities with damping
      for (const n of nodes) {
        // Skip dragged node
        if (dragRef.current.type === "node" && dragRef.current.nodeId === n.id) {
          n.vx = 0;
          n.vy = 0;
          continue;
        }
        n.vx *= 0.6;
        n.vy *= 0.6;
        n.x += n.vx;
        n.y += n.vy;
      }

      tickCount++;
      if (tickCount > 300) alpha *= 0.99;
    }

    function draw() {
      if (!ctx || !canvas) return;
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      const colors = colorsRef.current;
      const cam = cameraRef.current;

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = colors.bg;
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.translate(cam.x, cam.y);
      ctx.scale(cam.scale, cam.scale);

      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const nodeMap = new Map<string, Node>();
      for (const n of nodes) nodeMap.set(n.id, n);

      // Draw edges
      ctx.strokeStyle = colors.border;
      ctx.lineWidth = 1 / cam.scale;
      for (const edge of edges) {
        const a = nodeMap.get(edge.source);
        const b = nodeMap.get(edge.target);
        if (!a || !b) continue;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      // Draw nodes
      const nodeRadius = 6;
      for (const n of nodes) {
        const isCurrent = n.id === currentPageId;

        // Glow for current page
        if (isCurrent) {
          ctx.save();
          ctx.shadowColor = colors.primary;
          ctx.shadowBlur = 15 / cam.scale;
          ctx.beginPath();
          ctx.arc(n.x, n.y, nodeRadius + 2, 0, Math.PI * 2);
          ctx.fillStyle = colors.primary;
          ctx.fill();
          ctx.restore();
        }

        ctx.beginPath();
        ctx.arc(n.x, n.y, nodeRadius, 0, Math.PI * 2);
        ctx.fillStyle = n.connected ? colors.primary : colors.muted;
        ctx.fill();

        // Label
        const label = n.title.length > 15 ? n.title.slice(0, 14) + "..." : n.title;
        ctx.fillStyle = colors.text;
        ctx.font = `${11 / cam.scale}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(label, n.x, n.y + nodeRadius + 12 / cam.scale);
      }

      ctx.restore();
    }

    function loop() {
      simulate();
      draw();
      animId = requestAnimationFrame(loop);
    }
    animId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
      observer.disconnect();
    };
  }, [readColors, currentPageId, nodeCount]);

  // Mouse interactions
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function handleMouseDown(e: MouseEvent) {
      const rect = canvas!.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const wp = screenToWorld(sx, sy);
      const node = findNodeAt(wp.x, wp.y);

      if (node) {
        dragRef.current = {
          type: "node",
          nodeId: node.id,
          startX: sx,
          startY: sy,
          camStartX: 0,
          camStartY: 0,
        };
      } else {
        dragRef.current = {
          type: "pan",
          nodeId: null,
          startX: sx,
          startY: sy,
          camStartX: cameraRef.current.x,
          camStartY: cameraRef.current.y,
        };
      }
    }

    function handleMouseMove(e: MouseEvent) {
      const drag = dragRef.current;
      if (!drag.type) return;
      const rect = canvas!.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      if (drag.type === "node" && drag.nodeId) {
        const wp = screenToWorld(sx, sy);
        const node = nodesRef.current.find((n) => n.id === drag.nodeId);
        if (node) {
          node.x = wp.x;
          node.y = wp.y;
          node.vx = 0;
          node.vy = 0;
        }
      } else if (drag.type === "pan") {
        cameraRef.current.x = drag.camStartX + (sx - drag.startX);
        cameraRef.current.y = drag.camStartY + (sy - drag.startY);
      }
    }

    function handleMouseUp(e: MouseEvent) {
      const drag = dragRef.current;
      if (drag.type === "node" && drag.nodeId) {
        const rect = canvas!.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const dist = Math.abs(sx - drag.startX) + Math.abs(sy - drag.startY);
        if (dist < 5) {
          // Click - navigate
          router.push(`/workspace/${workspaceId}/page/${drag.nodeId}`);
        }
      }
      dragRef.current = { type: null, nodeId: null, startX: 0, startY: 0, camStartX: 0, camStartY: 0 };
    }

    function handleWheel(e: WheelEvent) {
      e.preventDefault();
      const cam = cameraRef.current;
      const rect = canvas!.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(0.1, Math.min(5, cam.scale * factor));

      // Zoom toward mouse position
      cam.x = mx - (mx - cam.x) * (newScale / cam.scale);
      cam.y = my - (my - cam.y) * (newScale / cam.scale);
      cam.scale = newScale;
    }

    canvas.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    canvas.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      canvas.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      canvas.removeEventListener("wheel", handleWheel);
    };
  }, [workspaceId, router, screenToWorld, findNodeAt]);

  return (
    <div ref={containerRef} className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="지식 그래프"
        className="block w-full h-full"
        style={{ cursor: "grab" }}
      />
      <div
        className="absolute top-3 left-3 text-xs px-2 py-1 rounded"
        style={{ background: "var(--sidebar-hover)", color: "var(--muted)" }}
      >
        {nodeCount}개 노드
      </div>
    </div>
  );
}
