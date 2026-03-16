"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

interface GraphNode {
  id: string;
  title: string;
  slug: string;
  icon: string;
  parentId: string | null;
  // simulation state
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  connectionCount: number;
}

interface GraphEdge {
  source: string;
  target: string;
  type: "parent" | "backlink";
}

interface KnowledgeGraphProps {
  workspaceId: string;
  currentPageId?: string;
}

export function KnowledgeGraph({ workspaceId, currentPageId }: KnowledgeGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);
  const [nodeCount, setNodeCount] = useState(0);
  const [edgeCount, setEdgeCount] = useState(0);
  const [loading, setLoading] = useState(true);

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
    moved: boolean;
  }>({ type: null, nodeId: null, startX: 0, startY: 0, camStartX: 0, camStartY: 0, moved: false });

  // Hover state
  const hoverNodeRef = useRef<string | null>(null);

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
    setLoading(true);
    fetch(`/api/workspaces/${workspaceId}/graph`)
      .then((r) => r.json())
      .then((data) => {
        // Count connections per node
        const connectionMap = new Map<string, number>();
        for (const e of data.edges) {
          connectionMap.set(e.source, (connectionMap.get(e.source) || 0) + 1);
          connectionMap.set(e.target, (connectionMap.get(e.target) || 0) + 1);
        }

        const maxConnections = Math.max(1, ...Array.from(connectionMap.values()));

        const nodes: GraphNode[] = data.nodes.map(
          (n: { id: string; title: string; slug: string; icon: string; parentId: string | null }, i: number) => {
            const angle = (i / data.nodes.length) * Math.PI * 2;
            const r = 200 + Math.random() * 150;
            const conn = connectionMap.get(n.id) || 0;
            // Radius: min 5, max 18, scaled by connection count
            const radius = 5 + (conn / maxConnections) * 13;
            return {
              ...n,
              x: Math.cos(angle) * r,
              y: Math.sin(angle) * r,
              vx: 0,
              vy: 0,
              radius,
              connectionCount: conn,
            };
          }
        );

        nodesRef.current = nodes;
        edgesRef.current = data.edges;
        setNodeCount(nodes.length);
        setEdgeCount(data.edges.length);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [workspaceId]);

  // Screen to world coordinates
  const screenToWorld = useCallback((sx: number, sy: number) => {
    const cam = cameraRef.current;
    return {
      x: (sx - cam.x) / cam.scale,
      y: (sy - cam.y) / cam.scale,
    };
  }, []);

  const findNodeAt = useCallback((wx: number, wy: number): GraphNode | null => {
    const nodes = nodesRef.current;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      const dx = n.x - wx;
      const dy = n.y - wy;
      const hitRadius = n.radius + 4;
      if (dx * dx + dy * dy < hitRadius * hitRadius) return n;
    }
    return null;
  }, []);

  // Get connected node IDs for highlighting
  const getConnectedIds = useCallback((nodeId: string): Set<string> => {
    const ids = new Set<string>();
    ids.add(nodeId);
    for (const e of edgesRef.current) {
      if (e.source === nodeId) ids.add(e.target);
      if (e.target === nodeId) ids.add(e.source);
    }
    return ids;
  }, []);

  // Animation loop + physics
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    readColors();
    let animId = 0;
    let alpha = 0.5; // cooling factor
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
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });

    function simulate() {
      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      if (nodes.length === 0) return;

      // Only simulate when not fully cooled
      if (alpha < 0.001) return;

      const nodeMap = new Map<string, GraphNode>();
      for (const n of nodes) nodeMap.set(n.id, n);

      // Repulsion between all nodes (Coulomb's law)
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i],
            b = nodes[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          // Stronger repulsion for more connected nodes
          const repulsion = -500 / (dist * dist);
          const fx = (dx / dist) * repulsion;
          const fy = (dy / dist) * repulsion;
          a.vx -= fx * alpha;
          a.vy -= fy * alpha;
          b.vx += fx * alpha;
          b.vy += fy * alpha;
        }
      }

      // Attraction along edges (spring force)
      for (const edge of edges) {
        const a = nodeMap.get(edge.source);
        const b = nodeMap.get(edge.target);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const idealDist = edge.type === "parent" ? 100 : 120;
        const stiffness = edge.type === "parent" ? 0.08 : 0.04;
        const force = (dist - idealDist) * stiffness;
        const fx = (dx / dist) * force * alpha;
        const fy = (dy / dist) * force * alpha;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }

      // Centering gravity
      for (const n of nodes) {
        n.vx -= n.x * 0.008 * alpha;
        n.vy -= n.y * 0.008 * alpha;
      }

      // Apply velocities with damping
      for (const n of nodes) {
        // Skip dragged node
        if (dragRef.current.type === "node" && dragRef.current.nodeId === n.id) {
          n.vx = 0;
          n.vy = 0;
          continue;
        }
        n.vx *= 0.55;
        n.vy *= 0.55;
        n.x += n.vx;
        n.y += n.vy;
      }

      tickCount++;
      if (tickCount > 200) alpha *= 0.995;
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
      const nodeMap = new Map<string, GraphNode>();
      for (const n of nodes) nodeMap.set(n.id, n);

      const hoverId = hoverNodeRef.current;
      const highlightedIds = hoverId ? getConnectedIds(hoverId) : null;
      const dimming = hoverId !== null;

      // Draw edges
      for (const edge of edges) {
        const a = nodeMap.get(edge.source);
        const b = nodeMap.get(edge.target);
        if (!a || !b) continue;

        const isHighlighted =
          highlightedIds && highlightedIds.has(edge.source) && highlightedIds.has(edge.target);

        if (dimming && !isHighlighted) {
          ctx.globalAlpha = 0.08;
        } else if (isHighlighted) {
          ctx.globalAlpha = 1;
        } else {
          ctx.globalAlpha = 0.4;
        }

        ctx.strokeStyle = isHighlighted ? colors.primary : colors.border;
        ctx.lineWidth = (isHighlighted ? 2 : 1) / cam.scale;

        ctx.beginPath();
        if (edge.type === "backlink") {
          // Dashed line for backlinks
          ctx.setLineDash([6 / cam.scale, 4 / cam.scale]);
        } else {
          // Solid line for parent-child
          ctx.setLineDash([]);
        }
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.globalAlpha = 1;

      // Draw nodes
      for (const n of nodes) {
        const isCurrent = n.id === currentPageId;
        const isHovered = n.id === hoverId;
        const isConnectedToHover = highlightedIds?.has(n.id);

        if (dimming && !isConnectedToHover) {
          ctx.globalAlpha = 0.15;
        } else {
          ctx.globalAlpha = 1;
        }

        const nodeRadius = n.radius;

        // Glow for current page
        if (isCurrent) {
          ctx.save();
          ctx.shadowColor = colors.primary;
          ctx.shadowBlur = 20 / cam.scale;
          ctx.beginPath();
          ctx.arc(n.x, n.y, nodeRadius + 3, 0, Math.PI * 2);
          ctx.fillStyle = colors.primary;
          ctx.fill();
          ctx.restore();
        }

        // Hover ring
        if (isHovered) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, nodeRadius + 4, 0, Math.PI * 2);
          ctx.strokeStyle = colors.primary;
          ctx.lineWidth = 2 / cam.scale;
          ctx.stroke();
        }

        // Node circle
        ctx.beginPath();
        ctx.arc(n.x, n.y, nodeRadius, 0, Math.PI * 2);
        if (isCurrent) {
          ctx.fillStyle = colors.primary;
        } else if (n.connectionCount > 0) {
          ctx.fillStyle = colors.primary;
        } else {
          ctx.fillStyle = colors.muted;
        }
        ctx.fill();

        // White inner circle for large nodes to create ring effect
        if (nodeRadius > 8 && !isCurrent) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, nodeRadius * 0.5, 0, Math.PI * 2);
          ctx.fillStyle = colors.bg;
          ctx.fill();
        }

        // Label
        const maxLabelLen = 18;
        const label =
          (n.icon ? n.icon + " " : "") +
          (n.title.length > maxLabelLen ? n.title.slice(0, maxLabelLen - 1) + "\u2026" : n.title);
        const fontSize = Math.max(10, 12) / cam.scale;
        ctx.fillStyle = colors.text;
        ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(label, n.x, n.y + nodeRadius + 4 / cam.scale);
      }

      ctx.globalAlpha = 1;
      ctx.restore();
    }

    function loop() {
      readColors();
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
  }, [readColors, currentPageId, nodeCount, getConnectedIds]);

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
          moved: false,
        };
        canvas!.style.cursor = "grabbing";
      } else {
        dragRef.current = {
          type: "pan",
          nodeId: null,
          startX: sx,
          startY: sy,
          camStartX: cameraRef.current.x,
          camStartY: cameraRef.current.y,
          moved: false,
        };
        canvas!.style.cursor = "grabbing";
      }
    }

    function handleMouseMove(e: MouseEvent) {
      const rect = canvas!.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const drag = dragRef.current;

      if (drag.type === "node" && drag.nodeId) {
        drag.moved = true;
        const wp = screenToWorld(sx, sy);
        const node = nodesRef.current.find((n) => n.id === drag.nodeId);
        if (node) {
          node.x = wp.x;
          node.y = wp.y;
          node.vx = 0;
          node.vy = 0;
        }
      } else if (drag.type === "pan") {
        drag.moved = true;
        cameraRef.current.x = drag.camStartX + (sx - drag.startX);
        cameraRef.current.y = drag.camStartY + (sy - drag.startY);
      } else {
        // Hover detection
        const wp = screenToWorld(sx, sy);
        const node = findNodeAt(wp.x, wp.y);
        hoverNodeRef.current = node ? node.id : null;
        canvas!.style.cursor = node ? "pointer" : "grab";
      }
    }

    function handleMouseUp(_e: MouseEvent) {
      const drag = dragRef.current;
      if (drag.type === "node" && drag.nodeId && !drag.moved) {
        // Click - navigate to page
        router.push(`/workspace/${workspaceId}/page/${drag.nodeId}`);
      }
      dragRef.current = {
        type: null,
        nodeId: null,
        startX: 0,
        startY: 0,
        camStartX: 0,
        camStartY: 0,
        moved: false,
      };
      canvas!.style.cursor = "grab";
    }

    function handleMouseLeave() {
      hoverNodeRef.current = null;
      if (!dragRef.current.type) {
        canvas!.style.cursor = "grab";
      }
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
    canvas.addEventListener("mouseleave", handleMouseLeave);
    canvas.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      canvas.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      canvas.removeEventListener("wheel", handleWheel);
    };
  }, [workspaceId, router, screenToWorld, findNodeAt]);

  return (
    <div ref={containerRef} className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        className="block w-full h-full"
        style={{ cursor: "grab" }}
      />

      {/* Stats overlay */}
      <div
        className="absolute top-3 left-3 flex items-center gap-3 text-xs px-3 py-1.5 rounded-lg"
        style={{
          background: "var(--background)",
          border: "1px solid var(--border)",
          color: "var(--muted)",
        }}
      >
        <span>{nodeCount}개 노드</span>
        <span style={{ color: "var(--border)" }}>|</span>
        <span>{edgeCount}개 연결</span>
      </div>

      {/* Legend */}
      <div
        className="absolute bottom-3 left-3 flex items-center gap-4 text-xs px-3 py-1.5 rounded-lg"
        style={{
          background: "var(--background)",
          border: "1px solid var(--border)",
          color: "var(--muted)",
        }}
      >
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-5 h-0.5"
            style={{ background: "var(--border)" }}
          />
          부모-자식
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-5 h-0.5"
            style={{
              background: "var(--border)",
              borderTop: "2px dashed var(--border)",
              height: 0,
            }}
          />
          백링크
        </span>
      </div>

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="px-4 py-2 rounded-lg text-sm"
            style={{
              background: "var(--background)",
              border: "1px solid var(--border)",
              color: "var(--muted)",
            }}
          >
            그래프 로딩 중...
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && nodeCount === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="px-6 py-4 rounded-lg text-sm text-center"
            style={{
              background: "var(--background)",
              border: "1px solid var(--border)",
              color: "var(--muted)",
              maxWidth: 320,
            }}
          >
            <p style={{ fontWeight: 500, marginBottom: 4, color: "var(--foreground)" }}>
              그래프가 비어 있습니다
            </p>
            <p>
              페이지를 만들고 [[백링크]]로 연결하면 그래프가 형성됩니다.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
