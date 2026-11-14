// RPForge Texture Studio — 3D preview panel (second panel, can float on another monitor).
// Renders the open model with RPForge's own software renderer and keeps the texture being
// painted in sync with the Photoshop document.
const { render } = require('./engine/index.js');

const DEFAULT_CAMERA = { yaw: 3.79, pitch: 0.22, distance: 2.55, panX: 0, panY: 0 };
const MAX_PIXELS = 1280 * 900;   // still frames
const FAST_PIXELS = 260000;       // frames drawn while the camera moves
const RANK = { fine: 0, full: 1, fast: 2 };

function createPreview(deps) {
  // deps: { $, imaging, getSession, getActiveLink, readDocumentTexture, markOnTexture, setStatus? }
  const { $ } = deps;
  const stage = $('pvStage'), img = $('pvImage'), empty = $('pvEmpty'), status = $('pvStatus');
  const view = { scene: null, sessionRef: null, cam: { ...DEFAULT_CAMERA }, frame: null, pending: null, busy: false, mode: 'full', picking: false, highlight: false, lastHistory: null, liveName: null };

  const say = text => { status.textContent = text; };
  const defaultHint = 'Arraste para girar · Shift + arraste move · roda aproxima · clique duplo centraliza';

  // ---------------- scene ----------------
  function ensureScene() {
    const session = deps.getSession();
    if (session !== view.sessionRef) {
      view.sessionRef = session; view.scene = null; view.liveName = null; view.lastHistory = null;
      if (session && session.hasModel) {
        try { view.scene = session.scene(); } catch (e) { say('Não foi possível montar o 3D: ' + e.message); }
        view.cam = { ...DEFAULT_CAMERA };
      }
    }
    const has = !!(view.scene && view.scene.meshes.length);
    empty.classList.toggle('hidden', has);
    img.classList.toggle('hidden', !has);
    $('pvTitle').textContent = has && session.model ? 'Prévia 3D' : 'Prévia 3D';
    return has;
  }

  // ---------------- rendering ----------------
  function stageSize() {
    let w = Math.round(stage.clientWidth || stage.offsetWidth || 480), h = Math.round(stage.clientHeight || stage.offsetHeight || 360);
    w = Math.max(64, w); h = Math.max(64, h);
    const k = Math.min(1, Math.sqrt(MAX_PIXELS / (w * h)));
    return { w: Math.round(w * k), h: Math.round(h * k), cssW: w, cssH: h };
  }

  const visible = () => (deps.isVisible ? deps.isVisible() : true);
  function schedule(mode = 'full') {
    if (mode !== 'fine') clearTimeout(view.fineTimer);
    if (!view.pending || RANK[mode] > RANK[view.mode]) view.mode = mode;
    if (view.pending) return;
    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : f => setTimeout(f, 16);
    view.pending = raf(async () => { view.pending = null; await draw(); });
  }

  async function draw() {
    if (!visible()) { view.stale = true; return; }
    if (view.busy) { schedule(view.mode); return; }
    if (!ensureScene()) return;
    view.busy = true; view.stale = false;
    try {
      const { w, h, cssW, cssH } = stageSize();
      // Moving: a fixed pixel budget and the simplified mesh. Still: full resolution with soft
      // edges, then — only when that was cheap — a 2x supersampled pass on top.
      const mode = view.mode, fast = mode === 'fast', fine = mode === 'fine';
      const scale = fast ? Math.min(0.5, Math.sqrt(FAST_PIXELS / (w * h))) : fine ? 2 : 1;
      const W = Math.max(32, Math.round(w * scale)), H = Math.max(32, Math.round(h * scale));
      const link = deps.getActiveLink();
      const frame = render.render(view.scene, view.cam, W, H, { quality: fast ? 'fast' : 'full', smooth: !fine, focus: view.highlight && link ? link.texture : null });
      view.frame = { ...frame, scaleX: W / cssW, scaleY: H / cssH };
      const shown = fine ? halve(frame.rgba, W, H) : { rgba: frame.rgba, w: W, h: H };
      if (mode === 'full' && frame.time * 4 < 100) view.fineTimer = setTimeout(() => schedule('fine'), 400);
      img.src = await toImageUrl(shown.rgba, shown.w, shown.h);
      img.style.width = cssW + 'px'; img.style.height = cssH + 'px';
      if (!view.picking && status.dataset.sticky !== '1') say(`${defaultHint} · ${view.scene.triangles.toLocaleString('pt-BR')} triângulos · ${frame.time} ms`);
    } catch (e) { say('Erro na prévia: ' + e.message); }
    finally { view.busy = false; }
  }

  // 2x2 box downsample (supersampling resolve).
  function halve(rgba, w, h) {
    const nw = w >> 1, nh = h >> 1, out = new Uint8Array(nw * nh * 4);
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
      const a = ((y * 2) * w + x * 2) * 4, b = a + 4, c = a + w * 4, d = c + 4, o = (y * nw + x) * 4;
      for (let k = 0; k < 4; k++) out[o + k] = (rgba[a + k] + rgba[b + k] + rgba[c + k] + rgba[d + k] + 2) >> 2;
    }
    return { rgba: out, w: nw, h: nh };
  }

  // Photoshop's own JPEG encoder when available (fast), else our PNG.
  async function toImageUrl(rgba, w, h) {
    const imaging = deps.imaging;
    if (imaging && imaging.encodeImageData && imaging.createImageDataFromBuffer) {
      try {
        const data = await imaging.createImageDataFromBuffer(rgba, { width: w, height: h, components: 4, chunky: true, colorSpace: 'RGB', colorProfile: 'sRGB IEC61966-2.1' });
        try {
          const b64 = await imaging.encodeImageData({ imageData: data, base64: true });
          if (typeof b64 === 'string' && b64.length) return b64.startsWith('data:') ? b64 : 'data:image/jpeg;base64,' + b64;
        } finally { try { data.dispose(); } catch {} }
      } catch { /* fall back */ }
    }
    return render.toPngDataUrl(rgba, w, h);
  }

  // ---------------- live texture from the Photoshop document ----------------
  async function refreshTexture(force) {
    if (!ensureScene()) return;
    const link = deps.getActiveLink();
    if (!link) return;
    let history = null;
    try { history = deps.historyKey(); } catch {}
    if (!force && history && history === view.lastHistory && view.liveName === link.texture) return;
    try {
      const tex = await deps.readDocumentTexture(1024);
      if (!tex) return;
      view.scene.setTexture(link.texture, tex);
      view.lastHistory = history; view.liveName = link.texture;
      schedule('full');
    } catch (e) { say('Não foi possível ler o documento: ' + e.message); }
  }

  // ---------------- interaction ----------------
  let drag = null;
  const pos = e => {
    const r = stage.getBoundingClientRect ? stage.getBoundingClientRect() : { left: 0, top: 0 };
    return { x: (e.clientX - r.left), y: (e.clientY - r.top) };
  };
  stage.addEventListener('mousedown', e => {
    if (!view.scene) return;
    const p = pos(e);
    drag = { x: p.x, y: p.y, moved: false, pan: e.shiftKey || e.button === 1 || e.button === 2, cam: { ...view.cam } };
    if (e.preventDefault) e.preventDefault();
  });
  const onMove = e => {
    if (!drag) return;
    const p = pos(e), dx = p.x - drag.x, dy = p.y - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    if (!drag.moved) return;
    const size = Math.max(200, stage.clientHeight || 360);
    if (drag.pan) {
      const k = 2 * Math.tan(19 * Math.PI / 180) * view.cam.distance / size;
      view.cam.panX = drag.cam.panX - dx * k; view.cam.panY = drag.cam.panY + dy * k;
    } else {
      view.cam.yaw = drag.cam.yaw - dx * 0.008;
      view.cam.pitch = Math.max(-1.5, Math.min(1.5, drag.cam.pitch + dy * 0.008));
    }
    schedule('fast');
  };
  const onUp = e => {
    if (!drag) return;
    const wasClick = !drag.moved;
    drag = null;
    if (wasClick && view.picking) pickAt(pos(e)); else schedule('full');
  };
  stage.addEventListener('mousemove', onMove);
  stage.addEventListener('mouseup', onUp);
  stage.addEventListener('mouseleave', () => { if (drag) { drag = null; schedule('full'); } });
  stage.addEventListener('wheel', e => {
    if (!view.scene) return;
    const delta = e.deltaY || e.wheelDelta * -1 || 0;
    view.cam.distance = Math.max(0.4, Math.min(20, view.cam.distance * Math.exp(delta * 0.0015)));
    schedule('fast'); clearTimeout(view.wheelTimer); view.wheelTimer = setTimeout(() => schedule('full'), 180);
    if (e.preventDefault) e.preventDefault();
  });
  stage.addEventListener('dblclick', () => { view.cam = { ...DEFAULT_CAMERA }; schedule('full'); });

  async function pickAt(p) {
    if (!view.frame) return;
    const hit = render.pick(view.scene, view.frame, p.x * view.frame.scaleX, p.y * view.frame.scaleY);
    if (!hit) { say('Nada nesse ponto. Clique em cima do modelo.'); return; }
    const link = deps.getActiveLink();
    const uses = name => link && name && name.toLowerCase() === link.texture.toLowerCase();
    let uv = null;
    if (uses(hit.livery) && hit.uv1) uv = hit.uv1; else if (uses(hit.diffuse) && hit.uv0) uv = hit.uv0;
    if (!uv) {
      const other = hit.diffuse || hit.livery;
      say(other ? `Essa parte usa a textura “${other}”. Abra-a no painel Texture Studio para marcar o ponto.` : 'Essa parte não usa a textura aberta.');
      return;
    }
    const u = uv[0] - Math.floor(uv[0]), v = uv[1] - Math.floor(uv[1]);
    try {
      const where = await deps.markOnTexture(u, v);
      say(`Ponto marcado na textura: ${where}. As guias do Photoshop mostram o lugar.`);
    } catch (e) { say(`Ponto na textura: ${(u * 100).toFixed(1)}% × ${(v * 100).toFixed(1)}% (${e.message})`); }
  }

  // ---------------- toolbar ----------------
  $('pvRefresh').addEventListener('click', () => { view.sessionRef = null; refreshTexture(true); schedule('full'); });
  $('pvReset').addEventListener('click', () => { view.cam = { ...DEFAULT_CAMERA }; schedule('full'); });
  $('pvAxis').addEventListener('click', () => {
    if (!view.scene) return;
    view.scene.setUp(view.scene.up === 'z' ? 'y' : 'z'); view.cam = { ...DEFAULT_CAMERA }; schedule('full');
  });
  $('pvPick').addEventListener('click', () => {
    view.picking = !view.picking;
    $('pvPick').classList.toggle('on', view.picking);
    say(view.picking ? 'Clique em um ponto do modelo para marcar o lugar na textura.' : defaultHint);
  });
  $('pvFocus').addEventListener('click', () => { view.highlight = !view.highlight; $('pvFocus').classList.toggle('on', view.highlight); schedule('full'); });

  // Live loop: document changes (history) refresh the texture; panel resizes re-render.
  let lastSize = '';
  const timer = setInterval(() => {
    if (!visible() || (!view.scene && !deps.getSession())) return;
    if (view.stale) schedule('full');
    const s = `${stage.clientWidth}x${stage.clientHeight}`;
    if (s !== lastSize) { lastSize = s; schedule('full'); }
    if ($('pvLive').checked) refreshTexture(false);
  }, 700);
  if (timer && timer.unref) timer.unref(); // Node tests: never keep the process alive

  return {
    dispose() { clearInterval(timer); },
    sessionChanged() { view.sessionRef = null; schedule('full'); },
    linkChanged() { view.lastHistory = null; refreshTexture(true); },
    redraw: () => schedule('full'),
    shown() { view.lastHistory = null; schedule('full'); },
    state: view,
  };
}

module.exports = { createPreview, DEFAULT_CAMERA };
