import { app } from "../../scripts/app.js";

const PAD      = 10;
const CURVE_H  = 140;
const XYPAD_H  = 130;
const BTN_H    = 26;
const WIDGET_H = BTN_H + CURVE_H + XYPAD_H + PAD * 4;

const CURVE_MIN = 0.01, CURVE_MAX = 10.0;
const SHIFT_MIN = 0.01, SHIFT_MAX = 20.0;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const norm  = (v, lo, hi) => clamp((v - lo) / (hi - lo), 0, 1);

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function computeSigmas(steps, denoise, sigmaMin, shift, curve) {
    const n = Math.max(1, parseInt(steps, 10));
    return Array.from({ length: n + 1 }, (_, i) => {
        let t = i / n;
        if (Math.abs(curve - 1.0) > 0.001) t = Math.pow(t, curve);
        if (Math.abs(shift - 1.0) > 0.001) t = t / (t + shift * (1.0 - t));
        return denoise * (1.0 - t) + sigmaMin * t;
    });
}

function hideWidget(node, widget) {
    if (!widget) return;
    widget.type        = "hidden_klein";
    widget.computeSize = () => [0, -4];
}

app.registerExtension({
    name: "Comfy.KleinEditSchedulerGraph",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "FlowMatchSchedulerKleinEdit") return;

        const _onNodeCreated = nodeType.prototype.onNodeCreated;

        nodeType.prototype.onNodeCreated = function () {
            const result = _onNodeCreated?.apply(this, arguments);
            const node   = this;
            const W      = (name) => node.widgets?.find(w => w.name === name);

            setTimeout(() => {
                hideWidget(node, W("draw_mode"));
                // custom_sigmas stays visible so the user can type values in draw mode

                // Hook: when the user edits custom_sigmas, parse it and update dots (draw mode only)
                const csw = W("custom_sigmas");
                if (csw) {
                    const _orig = csw.callback;
                    csw.callback = function(value) {
                        _orig?.call(this, value);
                        if (drawMode) {
                            try {
                                const vals = JSON.parse(value ?? "[]");
                                if (Array.isArray(vals) && vals.length >= 2) {
                                    const n = vals.length - 1;
                                    dots = vals.map((sigma, i) => ({ t: i / n, sigma }));
                                    node.setDirtyCanvas(true, true);
                                }
                            } catch (e) { /* invalid JSON — ignore */ }
                        }
                    };
                }

                node.setSize(node.computeSize());
                node.setDirtyCanvas(true, true);
            }, 0);

            // ── State ─────────────────────────────────────────────────────────
            let drawMode   = false;
            // Each dot: { t: 0..1 (x position), sigma: float }
            let dots       = null;
            let dragIdx    = -1;
            let dragAxis   = null;   // "y" | "xy"
            let xyDragging = false;

            function syncModeWidget() {
                const w = W("draw_mode");
                if (w) { w.value = drawMode ? "draw" : "parametric"; w.callback?.(w.value); }
            }

            function syncSigmasWidget() {
                const w = W("custom_sigmas");
                if (w && dots) {
                    const vals = JSON.stringify(dots.map(d => +d.sigma.toFixed(4)));
                    w.value = vals;
                    w.callback?.(vals);
                }
            }

            function seedDots() {
                const steps    = parseInt(W("steps")?.value ?? 4, 10);
                const denoise  = parseFloat(W("denoise")?.value ?? 1.0);
                const sigmaMin = parseFloat(W("sigma_min")?.value ?? 0.0);
                const shift    = parseFloat(W("shift")?.value ?? 1.0);
                const curve    = parseFloat(W("curve")?.value ?? 1.0);
                const sigmas   = computeSigmas(steps, denoise, sigmaMin, shift, curve);
                const n        = sigmas.length - 1;
                dots = sigmas.map((sigma, i) => ({ t: i / n, sigma }));
            }

            // ── Widget ────────────────────────────────────────────────────────
            const gw = {
                name: "klein_graph",
                type: "custom_graph",
                _btnBounds:   null,
                _curveBounds: null,
                _padBounds:   null,
                _screenDots:  [],   // screen {x,y} per dot, filled during draw

                computeSize(width) { return [width, WIDGET_H]; },

                draw(ctx, node, width, y) {
                    const shift    = parseFloat(W("shift")?.value ?? 1.0);
                    const curve    = parseFloat(W("curve")?.value ?? 1.0);
                    const steps    = parseInt(W("steps")?.value ?? 4, 10);
                    const denoise  = parseFloat(W("denoise")?.value ?? 1.0);
                    const sigmaMin = parseFloat(W("sigma_min")?.value ?? 0.0);
                    const iW       = width - PAD * 2;

                    if (drawMode && (!dots || dots.length !== steps + 1)) {
                        seedDots();
                        syncSigmasWidget();
                    }

                    const maxSigma = Math.max(denoise, 1.0);

                    // ── Toggle button ─────────────────────────────────────────
                    const bX = PAD, bY = y + PAD, bW = iW, bH = BTN_H - 4;
                    this._btnBounds = { x: bX, y: bY, w: bW, h: bH };
                    roundRect(ctx, bX, bY, bW, bH, 4);
                    ctx.fillStyle   = drawMode ? "#3a1a6a" : "#1a1a2e";
                    ctx.fill();
                    ctx.strokeStyle = drawMode ? "#8b6fff" : "#3a3a5a";
                    ctx.lineWidth   = 1.5; ctx.stroke();
                    ctx.fillStyle   = drawMode ? "#c8b8ff" : "#6655aa";
                    ctx.font        = "bold 10px monospace";
                    ctx.textAlign   = "center";
                    ctx.fillText(
                        drawMode ? "✏  DRAW MODE  — click for parametric"
                                 : "⚙  PARAMETRIC  — click to draw",
                        bX + bW / 2, bY + bH * 0.68
                    );
                    ctx.textAlign = "left";

                    // ── Curve panel ───────────────────────────────────────────
                    const cX = PAD, cY = bY + bH + 6, cW = iW, cH = CURVE_H;
                    this._curveBounds = { x: cX, y: cY, w: cW, h: cH };

                    ctx.fillStyle   = "#0d0d1a";
                    ctx.strokeStyle = drawMode ? "#4a2a8a" : "#2e2e4a";
                    ctx.lineWidth   = 1;
                    roundRect(ctx, cX, cY, cW, cH, 5); ctx.fill(); ctx.stroke();

                    // Grid
                    ctx.strokeStyle = "#1c1c30"; ctx.lineWidth = 0.5;
                    for (let i = 1; i < 4; i++) {
                        const gx = cX + (cW / 4) * i, gy = cY + (cH / 4) * i;
                        ctx.beginPath(); ctx.moveTo(gx, cY + 1); ctx.lineTo(gx, cY + cH - 1); ctx.stroke();
                        ctx.beginPath(); ctx.moveTo(cX + 1, gy); ctx.lineTo(cX + cW - 1, gy); ctx.stroke();
                    }

                    const activeDots = drawMode
                        ? dots
                        : computeSigmas(steps, denoise, sigmaMin, shift, curve)
                              .map((sigma, i, arr) => ({ t: i / (arr.length - 1), sigma }));

                    const n   = activeDots.length - 1;
                    const spx = d => cX + d.t * cW;
                    const spy = d => cY + cH - clamp(d.sigma / maxSigma, 0, 1) * (cH - 8) - 4;

                    // Gradient fill
                    const grad = ctx.createLinearGradient(0, cY, 0, cY + cH);
                    grad.addColorStop(0, drawMode ? "rgba(160,80,255,0.35)" : "rgba(120,80,255,0.35)");
                    grad.addColorStop(1, "rgba(0,0,0,0)");
                    ctx.fillStyle = grad;
                    ctx.beginPath();
                    activeDots.forEach((d, i) => i === 0 ? ctx.moveTo(spx(d), spy(d)) : ctx.lineTo(spx(d), spy(d)));
                    ctx.lineTo(cX + cW, cY + cH); ctx.lineTo(cX, cY + cH);
                    ctx.closePath(); ctx.fill();

                    // Curve line
                    ctx.beginPath();
                    ctx.strokeStyle = drawMode ? "#b06fff" : "#8b6fff";
                    ctx.lineWidth   = 2;
                    activeDots.forEach((d, i) => i === 0 ? ctx.moveTo(spx(d), spy(d)) : ctx.lineTo(spx(d), spy(d)));
                    ctx.stroke();

                    // Dots
                    this._screenDots = [];
                    activeDots.forEach((d, i) => {
                        const px = spx(d), py = spy(d);
                        this._screenDots.push({ x: px, y: py });

                        const isFirst = i === 0, isLast = i === n;
                        const isEdge  = isFirst || isLast;

                        let r, fill, stroke;
                        if (!drawMode) {
                            r = 3; fill = "#b39dff"; stroke = "transparent";
                        } else if (isEdge) {
                            r = 6;
                            fill   = dragIdx === i ? "#ffffff" : "#50c8f0";
                            stroke = "#ffffff";
                        } else {
                            r = 7;
                            fill   = dragIdx === i ? "#ffffff" : "#b06fff";
                            stroke = "#ffffff";
                        }

                        ctx.fillStyle   = fill;
                        ctx.strokeStyle = stroke;
                        ctx.lineWidth   = 1.2;
                        ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
                        if (drawMode) ctx.stroke();

                        if (drawMode && dragIdx === i) {
                            ctx.fillStyle = "rgba(255,255,255,0.6)";
                            ctx.font      = "8px monospace";
                            ctx.textAlign = "center";
                            ctx.fillText(isEdge ? "↕" : "✛", px, py - r - 3);
                            ctx.textAlign = "left";
                        }
                    });

                    // Labels
                    ctx.fillStyle = drawMode ? "#6644aa" : "#6655aa";
                    ctx.font      = "bold 9px monospace";
                    if (drawMode) {
                        ctx.fillText("✏  teal=edges(↕)  purple=middle(↕↔)", cX + 6, cY + 13);
                    } else {
                        ctx.fillText("σ SCHEDULE", cX + 6, cY + 13);
                    }
                    ctx.fillStyle = "#4a4a6a"; ctx.font = "9px monospace";
                    ctx.fillText(`${denoise.toFixed(2)}`,  cX + 3,       cY + 13);
                    ctx.fillText(`${sigmaMin.toFixed(2)}`, cX + 3,       cY + cH - 4);
                    ctx.fillText(`steps: ${steps}`,        cX + cW - 52, cY + 13);

                    // ── XY pad / draw readout ─────────────────────────────────
                    const pX = PAD, pY = cY + cH + PAD, pW = iW, pH = XYPAD_H - PAD;
                    this._padBounds = drawMode ? null : { x: pX, y: pY, w: pW, h: pH };

                    ctx.fillStyle   = "#0d0d1a";
                    ctx.strokeStyle = "#2e2e4a"; ctx.lineWidth = 1;
                    roundRect(ctx, pX, pY, pW, pH, 5); ctx.fill(); ctx.stroke();

                    if (!drawMode) {
                        ctx.strokeStyle = "#1c1c30"; ctx.lineWidth = 0.5;
                        for (let i = 1; i < 5; i++) {
                            const gx = pX + (pW / 5) * i, gy = pY + (pH / 4) * i;
                            ctx.beginPath(); ctx.moveTo(gx, pY + 1); ctx.lineTo(gx, pY + pH - 1); ctx.stroke();
                            ctx.beginPath(); ctx.moveTo(pX + 1, gy); ctx.lineTo(pX + pW - 1, gy); ctx.stroke();
                        }
                        ctx.fillStyle = "#4a4a6a"; ctx.font = "9px monospace";
                        ctx.fillText("curve 0.01", pX + 4, pY + pH - 5);
                        ctx.fillText("10.0", pX + pW - 26, pY + pH - 5);
                        ctx.save();
                        ctx.translate(pX + 10, pY + pH / 2 + 18);
                        ctx.rotate(-Math.PI / 2);
                        ctx.fillText("shift 20 ↑", 0, 0);
                        ctx.restore();

                        const dotX = pX + norm(curve, CURVE_MIN, CURVE_MAX) * pW;
                        const dotY = pY + pH - norm(shift, SHIFT_MIN, SHIFT_MAX) * pH;

                        ctx.strokeStyle = "rgba(139,111,255,0.25)"; ctx.lineWidth = 1;
                        ctx.setLineDash([3, 4]);
                        ctx.beginPath(); ctx.moveTo(dotX, pY + 1); ctx.lineTo(dotX, pY + pH - 1); ctx.stroke();
                        ctx.beginPath(); ctx.moveTo(pX + 1, dotY); ctx.lineTo(pX + pW - 1, dotY); ctx.stroke();
                        ctx.setLineDash([]);

                        const glow = ctx.createRadialGradient(dotX, dotY, 0, dotX, dotY, 14);
                        glow.addColorStop(0, "rgba(139,111,255,0.4)"); glow.addColorStop(1, "rgba(0,0,0,0)");
                        ctx.fillStyle = glow;
                        ctx.beginPath(); ctx.arc(dotX, dotY, 14, 0, Math.PI * 2); ctx.fill();

                        ctx.fillStyle = "#8b6fff"; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.5;
                        ctx.beginPath(); ctx.arc(dotX, dotY, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

                        ctx.fillStyle = "#8b6fff"; ctx.font = "bold 10px monospace";
                        ctx.fillText(`curve: ${curve.toFixed(2)}   shift: ${shift.toFixed(2)}`, pX + 6, pY + 14);
                        ctx.fillStyle = "#2e2e50"; ctx.font = "8px monospace";
                        ctx.fillText("← front-loaded", pX + 4, pY + 26);
                        ctx.fillText("end-loaded →",   pX + pW - 65, pY + 26);

                    } else {
                        // ── Draw mode readout ─────────────────────────────────
                        ctx.fillStyle = "#6644aa"; ctx.font = "bold 9px monospace";
                        ctx.fillText("DRAWN SIGMAS  (saved to workflow)", pX + 6, pY + 14);

                        if (dots) {
                            const show = dots.slice(0, 9);
                            show.forEach((d, i) => {
                                const tx = pX + 10 + i * ((pW - 20) / Math.max(show.length - 1, 1));
                                const ty = pY + pH / 2 + 8;
                                ctx.textAlign = "center";
                                ctx.fillStyle = (i === 0 || i === show.length - 1) ? "#50c8f0" : "#8b6fff";
                                ctx.font = "9px monospace";
                                ctx.fillText(d.sigma.toFixed(3), tx, ty);
                                ctx.fillStyle = "#3a2a6a";
                                ctx.beginPath(); ctx.arc(tx, ty - 14, 3, 0, Math.PI * 2); ctx.fill();
                            });
                            ctx.textAlign = "left";
                            if (dots.length > 9) {
                                ctx.fillStyle = "#555577"; ctx.font = "8px monospace";
                                ctx.fillText(`+${dots.length - 9} more`, pX + pW - 50, pY + pH / 2 + 8);
                            }
                        }
                        ctx.fillStyle = "#3a3a5a"; ctx.font = "8px monospace";
                        ctx.fillText("teal dots update denoise/sigma_min sliders", pX + 6, pY + pH - 6);
                    }
                },

                mouse(event, pos, node) {
                    const [mx, my] = pos;

                    // ── Toggle button ─────────────────────────────────────────
                    if (event.type === "pointerdown" && this._btnBounds) {
                        const { x, y, w, h } = this._btnBounds;
                        if (mx >= x && mx <= x + w && my >= y && my <= y + h) {
                            drawMode = !drawMode;
                            if (drawMode) { seedDots(); syncSigmasWidget(); }
                            syncModeWidget();
                            node.setDirtyCanvas(true, true);
                            return true;
                        }
                    }

                    // ── Draw mode dot dragging ────────────────────────────────
                    if (drawMode && this._curveBounds && dots) {
                        const { x: cX, y: cY, w: cW, h: cH } = this._curveBounds;
                        const denoise  = parseFloat(W("denoise")?.value ?? 1.0);
                        const sigmaMin = parseFloat(W("sigma_min")?.value ?? 0.0);
                        const maxSigma = Math.max(denoise, 1.0);
                        const n        = dots.length - 1;

                        if (event.type === "pointerdown") {
                            let best = -1, bestDist = 16;
                            this._screenDots.forEach((pt, i) => {
                                const d = Math.hypot(mx - pt.x, my - pt.y);
                                if (d < bestDist) { bestDist = d; best = i; }
                            });
                            dragIdx  = best;
                            dragAxis = (dragIdx === 0 || dragIdx === n) ? "y" : "xy";
                            return dragIdx >= 0;
                        }

                        if (event.type === "pointerup" || event.type === "pointercancel") {
                            dragIdx = -1; dragAxis = null; return false;
                        }

                        if (event.type === "pointermove" && dragIdx >= 0) {
                            const isFirst = dragIdx === 0, isLast = dragIdx === n;

                            // ── Y: update sigma ───────────────────────────────
                            const rawNorm = clamp((cY + cH - my - 4) / (cH - 8), 0, 1);
                            let newSigma  = rawNorm * maxSigma;

                            newSigma = clamp(newSigma, 0, maxSigma);
                            dots[dragIdx].sigma = +newSigma.toFixed(4);

                            if (isFirst) {
                                const dw = W("denoise");
                                if (dw) { dw.value = +newSigma.toFixed(3); dw.callback?.(dw.value); }
                            }
                            if (isLast) {
                                const sw = W("sigma_min");
                                if (sw) { sw.value = +newSigma.toFixed(3); sw.callback?.(sw.value); }
                            }

                            // ── X: update t (horizontal spacing) ─────────────
                            if (dragAxis === "xy") {
                                const rawT = clamp((mx - cX) / cW, 0, 1);
                                const loT = dots[dragIdx - 1]?.t ?? 0;
                                const hiT = dots[dragIdx + 1]?.t ?? 1;
                                const gap = Math.max(0.02, 1 / (dots.length * 4));
                                dots[dragIdx].t = +clamp(rawT, loT + gap, hiT - gap).toFixed(4);
                            }

                            syncSigmasWidget();
                            node.setDirtyCanvas(true, true);
                            return true;
                        }
                    }

                    // ── Parametric XY pad ─────────────────────────────────────
                    if (!drawMode && this._padBounds) {
                        const { x: pX, y: pY, w: pW, h: pH } = this._padBounds;
                        const inPad = mx >= pX && mx <= pX + pW && my >= pY && my <= pY + pH;

                        if (event.type === "pointerdown") {
                            xyDragging = inPad; if (!inPad) return false;
                        }
                        if (event.type === "pointerup" || event.type === "pointercancel") {
                            xyDragging = false; return false;
                        }
                        if (xyDragging) {
                            const nx = clamp((mx - pX) / pW, 0, 1);
                            const ny = clamp((my - pY) / pH, 0, 1);
                            const nC = +(CURVE_MIN + nx * (CURVE_MAX - CURVE_MIN)).toFixed(2);
                            const nS = +(SHIFT_MIN + (1 - ny) * (SHIFT_MAX - SHIFT_MIN)).toFixed(2);
                            const cWw = W("curve"), sWw = W("shift");
                            if (cWw) { cWw.value = nC; cWw.callback?.(nC); }
                            if (sWw) { sWw.value = nS; sWw.callback?.(nS); }
                            node.setDirtyCanvas(true, true);
                            return true;
                        }
                    }

                    return false;
                },

                serializeValue() { return undefined; },
            };

            if (!node.widgets) node.widgets = [];
            node.widgets.push(gw);
            node.setSize(node.computeSize());

            // ── Restore state after page refresh ─────────────────────────────
            const origConfigure = node.onConfigure?.bind(node);
            node.onConfigure = function(config) {
                origConfigure?.(config);
                setTimeout(() => {
                    const mw = W("draw_mode");
                    const sw = W("custom_sigmas");

                    if (mw && mw.value === "draw") {
                        drawMode = true;
                        try {
                            const vals = JSON.parse(sw?.value ?? "[]");
                            if (Array.isArray(vals) && vals.length >= 2) {
                                const n = vals.length - 1;
                                dots = vals.map((sigma, i) => ({ t: i / n, sigma }));
                            }
                        } catch (e) {
                            dots = null;
                        }
                    } else {
                        drawMode = false;
                        dots = null;
                    }

                    node.setDirtyCanvas(true, true);
                }, 0);
            };

            return result;
        };
    },
});
