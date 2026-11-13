/**
 * Camera controls for the read-only `<scxml-view>` diagram.
 *
 * `<scxml-view>` renders its diagram inside an open shadow root and applies
 * its own "scale down to fit" transform when the chart is wider than the
 * viewport. The monitor wants continuous zoom/pan instead, so this module
 * disables that auto-fit and owns the transform on the shadow `.diagram`.
 *
 * The pure helpers (`zoomTransform`, `fitTransform`) are exported so the
 * camera math can be tested without a DOM.
 */

export const MIN_SCALE = 0.3;
export const MAX_SCALE = 3;
export const FIT_MAX_SCALE = 1.5;
export const FIT_PADDING = 16;
export const DRAG_THRESHOLD = 4;

const WHEEL_ZOOM_SPEED = 0.0015;
const INTERACTIVE = 'button, a, input, select, textarea, label, summary, [role="button"]';

export function clampScale(value, min = MIN_SCALE, max = MAX_SCALE) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Zoom around a point in viewport coordinates (relative to the canvas).
 * The world point under the cursor stays under the cursor.
 */
export function zoomTransform(current, px, py, factor, min = MIN_SCALE, max = MAX_SCALE) {
  const scale = clampScale(current.scale * factor, min, max);
  if (scale === current.scale) return { scale, tx: current.tx, ty: current.ty };
  const ratio = scale / current.scale;
  return {
    scale,
    tx: px - (px - current.tx) * ratio,
    ty: py - (py - current.ty) * ratio,
  };
}

/** Fit a content box into a viewport, centered and with padding. */
export function fitTransform(contentWidth, contentHeight, viewWidth, viewHeight, options = {}) {
  if (!(contentWidth > 0) || !(contentHeight > 0) || !(viewWidth > 0) || !(viewHeight > 0)) return null;
  const padding = options.padding ?? FIT_PADDING;
  const min = options.min ?? MIN_SCALE;
  const max = Math.min(options.max ?? MAX_SCALE, options.maxFit ?? FIT_MAX_SCALE);
  const availableWidth = Math.max(1, viewWidth - padding * 2);
  const availableHeight = Math.max(1, viewHeight - padding * 2);
  const scale = clampScale(Math.min(availableWidth / contentWidth, availableHeight / contentHeight), min, max);
  return {
    scale,
    tx: (viewWidth - contentWidth * scale) / 2,
    ty: (viewHeight - contentHeight * scale) / 2,
  };
}

/**
 * Attach camera behavior to a `<scxml-view>` element.
 *
 * Returns an object with `attach`, `detach`, `fit`, `reset`, `zoomBy` and
 * `getScale`. The element must have an open shadow root with `.canvas` and
 * `.diagram` (the current `@tinyactors/scxmljs` view structure). `attach`
 * returns false when that structure is not available, so callers can fall
 * back to the old fixed-zoom behavior.
 */
