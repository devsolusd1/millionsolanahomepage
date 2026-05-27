"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import Brand from "@/components/Brand";
import TokenAddress from "@/components/TokenAddress";
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  TOKENS_PER_PIXEL,
  TOKEN_MINT,
  MAX_CLAIM_SIZE,
  COOLDOWN_MIN,
  explorerTxUrl,
  explorerAddressUrl,
} from "@/lib/config";

type Region = {
  x: number;
  y: number;
  w: number;
  h: number;
  sig: string;
  owner: string;
  creator: string | null;
  link: string | null;
};
const short = (s: string) => `${s.slice(0, 4)}…${s.slice(-4)}`;
const rectsOverlap = (a: Rect, b: Region) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
import { burnForPixels } from "@/lib/burn";

type Tool = "select" | "draw" | "line" | "rect" | "ellipse" | "erase" | "image" | "pan";
type Pt = { x: number; y: number };
type View = { scale: number; ox: number; oy: number };
type Rect = { x: number; y: number; w: number; h: number };

const keyOf = (x: number, y: number) => `${x},${y}`;
const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

export default function PixelCanvas() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const committed = useRef<Map<string, string>>(new Map());
  const [pending, setPending] = useState<Map<string, string>>(new Map());

  const [tool, setTool] = useState<Tool>("select");
  const [color, setColor] = useState("#ff0044");
  const [brush, setBrush] = useState(1);
  const [fillShape, setFillShape] = useState(false);

  // In-progress shape (line/rect/ellipse) drag state and live preview.
  const shapeAnchorRef = useRef<Pt | null>(null);
  const shapePixelsRef = useRef<Map<string, string> | null>(null);
  // The board is enormous, so start zoomed in enough to comfortably draw a
  // single claim (a 200px region fits on screen at scale ~4).
  const [view, setView] = useState<View>({ scale: 4, ox: 20, oy: 20 });
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);

  // Claimed working region. Drawing is only allowed inside it.
  const [claim, setClaim] = useState<Rect | null>(null);
  const selectingRef = useRef<Rect | null>(null);
  const anchorRef = useRef<{ x: number; y: number } | null>(null);
  // First corner for two-click selection (click once, then click again).
  const firstCornerRef = useRef<Pt | null>(null);

  // Image-stamp state.
  const stampRef = useRef<{ w: number; h: number; colors: (string | null)[] } | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [stampWidth, setStampWidth] = useState(40);
  const [hasStamp, setHasStamp] = useState(false);
  const hoverRef = useRef<{ x: number; y: number } | null>(null);

  // Link to attach to this placement, and per-committed-pixel placement info
  // (burn tx, owner, optional link) so we can prove on-chain provenance.
  const [nameInput, setNameInput] = useState("");
  const [linkInput, setLinkInput] = useState("");
  const [noLink, setNoLink] = useState(false);
  const regionsRef = useRef<Region[]>([]);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; info: Region } | null>(null);
  const tooltipSigRef = useRef<string | null>(null);
  const downPosRef = useRef<{ x: number; y: number } | null>(null);
  const [lastTx, setLastTx] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(true);

  // Find the reserved region containing a board pixel (for tooltip/click/overlap).
  const regionAt = (px: number, py: number): Region | undefined =>
    regionsRef.current.find(
      (r) => px >= r.x && py >= r.y && px < r.x + r.w && py < r.y + r.h,
    );

  const drawnCount = pending.size;
  const claimArea = claim ? claim.w * claim.h : 0;
  const cost = claimArea * TOKENS_PER_PIXEL;

  // ---- load committed pixels ----
  const loadCanvas = useCallback(async () => {
    const res = await fetch("/api/canvas", { cache: "no-store" });
    const data = await res.json();
    const map = new Map<string, string>();
    for (const p of data.pixels as { x: number; y: number; color: string }[]) {
      map.set(keyOf(p.x, p.y), p.color);
    }
    committed.current = map;
    regionsRef.current = (data.regions ?? []) as Region[];
    draw();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadCanvas();
  }, [loadCanvas]);

  // ---- rendering ----
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = wrap.clientWidth;
    const ch = wrap.clientHeight;
    if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
      canvas.width = cw * dpr;
      canvas.height = ch * dpr;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    const { scale, ox, oy } = view;

    // page background (outside board) — light gray
    ctx.fillStyle = "#f3f3f3";
    ctx.fillRect(0, 0, cw, ch);

    // board background — white, like the original
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(ox, oy, CANVAS_WIDTH * scale, CANVAS_HEIGHT * scale);

    // committed pixels
    for (const [k, c] of committed.current) {
      const [x, y] = k.split(",").map(Number);
      ctx.fillStyle = c;
      ctx.fillRect(ox + x * scale, oy + y * scale, scale, scale);
    }
    // pending pixels
    for (const [k, c] of pending) {
      const [x, y] = k.split(",").map(Number);
      ctx.fillStyle = c;
      ctx.fillRect(ox + x * scale, oy + y * scale, scale, scale);
    }
    // in-progress shape preview
    if (shapePixelsRef.current) {
      for (const [k, c] of shapePixelsRef.current) {
        const [x, y] = k.split(",").map(Number);
        ctx.fillStyle = c;
        ctx.fillRect(ox + x * scale, oy + y * scale, scale, scale);
      }
    }

    // reserved regions — faint border so claimed (even unpainted) areas show
    for (const r of regionsRef.current) {
      ctx.strokeStyle = "rgba(43,77,255,0.35)";
      ctx.lineWidth = 1;
      ctx.strokeRect(ox + r.x * scale, oy + r.y * scale, r.w * scale, r.h * scale);
    }

    // grid lines when zoomed in enough
    if (scale >= 6) {
      ctx.strokeStyle = "#ededed";
      ctx.lineWidth = 1;
      ctx.beginPath();
      const x0 = Math.max(0, Math.floor(-ox / scale));
      const x1 = Math.min(CANVAS_WIDTH, Math.ceil((cw - ox) / scale));
      const y0 = Math.max(0, Math.floor(-oy / scale));
      const y1 = Math.min(CANVAS_HEIGHT, Math.ceil((ch - oy) / scale));
      for (let x = x0; x <= x1; x++) {
        ctx.moveTo(ox + x * scale + 0.5, oy + y0 * scale);
        ctx.lineTo(ox + x * scale + 0.5, oy + y1 * scale);
      }
      for (let y = y0; y <= y1; y++) {
        ctx.moveTo(ox + x0 * scale, oy + y * scale + 0.5);
        ctx.lineTo(ox + x1 * scale, oy + y * scale + 0.5);
      }
      ctx.stroke();
    }

    // image stamp preview under the cursor (clipped to claim)
    const stamp = stampRef.current;
    const hover = hoverRef.current;
    if (tool === "image" && stamp && hover && claim) {
      ctx.globalAlpha = 0.6;
      for (let j = 0; j < stamp.h; j++) {
        for (let i = 0; i < stamp.w; i++) {
          const c = stamp.colors[j * stamp.w + i];
          if (!c) continue;
          const px = hover.x + i;
          const py = hover.y + j;
          if (!insideRect(px, py, claim)) continue;
          ctx.fillStyle = c;
          ctx.fillRect(ox + px * scale, oy + py * scale, scale, scale);
        }
      }
      ctx.globalAlpha = 1;
    }

    // claimed region outline + the in-progress selection (red if overlapping)
    const previewRect = selectingRef.current ?? claim;
    if (previewRect) {
      const isLive = !!selectingRef.current;
      const invalid = regionsRef.current.some((r) => rectsOverlap(previewRect, r));
      ctx.fillStyle = invalid ? "rgba(255,0,68,0.10)" : "rgba(43,77,255,0.08)";
      ctx.fillRect(
        ox + previewRect.x * scale,
        oy + previewRect.y * scale,
        previewRect.w * scale,
        previewRect.h * scale,
      );
      ctx.strokeStyle = invalid ? "#ff0044" : isLive ? "#2B4DFF" : "#2B4DFF";
      ctx.setLineDash(isLive ? [6, 4] : []);
      ctx.lineWidth = 2;
      ctx.strokeRect(
        ox + previewRect.x * scale,
        oy + previewRect.y * scale,
        previewRect.w * scale,
        previewRect.h * scale,
      );
      ctx.setLineDash([]);
    }

    // board border
    ctx.strokeStyle = "#cccccc";
    ctx.lineWidth = 1;
    ctx.strokeRect(ox, oy, CANVAS_WIDTH * scale, CANVAS_HEIGHT * scale);
  }, [view, pending, tool, claim]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const onResize = () => draw();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [draw]);

  // Reset any in-progress two-click selection when leaving the Select tool.
  useEffect(() => {
    if (tool !== "select") {
      firstCornerRef.current = null;
      selectingRef.current = null;
    }
  }, [tool]);

  // ---- coordinate helpers ----
  const toPixel = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      const x = Math.floor((clientX - rect.left - view.ox) / view.scale);
      const y = Math.floor((clientY - rect.top - view.oy) / view.scale);
      return { x, y };
    },
    [view],
  );

  const inBoard = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < CANVAS_WIDTH && y < CANVAS_HEIGHT;

  // ---- painting (constrained to the claimed region) ----
  const paintAt = useCallback(
    (clientX: number, clientY: number, erase: boolean) => {
      if (!claim) return;
      const { x, y } = toPixel(clientX, clientY);
      setPending((prev) => {
        const next = new Map(prev);
        for (let dy = 0; dy < brush; dy++) {
          for (let dx = 0; dx < brush; dx++) {
            const px = x + dx;
            const py = y + dy;
            if (!inBoard(px, py)) continue;
            if (!insideRect(px, py, claim)) continue;
            const k = keyOf(px, py);
            if (erase) {
              next.delete(k);
            } else {
              if (committed.current.has(k)) continue; // can't overwrite
              next.set(k, color);
            }
          }
        }
        return next;
      });
    },
    [toPixel, color, brush, claim],
  );

  const stampAt = useCallback(
    (clientX: number, clientY: number) => {
      const stamp = stampRef.current;
      if (!stamp || !claim) return;
      const { x, y } = toPixel(clientX, clientY);
      setPending((prev) => {
        const next = new Map(prev);
        for (let j = 0; j < stamp.h; j++) {
          for (let i = 0; i < stamp.w; i++) {
            const c = stamp.colors[j * stamp.w + i];
            if (!c) continue;
            const px = x + i;
            const py = y + j;
            if (!inBoard(px, py) || !insideRect(px, py, claim)) continue;
            if (committed.current.has(keyOf(px, py))) continue;
            next.set(keyOf(px, py), c);
          }
        }
        return next;
      });
    },
    [toPixel, claim],
  );

  // Build the pixels for a shape (line/rect/ellipse) from anchor `a` to `b`,
  // clipped to the claim and skipping already-painted pixels.
  const buildShape = useCallback(
    (a: Pt, b: Pt): Map<string, string> => {
      const out = new Map<string, string>();
      if (!claim) return out;

      const setOne = (px: number, py: number) => {
        if (!inBoard(px, py) || !insideRect(px, py, claim)) return;
        if (committed.current.has(keyOf(px, py))) return;
        out.set(keyOf(px, py), color);
      };
      // Stamp a brush-sized block (for thickness on lines/outlines).
      const stampBlock = (px: number, py: number) => {
        for (let dy = 0; dy < brush; dy++)
          for (let dx = 0; dx < brush; dx++) setOne(px + dx, py + dy);
      };

      if (tool === "line") {
        for (const [x, y] of linePixels(a.x, a.y, b.x, b.y)) stampBlock(x, y);
      } else if (tool === "rect") {
        const x0 = Math.min(a.x, b.x);
        const x1 = Math.max(a.x, b.x);
        const y0 = Math.min(a.y, b.y);
        const y1 = Math.max(a.y, b.y);
        if (fillShape) {
          for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) setOne(x, y);
        } else {
          for (let x = x0; x <= x1; x++) {
            stampBlock(x, y0);
            stampBlock(x, y1 - (brush - 1));
          }
          for (let y = y0; y <= y1; y++) {
            stampBlock(x0, y);
            stampBlock(x1 - (brush - 1), y);
          }
        }
      } else if (tool === "ellipse") {
        const cx = (a.x + b.x) / 2;
        const cy = (a.y + b.y) / 2;
        const rx = Math.max(0.5, Math.abs(b.x - a.x) / 2);
        const ry = Math.max(0.5, Math.abs(b.y - a.y) / 2);
        const x0 = Math.floor(Math.min(a.x, b.x));
        const x1 = Math.ceil(Math.max(a.x, b.x));
        const y0 = Math.floor(Math.min(a.y, b.y));
        const y1 = Math.ceil(Math.max(a.y, b.y));
        const inside = (x: number, y: number) =>
          ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            if (!inside(x, y)) continue;
            if (fillShape) {
              setOne(x, y);
            } else {
              // edge = inside but with a non-inside 4-neighbour
              const edge =
                !inside(x - 1, y) ||
                !inside(x + 1, y) ||
                !inside(x, y - 1) ||
                !inside(x, y + 1);
              if (edge) stampBlock(x, y);
            }
          }
        }
      }
      return out;
    },
    [tool, color, brush, fillShape, claim],
  );

  const isShapeTool = tool === "line" || tool === "rect" || tool === "ellipse";

  // Build a claim rect from two corners, clamped to the board + max claim size.
  const rectFromCorners = (a: Pt, b: Pt): Rect => {
    let bx = clamp(b.x, 0, CANVAS_WIDTH - 1);
    let by = clamp(b.y, 0, CANVAS_HEIGHT - 1);
    bx = clamp(bx, a.x - (MAX_CLAIM_SIZE - 1), a.x + (MAX_CLAIM_SIZE - 1));
    by = clamp(by, a.y - (MAX_CLAIM_SIZE - 1), a.y + (MAX_CLAIM_SIZE - 1));
    return {
      x: Math.min(a.x, bx),
      y: Math.min(a.y, by),
      w: Math.abs(bx - a.x) + 1,
      h: Math.abs(by - a.y) + 1,
    };
  };

  // Finalize a selection rect into a claim (rejecting overlaps).
  const tryClaimRect = (rect: Rect) => {
    selectingRef.current = null;
    anchorRef.current = null;
    firstCornerRef.current = null;
    dragging.current = false;
    if (regionsRef.current.some((r) => rectsOverlap(rect, r))) {
      setStatus("That area overlaps a region someone already claimed. Pick empty space.");
      draw();
      return;
    }
    setClaim(rect);
    setPending(new Map());
    const area = rect.w * rect.h;
    setStatus(
      `Region claimed: ${rect.w}×${rect.h} = ${area} px · costs ${area * TOKENS_PER_PIXEL} $PIXEL. Pick a tool (Draw/Line/…) to paint inside it.`,
    );
  };

  // ---- pointer interaction ----
  const dragging = useRef(false);
  const panning = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    downPosRef.current = { x: e.clientX, y: e.clientY };

    if (tool === "pan" || e.button === 1 || e.shiftKey) {
      panning.current = { x: e.clientX, y: e.clientY, ox: view.ox, oy: view.oy };
      return;
    }

    if (tool === "select") {
      const { x, y } = toPixel(e.clientX, e.clientY);
      const ax = clamp(x, 0, CANVAS_WIDTH - 1);
      const ay = clamp(y, 0, CANVAS_HEIGHT - 1);
      anchorRef.current = { x: ax, y: ay };
      selectingRef.current = { x: ax, y: ay, w: 1, h: 1 };
      dragging.current = true;
      draw();
      return;
    }

    if (!claim) {
      setStatus("Select a region first (use the Select tool).");
      return;
    }

    if (tool === "image") {
      stampAt(e.clientX, e.clientY);
      return;
    }

    if (isShapeTool) {
      shapeAnchorRef.current = toPixel(e.clientX, e.clientY);
      shapePixelsRef.current = new Map();
      dragging.current = true;
      return;
    }

    dragging.current = true;
    paintAt(e.clientX, e.clientY, tool === "erase");
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (panning.current) {
      const p = panning.current;
      setView((v) => ({ ...v, ox: p.ox + (e.clientX - p.x), oy: p.oy + (e.clientY - p.y) }));
      return;
    }

    if (tool === "select" && dragging.current && anchorRef.current) {
      // Click-and-hold drag selection.
      selectingRef.current = rectFromCorners(anchorRef.current, toPixel(e.clientX, e.clientY));
      draw();
      return;
    }

    if (tool === "select" && !dragging.current && firstCornerRef.current) {
      // Two-click selection: preview from the first corner to the cursor.
      selectingRef.current = rectFromCorners(firstCornerRef.current, toPixel(e.clientX, e.clientY));
      draw();
      return;
    }

    if (tool === "image" && claim) {
      hoverRef.current = toPixel(e.clientX, e.clientY);
      draw();
      return;
    }

    if (isShapeTool && dragging.current && shapeAnchorRef.current) {
      shapePixelsRef.current = buildShape(shapeAnchorRef.current, toPixel(e.clientX, e.clientY));
      draw();
      return;
    }

    if (dragging.current) {
      paintAt(e.clientX, e.clientY, tool === "erase");
      return;
    }

    // Not dragging: show a tooltip when hovering any painted (on-chain) area.
    // Keep it stable while hovering the same placement so its links are clickable.
    const { x, y } = toPixel(e.clientX, e.clientY);
    const info = regionAt(x, y);
    if (info) {
      if (tooltipSigRef.current !== info.sig) {
        const r = wrapRef.current?.getBoundingClientRect();
        setTooltip({
          x: e.clientX - (r?.left ?? 0),
          y: e.clientY - (r?.top ?? 0),
          info,
        });
        tooltipSigRef.current = info.sig;
      }
    } else if (tooltipSigRef.current !== null) {
      setTooltip(null);
      tooltipSigRef.current = null;
    }
  };

  const clearTooltip = () => {
    setTooltip(null);
    tooltipSigRef.current = null;
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const down = downPosRef.current;
    downPosRef.current = null;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);

    // Releasing a pan (middle-button / Shift / Pan tool) just stops panning —
    // it must not fall through into select/draw logic.
    if (panning.current) {
      panning.current = null;
      dragging.current = false;
      return;
    }

    const isClick = !!down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5;

    // A click (no real drag) on a painted area opens its link or burn tx.
    if (isClick) {
      const { x, y } = toPixel(e.clientX, e.clientY);
      const info = regionAt(x, y);
      if (info) {
        selectingRef.current = null;
        anchorRef.current = null;
        firstCornerRef.current = null;
        shapeAnchorRef.current = null;
        shapePixelsRef.current = null;
        dragging.current = false;
        const target = info.link ?? (info.sig ? explorerTxUrl(info.sig) : null);
        if (target) window.open(target, "_blank", "noopener,noreferrer");
        draw();
        return;
      }
    }

    if (tool === "select") {
      const cursor = toPixel(e.clientX, e.clientY);
      // Click-and-hold: a real drag finalizes the region immediately.
      if (!isClick && selectingRef.current) {
        tryClaimRect(selectingRef.current);
        return;
      }
      // Two-click: first click sets a corner, second click finishes the rect.
      if (!firstCornerRef.current) {
        const ax = clamp(cursor.x, 0, CANVAS_WIDTH - 1);
        const ay = clamp(cursor.y, 0, CANVAS_HEIGHT - 1);
        firstCornerRef.current = { x: ax, y: ay };
        selectingRef.current = { x: ax, y: ay, w: 1, h: 1 };
        anchorRef.current = null;
        dragging.current = false;
        setStatus("First corner set — click the opposite corner (or drag) to finish.");
        draw();
        return;
      }
      tryClaimRect(rectFromCorners(firstCornerRef.current, cursor));
      return;
    }
    if (isShapeTool && shapePixelsRef.current) {
      const shapePixels = shapePixelsRef.current;
      shapeAnchorRef.current = null;
      shapePixelsRef.current = null;
      dragging.current = false;
      if (shapePixels.size > 0) {
        setPending((prev) => {
          const next = new Map(prev);
          for (const [k, c] of shapePixels) next.set(k, c);
          return next;
        });
      } else {
        draw();
      }
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
      return;
    }

    dragging.current = false;
    panning.current = null;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  const onWheel = (e: React.WheelEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    setView((v) => {
      const newScale = clamp(v.scale * factor, 0.01, 30);
      const ox = sx - (sx - v.ox) * (newScale / v.scale);
      const oy = sy - (sy - v.oy) * (newScale / v.scale);
      return { scale: newScale, ox, oy };
    });
  };

  // ---- image upload -> stamp ----
  const onImageFile = (file: File) => {
    const img = new Image();
    img.onload = () => rebuildStamp(img, stampWidth);
    img.src = URL.createObjectURL(file);
    imgRef.current = img;
  };

  const rebuildStamp = useCallback(
    (img: HTMLImageElement, w: number) => {
      const width = Math.max(1, Math.min(CANVAS_WIDTH, Math.round(w)));
      const height = Math.max(1, Math.round((width * img.height) / img.width));
      const off = document.createElement("canvas");
      off.width = width;
      off.height = height;
      const ctx = off.getContext("2d")!;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(img, 0, 0, width, height);
      const { data } = ctx.getImageData(0, 0, width, height);
      const colors: (string | null)[] = new Array(width * height);
      for (let i = 0; i < width * height; i++) {
        const a = data[i * 4 + 3];
        if (a < 32) {
          colors[i] = null;
          continue;
        }
        const r = data[i * 4];
        const g = data[i * 4 + 1];
        const b = data[i * 4 + 2];
        colors[i] = `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
      }
      stampRef.current = { w: width, h: height, colors };
      setHasStamp(true);
      setTool("image");
      draw();
    },
    [draw],
  );

  useEffect(() => {
    if (imgRef.current && hasStamp) rebuildStamp(imgRef.current, stampWidth);
  }, [stampWidth]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- paste from clipboard ----
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) =>
        i.type.startsWith("image/"),
      );
      const file = item?.getAsFile();
      if (file) onImageFile(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- commit: burn then place ----
  const commit = async () => {
    if (!connected || !publicKey) return setStatus("Connect your wallet first.");
    if (!TOKEN_MINT) return setStatus("Token mint not configured on the server.");
    if (!claim) return setStatus("Claim a region first.");

    const trimmedName = nameInput.trim();
    if (!trimmedName) return setStatus("Enter your name before placing.");
    const trimmedLink = noLink ? "" : linkInput.trim();
    if (!noLink && !trimmedLink)
      return setStatus("Add a link, or check “no link”.");

    setBusy(true);
    try {
      // Pre-check the cooldown so we don't burn tokens only to be rejected.
      const wallet = publicKey.toBase58();
      const cd = await fetch(`/api/cooldown?wallet=${wallet}`, { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => ({ remainingMs: 0 }));
      if (cd.remainingMs > 0) {
        const mins = Math.ceil(cd.remainingMs / 60000);
        setStatus(`Wallet on cooldown — try again in ${mins} min.`);
        setBusy(false);
        return;
      }

      // The memo is the on-chain source of truth for name + region + link.
      const memo = JSON.stringify({
        name: trimmedName,
        link: trimmedLink || null,
        region: { x: claim.x, y: claim.y, w: claim.w, h: claim.h },
      });

      setStatus(`Burning ${cost} $PIXEL for your ${claim.w}×${claim.h} region...`);
      // Burn covers the whole selected area, not just what you drew.
      const signature = await burnForPixels(
        connection,
        publicKey,
        claimArea,
        memo,
        (tx, conn) => sendTransaction(tx, conn),
      );

      setStatus("Burn confirmed. Saving your region...");
      const pixels = Array.from(pending.entries()).map(([k, c]) => {
        const [x, y] = k.split(",").map(Number);
        return { x, y, color: c };
      });

      const res = await fetch("/api/place", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature, wallet, pixels }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to place region.");

      for (const [k, c] of pending) committed.current.set(k, c);
      regionsRef.current = [
        ...regionsRef.current,
        {
          x: claim.x,
          y: claim.y,
          w: claim.w,
          h: claim.h,
          sig: signature,
          owner: publicKey.toBase58(),
          creator: trimmedName,
          link: trimmedLink || null,
        },
      ];
      setPending(new Map());
      setLinkInput("");
      setClaim(null);
      setTool("select");
      setLastTx(signature);
      setStatus(
        `Region placed — eternalized on-chain forever. You can draw again in ${COOLDOWN_MIN} minutes.`,
      );
      draw();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const resetRegion = () => {
    setClaim(null);
    setPending(new Map());
    setTool("select");
    setStatus("");
    firstCornerRef.current = null;
    selectingRef.current = null;
  };

  // Frame the whole board, centered in the viewport.
  const fitToBoard = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const cw = wrap.clientWidth;
    const ch = wrap.clientHeight;
    const scale = Math.min(cw / CANVAS_WIDTH, ch / CANVAS_HEIGHT) * 0.92;
    setView({
      scale,
      ox: (cw - CANVAS_WIDTH * scale) / 2,
      oy: (ch - CANVAS_HEIGHT * scale) / 2,
    });
  }, []);

  const tools: { id: Tool; label: string; icon: string; needsClaim: boolean }[] =
    useMemo(
      () => [
        { id: "select", label: "Select region", icon: "⬚", needsClaim: false },
        { id: "draw", label: "Draw", icon: "✎", needsClaim: true },
        { id: "line", label: "Line", icon: "╱", needsClaim: true },
        { id: "rect", label: "Rectangle", icon: "▭", needsClaim: true },
        { id: "ellipse", label: "Circle", icon: "◯", needsClaim: true },
        { id: "erase", label: "Erase", icon: "⌫", needsClaim: true },
        { id: "pan", label: "Pan / move", icon: "✋", needsClaim: false },
      ],
      [],
    );

  const btn = (active: boolean, disabled = false): React.CSSProperties => ({
    padding: "8px 0",
    borderRadius: 4,
    border: "1px solid #cfcfcf",
    background: active ? "#2B4DFF" : "#fff",
    color: active ? "#fff" : disabled ? "#bbb" : "#222",
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 13,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", background: "#fff", color: "#1a1a1a" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 20,
          padding: "12px 20px",
          background: "#fff",
          borderBottom: "1px solid #ececf0",
          boxShadow: "0 2px 0 0 rgba(43,77,255,0.12)",
        }}
      >
        <Brand size={15} />
        <span
          style={{
            fontFamily: "var(--font-pixel)",
            fontSize: 9,
            color: "#b6b6c2",
            whiteSpace: "nowrap",
          }}
        >
          1 PX = {TOKENS_PER_PIXEL} $PIXEL
        </span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          <TokenAddress />
          <WalletMultiButton />
        </div>
      </header>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* toolbar */}
        <aside
          style={{
            width: 230,
            padding: 16,
            background: "#fafafa",
            borderRight: "1px solid #e3e3e3",
            display: "flex",
            flexDirection: "column",
            gap: 14,
            fontSize: 14,
            overflowY: "auto",
          }}
        >
          {!claim && (
            <div
              style={{
                background: "#fff7e6",
                border: "1px solid #ffd591",
                borderRadius: 4,
                padding: "8px 10px",
                fontSize: 12,
                lineHeight: 1.5,
              }}
            >
              <strong>Step 1.</strong> Use <em>Select</em> to claim a region — drag,
              or click two opposite corners (max {MAX_CLAIM_SIZE}×{MAX_CLAIM_SIZE}).
              You can only draw inside your claimed region.
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 6,
            }}
          >
            {tools.map((t) => {
              const disabled = t.needsClaim && !claim;
              return (
                <button
                  key={t.id}
                  onClick={() => !disabled && setTool(t.id)}
                  disabled={disabled}
                  title={t.label}
                  aria-label={t.label}
                  style={{
                    ...btn(tool === t.id, disabled),
                    aspectRatio: "1",
                    fontSize: 20,
                    lineHeight: 1,
                    padding: 0,
                  }}
                >
                  {t.icon}
                </button>
              );
            })}
          </div>

          {claim && (
            <div style={{ fontSize: 12, color: "#555" }}>
              Region: <strong>{claim.w}×{claim.h}</strong> at ({claim.x}, {claim.y})
              <button
                onClick={resetRegion}
                style={{ ...btn(false), width: "100%", marginTop: 6 }}
              >
                New region
              </button>
            </div>
          )}

          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            Color
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              style={{ width: "100%", height: 34, border: "1px solid #ddd", background: "#fff" }}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {isShapeTool && !fillShape ? "Line / outline width" : "Brush size"}: {brush}px
            <input
              type="range"
              min={1}
              max={20}
              value={brush}
              onChange={(e) => setBrush(Number(e.target.value))}
            />
          </label>

          {(tool === "rect" || tool === "ellipse") && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={fillShape}
                onChange={(e) => setFillShape(e.target.checked)}
              />
              Fill shape
            </label>
          )}

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              padding: 12,
              borderRadius: 8,
              border: "1px dashed #9DB2FF",
              background: "#f1f4ff",
            }}
          >
            <span style={{ fontWeight: 700, color: "#2B4DFF", fontSize: 13 }}>
              🖼 Paste a photo
            </span>
            <label
              style={{
                display: "block",
                textAlign: "center",
                padding: "10px 0",
                borderRadius: 6,
                background: "#2B4DFF",
                color: "#fff",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {hasStamp ? "Replace image" : "Upload image"}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onImageFile(f);
                }}
                style={{ display: "none" }}
              />
            </label>
            {hasStamp && (
              <>
                <button
                  onClick={() => claim && setTool("image")}
                  disabled={!claim}
                  style={btn(tool === "image", !claim)}
                >
                  {tool === "image" ? "Click canvas to place" : "Place image"}
                </button>
                <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  Image width: {stampWidth}px
                  <input
                    type="range"
                    min={1}
                    max={300}
                    value={stampWidth}
                    onChange={(e) => setStampWidth(Number(e.target.value))}
                  />
                </label>
              </>
            )}
            <small style={{ opacity: 0.6 }}>Or paste (Ctrl+V) an image.</small>
          </div>

          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
            ✍️ Your name <span style={{ color: "#e0245e" }}>*</span>
            <input
              type="text"
              placeholder="e.g. satoshi"
              maxLength={40}
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              style={{
                padding: "8px 10px",
                borderRadius: 6,
                border: "1px solid #ddd",
                fontSize: 13,
              }}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
            🔗 Link
            <input
              type="url"
              inputMode="url"
              placeholder="https://your-site.com"
              value={linkInput}
              disabled={noLink}
              onChange={(e) => setLinkInput(e.target.value)}
              style={{
                padding: "8px 10px",
                borderRadius: 6,
                border: "1px solid #ddd",
                fontSize: 13,
                background: noLink ? "#f1f1f4" : "#fff",
                color: noLink ? "#aaa" : "#222",
              }}
            />
            <label style={{ display: "flex", alignItems: "center", gap: 6, opacity: 0.8 }}>
              <input
                type="checkbox"
                checked={noLink}
                onChange={(e) => setNoLink(e.target.checked)}
              />
              I don&rsquo;t want to add a link
            </label>
          </label>

          <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 13, lineHeight: 1.6 }}>
              Region: <strong>{claim ? `${claim.w}×${claim.h} = ${claimArea}` : 0}</strong> px
              <br />
              Drawn: <strong>{drawnCount}</strong> px
              <br />
              Cost: <strong>{cost}</strong> $PIXEL <span style={{ opacity: 0.6 }}>(whole region)</span>
            </div>
            <button
              onClick={() => setPending(new Map())}
              disabled={drawnCount === 0 || busy}
              style={btn(false, drawnCount === 0 || busy)}
            >
              Clear drawing
            </button>
            <button
              onClick={commit}
              disabled={busy || !claim}
              style={{
                padding: "11px 0",
                borderRadius: 4,
                border: "none",
                background: busy || !claim ? "#bbb" : "#2B4DFF",
                color: "#fff",
                fontWeight: 700,
                cursor: busy || !claim ? "default" : "pointer",
              }}
            >
              {busy ? "Working..." : "Burn & Place"}
            </button>
            <small style={{ color: "#8a8a96", lineHeight: 1.4 }}>
              ⛓ Burning is permanent — your art is eternalized on-chain forever.
              <br />⏱ Each wallet can draw again every {COOLDOWN_MIN} minutes.
            </small>
            {status && (
              <div style={{ fontSize: 12, color: "#444", wordBreak: "break-word" }}>
                {status}
              </div>
            )}
            {lastTx && (
              <a
                href={explorerTxUrl(lastTx)}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 12, color: "#2B4DFF", fontWeight: 600 }}
              >
                View burn tx on Solscan ↗
              </a>
            )}
          </div>
        </aside>

        {/* canvas */}
        <div
          ref={wrapRef}
          onMouseLeave={clearTooltip}
          style={{ flex: 1, position: "relative", overflow: "hidden", background: "#f3f3f3" }}
        >
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onWheel={onWheel}
            style={{
              width: "100%",
              height: "100%",
              display: "block",
              cursor: tooltip
                ? "pointer"
                : tool === "pan"
                  ? "grab"
                  : tool === "select"
                    ? "cell"
                    : "crosshair",
              touchAction: "none",
            }}
          />
          <button
            onClick={fitToBoard}
            title="Fit the whole board to the screen"
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              padding: "7px 12px",
              borderRadius: 8,
              border: "1px solid #d9d9e0",
              background: "rgba(255,255,255,0.95)",
              color: "#333",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
              zIndex: 9,
            }}
          >
            ⊡ Fit
          </button>
          {!showGuide && (
            <button
              onClick={() => setShowGuide(true)}
              title="Show the guide"
              style={{
                position: "absolute",
                top: 12,
                left: 12,
                padding: "7px 12px",
                borderRadius: 8,
                border: "1px solid #d9d9e0",
                background: "rgba(255,255,255,0.95)",
                color: "#2B4DFF",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
                zIndex: 9,
              }}
            >
              ❔ How it works
            </button>
          )}
          {tooltip && (
            <div
              style={{
                position: "absolute",
                left: tooltip.x + 12,
                top: tooltip.y + 12,
                maxWidth: 300,
                padding: "8px 11px",
                borderRadius: 6,
                background: "rgba(20,20,30,0.95)",
                color: "#fff",
                fontSize: 12,
                lineHeight: 1.6,
                pointerEvents: "auto",
                zIndex: 10,
              }}
            >
              <div style={{ fontWeight: 700 }}>
                {tooltip.info.creator || "Anonymous"}
              </div>
              <div style={{ color: "#7AA0FF", fontWeight: 600, fontSize: 11 }}>
                ⛓ Eternalized on-chain
              </div>
              {tooltip.info.link && (
                <a
                  href={tooltip.info.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "block",
                    color: "#7cc4ff",
                    textDecoration: "underline",
                    fontWeight: 600,
                    maxWidth: 280,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  🔗 {tooltip.info.link}
                </a>
              )}
              {tooltip.info.sig && (
                <a
                  href={explorerTxUrl(tooltip.info.sig)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: "block", color: "#9DB2FF", textDecoration: "underline" }}
                >
                  burn tx: {short(tooltip.info.sig)} ↗
                </a>
              )}
              {tooltip.info.owner && (
                <a
                  href={explorerAddressUrl(tooltip.info.owner)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: "block", color: "#9fb6ff", textDecoration: "underline" }}
                >
                  wallet: {short(tooltip.info.owner)} ↗
                </a>
              )}
            </div>
          )}
        </div>

        {/* right-side guide */}
        {showGuide && (
        <aside
          style={{
            width: 280,
            flexShrink: 0,
            padding: 18,
            background: "#fafafa",
            borderLeft: "1px solid #e3e3e3",
            overflowY: "auto",
            fontSize: 13,
            lineHeight: 1.6,
            color: "#333",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 14,
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-pixel)",
                fontSize: 13,
                color: "#2B4DFF",
              }}
            >
              How it works
            </span>
            <button
              onClick={() => setShowGuide(false)}
              title="Hide the guide"
              style={{
                border: "1px solid #d9d9e0",
                background: "#fff",
                borderRadius: 6,
                padding: "3px 8px",
                fontSize: 12,
                cursor: "pointer",
                color: "#666",
              }}
            >
              Hide ✕
            </button>
          </div>

          {[
            {
              n: "1",
              t: "Connect your wallet",
              d: "Use the Connect button (top-right). You need $PIXEL tokens in a Solana wallet (Phantom/Solflare).",
            },
            {
              n: "2",
              t: "Select a region",
              d: `With the ⬚ Select tool, drag a rectangle — or click two opposite corners. Max ${MAX_CLAIM_SIZE}×${MAX_CLAIM_SIZE}px. You can't overlap an area someone already claimed.`,
            },
            {
              n: "3",
              t: "Make your art",
              d: "Draw inside your region with the tools below, or upload/paste an image. Pick a color and brush size.",
            },
            {
              n: "4",
              t: "Add your name + link",
              d: "Your name is required. A website link is optional (check the box to skip it).",
            },
            {
              n: "5",
              t: "Burn & Place",
              d: `Burning costs ${TOKENS_PER_PIXEL} $PIXEL per pixel of the whole selected region. The tokens are destroyed and your art is eternalized on-chain — forever, uneditable. Each wallet can draw again every ${COOLDOWN_MIN} minutes.`,
            },
          ].map((s) => (
            <div key={s.n} style={{ display: "flex", gap: 10, marginBottom: 12 }}>
              <div
                style={{
                  flexShrink: 0,
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: "#2B4DFF",
                  color: "#fff",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                }}
              >
                {s.n}
              </div>
              <div>
                <strong>{s.t}</strong>
                <div style={{ color: "#666" }}>{s.d}</div>
              </div>
            </div>
          ))}

          <div style={{ fontWeight: 700, margin: "18px 0 8px" }}>Tools</div>
          {[
            ["⬚", "Select", "Claim a rectangular region (drag or two clicks)."],
            ["✎", "Draw", "Free-draw pixel by pixel with the chosen color/brush."],
            ["╱", "Line", "Straight line between two points."],
            ["▭", "Rectangle", "Outline or filled box (toggle “Fill shape”)."],
            ["◯", "Circle", "Outline or filled ellipse."],
            ["⌫", "Erase", "Remove pending pixels before burning."],
            ["✋", "Pan", "Move around the board (or hold Shift + drag)."],
          ].map(([icon, name, desc]) => (
            <div key={name} style={{ display: "flex", gap: 9, marginBottom: 8 }}>
              <span style={{ width: 18, textAlign: "center", flexShrink: 0 }}>{icon}</span>
              <div>
                <strong>{name}</strong>
                <div style={{ color: "#666" }}>{desc}</div>
              </div>
            </div>
          ))}

          <div
            style={{
              marginTop: 14,
              padding: "10px 12px",
              borderRadius: 8,
              background: "#0b0b12",
              color: "#fff",
              fontSize: 12,
            }}
          >
            <strong style={{ color: "#7AA0FF" }}>⛓ Eternalized on-chain.</strong>{" "}
            Every drawing is a real Solana burn tx. Hover any art to see its tx and
            open it on Solscan.
          </div>

          <Link
            href="/docs"
            style={{
              display: "inline-block",
              marginTop: 14,
              color: "#2B4DFF",
              fontWeight: 600,
            }}
          >
            Full docs →
          </Link>
        </aside>
        )}
      </div>

      <footer
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "8px 20px",
          background: "#fafafa",
          borderTop: "1px solid #ececf0",
          fontSize: 12,
          color: "#8a8a96",
        }}
      >
        <span>The Million Solana Homepage</span>
        <span style={{ opacity: 0.4 }}>·</span>
        <Link href="/gallery" style={{ color: "#2B4DFF", fontWeight: 600 }}>
          Gallery
        </Link>
        <span style={{ opacity: 0.4 }}>·</span>
        <Link href="/docs" style={{ color: "#2B4DFF", fontWeight: 600 }}>
          How it works / Docs
        </Link>
        <span style={{ opacity: 0.4 }}>·</span>
        <a
          href="https://x.com/MillionSolHome"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#1a1a1a", fontWeight: 600 }}
        >
          𝕏 @MillionSolHome
        </a>
        <span style={{ marginLeft: "auto", opacity: 0.7 }}>
          Burn $PIXEL to own pixels forever.
        </span>
      </footer>
    </div>
  );
}

function insideRect(x: number, y: number, r: Rect) {
  return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
}

// Bresenham line between two integer points.
function linePixels(x0: number, y0: number, x1: number, y1: number): number[][] {
  const pts: number[][] = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    pts.push([x, y]);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return pts;
}