export function createCamera(view, options = {}) {
  const minScale = options.minScale ?? MIN_SCALE;
  const maxScale = options.maxScale ?? MAX_SCALE;
  const maxFitScale = options.maxFitScale ?? FIT_MAX_SCALE;
  const padding = options.padding ?? FIT_PADDING;
  const onChange = typeof options.onChange === 'function' ? options.onChange : null;

  let canvas = null;
  let diagram = null;
  let scale = 1;
  let tx = 0;
  let ty = 0;
  let userAdjusted = false;
  let attached = false;
  let resizeObserver = null;
  let frame = 0;
  let drag = null;

  function ensure() {
    if (!view || !view.shadowRoot) return false;
    const nextCanvas = view.shadowRoot.querySelector('.canvas');
    const nextDiagram = view.shadowRoot.querySelector('.diagram');
    if (!nextCanvas || !nextDiagram) return false;
    if (nextCanvas !== canvas || nextDiagram !== diagram) {
      canvas = nextCanvas;
      diagram = nextDiagram;
      canvas.style.overflow = 'hidden';
      diagram.style.margin = '0';
      diagram.style.transformOrigin = '0 0';
      view.style.setProperty('--scxml-min-scale', '1');
      view.style.removeProperty('zoom');
    }
    return true;
  }

  function apply() {
    if (!ensure()) return;
    // `#applyFit()` in `<scxml-view>` removes transform-origin when it scales
    // back to 1; keep our camera anchored to the diagram's top-left corner.
    diagram.style.transformOrigin = '0 0';
    diagram.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    if (onChange) onChange(scale);
  }

  function contentSize() {
    if (!ensure()) return null;
    const width = diagram.offsetWidth || diagram.scrollWidth;
    const height = diagram.offsetHeight || diagram.scrollHeight;
    return width > 0 && height > 0 ? { width, height } : null;
  }

  function fit() {
    const content = contentSize();
    if (!content) return false;
    const next = fitTransform(content.width, content.height, canvas.clientWidth, canvas.clientHeight, {
      padding,
      min: minScale,
      max: maxScale,
      maxFit: maxFitScale,
    });
    if (!next) return false;
    scale = next.scale;
    tx = next.tx;
    ty = next.ty;
    userAdjusted = false;
    apply();
    return true;
  }

  function centerAt(nextScale) {
    const content = contentSize();
    if (!content) return false;
    scale = clampScale(nextScale, minScale, maxScale);
    tx = (canvas.clientWidth - content.width * scale) / 2;
    ty = (canvas.clientHeight - content.height * scale) / 2;
    apply();
    return true;
  }

  function reset() {
    const content = contentSize();
    if (!content) return;
    userAdjusted = true;
    centerAt(1);
  }

  function zoomAt(px, py, factor) {
    if (!ensure()) return;
    const next = zoomTransform({ scale, tx, ty }, px, py, factor, minScale, maxScale);
    if (next.scale === scale) return;
    scale = next.scale;
    tx = next.tx;
    ty = next.ty;
    userAdjusted = true;
    apply();
  }

  function zoomBy(factor) {
    if (!ensure()) return;
    zoomAt(canvas.clientWidth / 2, canvas.clientHeight / 2, factor);
  }

  function panBy(dx, dy) {
    if (!ensure()) return;
    tx += dx;
    ty += dy;
    userAdjusted = true;
    apply();
  }

  function onWheel(event) {
    if (!ensure()) return;
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1;
    const dx = event.deltaX * unit;
    const dy = event.deltaY * unit;
    if (event.ctrlKey || event.metaKey) {
      const rect = canvas.getBoundingClientRect();
      zoomAt(event.clientX - rect.left, event.clientY - rect.top, Math.exp(-dy * WHEEL_ZOOM_SPEED));
      return;
    }
    panBy(-dx, -dy);
  }

  function isInteractive(event) {
    return event.composedPath().some((node) => {
      return node instanceof Element && node.matches(INTERACTIVE);
    });
  }

  function stopDrag() {
    if (!drag) return;
    drag = null;
    view.classList.remove('scxml-panning');
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
  }

  function onPointerDown(event) {
    if ((event.button !== 0 && event.button !== 1) || isInteractive(event)) return;
    if (!ensure()) return;
    event.preventDefault();
    drag = { x: event.clientX, y: event.clientY, tx, ty, moved: false };
    view.classList.add('scxml-panning');
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    try {
      view.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic pointer events and some browsers do not allow capture.
    }
  }

  function onPointerMove(event) {
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    drag.moved = true;
    tx = drag.tx + dx;
    ty = drag.ty + dy;
    userAdjusted = true;
    apply();
  }

  function onPointerUp(event) {
    if (!drag) return;
    try {
      if (event.pointerId != null) view.releasePointerCapture(event.pointerId);
    } catch {
      // No capture was taken.
    }
    stopDrag();
  }

  function schedule(recenter) {
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (recenter && !userAdjusted) fit();
        else apply();
      });
    });
  }

  function onLoad() {
    userAdjusted = false;
    schedule(true);
  }

  function onResize() {
    schedule(!userAdjusted);
  }

  function attach() {
    if (attached) return true;
    if (!ensure()) return false;
    attached = true;
    view.addEventListener('wheel', onWheel, { passive: false });
    view.addEventListener('pointerdown', onPointerDown);
    view.addEventListener('scxml-load', onLoad);
    window.addEventListener('blur', stopDrag);
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(onResize);
      resizeObserver.observe(view);
    }
    schedule(true);
    return true;
  }

  function detach() {
    if (!attached) return;
    attached = false;
    stopDrag();
    view.removeEventListener('wheel', onWheel);
    view.removeEventListener('pointerdown', onPointerDown);
    view.removeEventListener('scxml-load', onLoad);
    window.removeEventListener('blur', stopDrag);
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    if (frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  }

  return {
    attach,
    detach,
    fit,
    reset,
    zoomBy,
    getScale: () => scale,
    isAttached: () => attached,
  };
}
