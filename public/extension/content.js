/**
 * Main initialization function to build and inject the drawing panel UI into the DOM.
 * Checks if the target area exists and prevents duplicate injections.
 * Creates all UI elements including the toolbar, color presets, tool buttons,
 * weight popover, and the canvas container, before setting up the drawing engine.
 */
function injectDrawingPanel() {
  const solutionArea = document.getElementById('solutionarea');

  if (!solutionArea || document.getElementById('csbs-drawing-panel-wrapper')) {
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.id = 'csbs-drawing-panel-wrapper';
  wrapper.className = 'csbs-drawing-panel-wrapper';

  // Creating the Header where all the colors, tools, and stroke weight selector are located.
  const header = document.createElement('div');
  header.className = 'csbs-drawing-panel-header';

  const controls = document.createElement('div');
  controls.className = 'csbs-drawing-panel-controls';

  // Internal state variables for the UI
  let activeTool = 'pen';
  let currentColor = '#000000';
  let currentWeight = 2;

  const sliderPopover = document.createElement('div');
  sliderPopover.className = 'csbs-weight-popover';
  sliderPopover.style.display = 'none';

  const topRow = document.createElement('div');
  topRow.className = 'csbs-weight-popover-top';

  const sliderInput = document.createElement('input');
  sliderInput.type = 'range';
  sliderInput.min = '1';
  sliderInput.max = '20';
  sliderInput.value = currentWeight;

  const numberInput = document.createElement('input');
  numberInput.type = 'number';
  numberInput.min = '1';
  numberInput.max = '20';
  numberInput.value = currentWeight;
  numberInput.className = 'csbs-weight-number-input';

  const globalWeightContainer = document.createElement('div');
  globalWeightContainer.className = 'csbs-global-weight-container';
  globalWeightContainer.setAttribute('aria-label', 'Stroke Thickness');
  globalWeightContainer.setAttribute('data-tooltip', 'Stroke Thickness');

  const globalWeightInput = document.createElement('input');
  globalWeightInput.type = 'number';
  globalWeightInput.min = '1';
  globalWeightInput.max = '20';
  globalWeightInput.value = currentWeight;
  globalWeightInput.className = 'csbs-global-weight-input';
  globalWeightInput.title = 'Stroke Weight';

  const globalWeightLabel = document.createElement('span');
  globalWeightLabel.textContent = 'px';
  globalWeightLabel.className = 'csbs-global-weight-label';

  globalWeightContainer.appendChild(globalWeightInput);
  globalWeightContainer.appendChild(globalWeightLabel);

  topRow.appendChild(sliderInput);
  topRow.appendChild(numberInput);

  const bottomRow = document.createElement('div');
  bottomRow.className = 'csbs-weight-popover-bottom';

  const okBtn = document.createElement('button');
  okBtn.textContent = 'Okay';
  okBtn.className = 'csbs-weight-ok-btn';

  bottomRow.appendChild(okBtn);

  sliderPopover.appendChild(topRow);
  sliderPopover.appendChild(bottomRow);

  // Synchronizes the value across the three different weight inputs
  const syncWeight = (val) => {
    let w = parseInt(val, 10);
    if (isNaN(w) || w < 1) w = 1;
    if (w > 20) w = 20;
    currentWeight = w;
    sliderInput.value = w;
    numberInput.value = w;
    globalWeightInput.value = w;
  };

  sliderInput.addEventListener('input', (e) => {
    syncWeight(e.target.value);
  });

  numberInput.addEventListener('input', (e) => {
    syncWeight(e.target.value);
  });

  globalWeightInput.addEventListener('input', (e) => {
    syncWeight(e.target.value);
  });

  okBtn.addEventListener('click', (e) => {
    e.preventDefault();
    sliderPopover.style.display = 'none';
  });

  // Set up preset color swatches
  const presetsContainer = document.createElement('div');
  presetsContainer.className = 'csbs-color-presets';

  const presetColors = ['#000000', '#FF0000', '#0000FF', '#008000', '#FFA500'];
  const presetSwatches = [];

  presetColors.forEach(color => {
    const swatch = document.createElement('div');
    swatch.className = 'csbs-color-swatch';
    swatch.style.backgroundColor = color;
    if (color === currentColor) swatch.classList.add('active');

    swatch.addEventListener('click', () => {
      currentColor = color;
      presetSwatches.forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');
    });

    presetSwatches.push(swatch);
    presetsContainer.appendChild(swatch);
  });

  // Utility function to create button elements with embedded SVG icons
  const createToolBtn = (id, text, svgPath) => {
    const btn = document.createElement('button');
    btn.id = id;
    btn.setAttribute('aria-label', text); // Accessibility: screen readers
    btn.setAttribute('data-tooltip', text); // Accessibility: custom visual hover tooltip
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svgPath}</svg>`;
    return btn;
  };

  // Creating the Select Button
  const selectBtn = createToolBtn(
    'csbs-select-btn',
    'Select',
    '<path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="M13 13l6 6"/>');

  // Creating the Lock/Unlock Button
  const lockBtn = createToolBtn(
    'csbs-lock-btn',
    'Lock/Unlock',
    '<rect x="7" y="11" width="10" height="10" rx="2" ry="2"/><path d="M11 15v2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>');

  // Creating the Pen Button
  const penBtn = createToolBtn(
    'csbs-pen-btn',
    'Pen',
    '<path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/>');
  // Setting the Pen Button as the default active tool
  penBtn.className = 'active';

  // Creating the Line Button
  const lineBtn = createToolBtn(
    'csbs-line-btn',
    'Line',
    '<line x1="4" y1="20" x2="20" y2="4"/>');

  // Creating the Rectangle Button
  const rectBtn = createToolBtn(
    'csbs-rect-btn',
    'Rectangle',
    '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>');

  // Creating the Oval Button
  const ovalBtn = createToolBtn(
    'csbs-oval-btn',
    'Oval',
    '<ellipse cx="12" cy="12" rx="10" ry="6"/>');

  // Creating the Text Button
  const textBtn = createToolBtn(
    'csbs-text-btn',
    'Text',
    '<path d="M4 7V4h16v3M12 4v16M8 20h8"/>');

  // Creating the Eraser Button
  const eraserBtn = createToolBtn(
    'csbs-eraser-btn',
    'Eraser',
    '<path d="M20 20H7L3 16C2.5 15.5 2.5 14.5 3 14L13 4C13.5 3.5 14.5 3.5 15 4L20 9C20.5 9.5 20.5 10.5 20 11L11 20H20V20Z"/>');

  // Creating the Clear Button
  const clearBtn = createToolBtn(
    'csbs-clear-btn',
    'Clear',
    '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>');

  // Creating the Save Button
  const saveBtn = createToolBtn(
    'csbs-save-btn',
    'Save PNG',
    '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>');

  // Creating the Undo Button
  const undoBtn = createToolBtn(
    'csbs-undo-btn',
    'Undo (Ctrl+Z)',
    '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>');

  // Creating the Redo Button
  const redoBtn = createToolBtn(
    'csbs-redo-btn',
    'Redo (Ctrl+Y)',
    '<path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/>');

  // Appending the buttons to the controls container
  controls.appendChild(presetsContainer);
  controls.appendChild(globalWeightContainer);
  controls.appendChild(undoBtn);
  controls.appendChild(redoBtn);
  controls.appendChild(selectBtn);
  controls.appendChild(lockBtn);
  controls.appendChild(penBtn);
  controls.appendChild(lineBtn);
  controls.appendChild(rectBtn);
  controls.appendChild(ovalBtn);
  controls.appendChild(textBtn);
  controls.appendChild(eraserBtn);
  controls.appendChild(clearBtn);
  controls.appendChild(saveBtn);

  header.appendChild(controls);

  const canvasContainer = document.createElement('div');
  canvasContainer.className = 'csbs-drawing-canvas-container';

  const canvas = document.createElement('canvas');
  canvas.className = 'csbs-drawing-canvas';
  canvas.width = 600;
  canvas.height = 400;
  
  const resizeObserver = new ResizeObserver(entries => {
    for (let entry of entries) {
      if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
        canvas.width = entry.contentRect.width;
        canvas.height = entry.contentRect.height;
        if (typeof redraw === 'function') redraw();
      }
    }
  });
  resizeObserver.observe(canvasContainer);

  canvasContainer.appendChild(canvas);
  wrapper.appendChild(header);
  wrapper.appendChild(sliderPopover);
  wrapper.appendChild(canvasContainer);
  solutionArea.parentNode.insertBefore(wrapper, solutionArea.nextSibling);
  setupCanvas(canvas, canvasContainer, { undoBtn, redoBtn, selectBtn, lockBtn, penBtn, lineBtn, rectBtn, ovalBtn, textBtn, eraserBtn, clearBtn, saveBtn }, () => activeTool, (t) => activeTool = t, () => currentColor, () => currentWeight, sliderPopover, wrapper, header);
}

/**
 * Calculates the shortest distance between a point (p) and a line segment defined by points (a, b).
 * This mathematical utility is used extensively for precise hit-detection
 * (e.g., determining if the mouse clicked on or erased a drawn path/line).
 * 
 * @param {Object} p - The point to check {x, y}.
 * @param {Object} a - The start point of the line segment {x, y}.
 * @param {Object} b - The end point of the line segment {x, y}.
 * @returns {number} The distance in pixels.
 */
function getPointToSegmentDistance(p, a, b) {
  // Calculate the squared length of the line segment from 'a' to 'b'
  const segmentLengthSquared = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;

  // If the segment has zero length (points 'a' and 'b' are the same),
  // simply return the distance from point 'p' to point 'a'.
  if (segmentLengthSquared === 0) {
    return Math.sqrt((p.x - a.x) ** 2 + (p.y - a.y) ** 2);
  }

  // Calculate the projection parameter 't' of the point 'p' onto the line.
  // This uses the dot product of vector (a->p) and vector (a->b).
  let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / segmentLengthSquared;

  // Clamp 't' to the range [0, 1] so the projection falls strictly within the segment's bounds.
  t = Math.max(0, Math.min(1, t));

  // Find the exact coordinates of the closest point on the segment to our point 'p'
  const closestPointX = a.x + t * (b.x - a.x);
  const closestPointY = a.y + t * (b.y - a.y);

  // Return the distance between 'p' and that closest point
  return Math.sqrt((p.x - closestPointX) ** 2 + (p.y - closestPointY) ** 2);
}

/**
 * Core drawing engine setup. Initializes the canvas 2D context, state variables,
 * and attaches all primary event listeners for mouse and keyboard interactions.
 * 
 * @param {HTMLCanvasElement} canvas - The canvas element to draw on.
 * @param {HTMLElement} container - The wrapper element containing the canvas.
 * @param {Object} ui - Dictionary containing references to UI buttons (undoBtn, penBtn, etc).
 * @param {Function} getTool - Function returning the currently active tool ID.
 * @param {Function} setTool - Function to update the currently active tool ID.
 * @param {Function} getColor - Function returning the currently active hex color.
 * @param {Function} getWeight - Function returning the currently active stroke weight.
 */
function setupCanvas(canvas, container, ui, getTool, setTool, getColor, getWeight, sliderPopover, wrapper, header) {
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Canvas state
  let isDrawing = false;
  let strokes = [];          // Array of all finalized drawn objects
  let currentStroke = null;  // The object currently being drawn
  let textInputActive = false;

  // Selection & drag state
  let selectedStrokes = [];
  let dragState = null;

  // Undo/Redo history stacks
  let undoHistory = [];
  let redoHistory = [];
  let pendingHistoryState = null;

  /**
   * Helper function to create a deep copy of an array of strokes,
   * necessary to ensure historical states aren't mutated by reference.
   * @param {Array} arr - The strokes array to clone.
   * @returns {Array} A deep clone of the strokes.
   */
  function deepCloneStrokes(arr) {
    return JSON.parse(JSON.stringify(arr));
  }

  /**
   * Pushes the current strokes state onto the undo stack.
   * Limits the history to 50 entries to prevent memory leaks and clears the redo stack.
   */
  function saveState() {
    undoHistory.push(deepCloneStrokes(strokes));
    if (undoHistory.length > 50) undoHistory.shift();
    redoHistory = [];
    updateUndoRedoUI();
  }

  /**
   * Reverts the canvas to the previous state in the undo history stack.
   * Saves the current state to the redo stack.
   */
  function performUndo() {
    if (undoHistory.length > 0) {
      redoHistory.push(deepCloneStrokes(strokes));
      strokes = undoHistory.pop();
      selectedStrokes = [];
      redraw();
      updateUndoRedoUI();
    }
  }

  /**
   * Restores the canvas to a future state from the redo history stack.
   * Pushes the current state back to the undo stack.
   */
  function performRedo() {
    if (redoHistory.length > 0) {
      undoHistory.push(deepCloneStrokes(strokes));
      strokes = redoHistory.pop();
      selectedStrokes = [];
      redraw();
      updateUndoRedoUI();
    }
  }

  /**
   * Updates the visual opacity and cursor styles of the Undo and Redo toolbar buttons
   * based on whether there is available history to traverse.
   */
  function updateUndoRedoUI() {
    ui.undoBtn.style.opacity = undoHistory.length > 0 ? '1' : '0.5';
    ui.undoBtn.style.cursor = undoHistory.length > 0 ? 'pointer' : 'not-allowed';
    ui.redoBtn.style.opacity = redoHistory.length > 0 ? '1' : '0.5';
    ui.redoBtn.style.cursor = redoHistory.length > 0 ? 'pointer' : 'not-allowed';
  }
  updateUndoRedoUI();

  ui.undoBtn.addEventListener('click', (e) => { e.preventDefault(); performUndo(); });
  ui.redoBtn.addEventListener('click', (e) => { e.preventDefault(); performRedo(); });

  /**
   * Computes the bounding box {minX, maxX, minY, maxY} for a single stroke object.
   * The calculation differs based on the shape type (path, rect, oval, line, or text).
   * 
   * @param {Object} s - The stroke object to calculate the bounds for.
   * @returns {Object|null} The bounding box coordinates, or null if invalid.
   */
  function getSingleBoundingBox(s) {
    if (!s) return null;
    let minX, maxX, minY, maxY;
    if (s.type === 'path') {
      if (!s.points || s.points.length === 0) return null;
      minX = s.points[0].x; maxX = s.points[0].x;
      minY = s.points[0].y; maxY = s.points[0].y;
      for (let pt of s.points) {
        if (pt.x < minX) minX = pt.x;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.y > maxY) maxY = pt.y;
      }
    } else if (s.type === 'rect' || s.type === 'oval' || s.type === 'line') {
      if (!s.start || !s.end) return null;
      minX = Math.min(s.start.x, s.end.x);
      maxX = Math.max(s.start.x, s.end.x);
      minY = Math.min(s.start.y, s.end.y);
      maxY = Math.max(s.start.y, s.end.y);
    } else if (s.type === 'text') {
      ctx.font = (s.fontSize || 20) + 'px Arial';
      const w = ctx.measureText(s.text).width;
      const h = s.fontSize || 20;
      minX = s.pos.x; maxX = s.pos.x + w;
      minY = s.pos.y - h; maxY = s.pos.y;
    } else {
      return null;
    }
    return { minX, maxX, minY, maxY };
  }

  /**
   * Calculates the overall bounding box encompassing a group of strokes.
   * Iterates through all selected strokes to find the maximum extents, adding a small padding.
   * 
   * @param {Array} arr - An array of stroke objects.
   * @returns {Object|null} The combined bounding box with slight padding.
   */
  function getBoundingBox(arr) {
    if (!arr || arr.length === 0) return null;
    let rx1 = Infinity, rx2 = -Infinity, ry1 = Infinity, ry2 = -Infinity;
    for (let s of arr) {
      let b = getSingleBoundingBox(s);
      if (b) {
        rx1 = Math.min(rx1, b.minX);
        rx2 = Math.max(rx2, b.maxX);
        ry1 = Math.min(ry1, b.minY);
        ry2 = Math.max(ry2, b.maxY);
      }
    }
    if (rx1 === Infinity) return null;
    return { minX: rx1 - 4, maxX: rx2 + 4, minY: ry1 - 4, maxY: ry2 + 4 };
  }

  /**
   * Given a bounding box, returns an array of corner node coordinates.
   * Used to render resize handles and determine which handle is being dragged.
   * Also stores the "fixed" opposite corner used as the origin during scaling.
   * 
   * @param {Object} box - The bounding box object.
   * @returns {Array} An array of objects representing the four corners.
   */
  function getCornerNodes(box) {
    if (!box) return [];
    return [
      { id: 'TL', x: box.minX, y: box.minY, fixed: { x: box.maxX, y: box.maxY } },
      { id: 'TR', x: box.maxX, y: box.minY, fixed: { x: box.minX, y: box.maxY } },
      { id: 'BL', x: box.minX, y: box.maxY, fixed: { x: box.maxX, y: box.minY } },
      { id: 'BR', x: box.maxX, y: box.maxY, fixed: { x: box.minX, y: box.minY } }
    ];
  }

  /**
   * Renders a single stroke object onto the canvas 2D context.
   * Handles paths (freehand), rectangles, ovals (ellipses), straight lines, and text.
   * Applies the stroke's saved color, weight, and positional data.
   * 
   * @param {Object} s - The stroke object to draw.
   */
  function drawStroke(s) {
    if (!s) return;
    if (s.type === 'text') {
      ctx.fillStyle = s.color;
      ctx.font = (s.fontSize || 20) + 'px Arial';
      ctx.fillText(s.text, s.pos.x, s.pos.y);
      return;
    }

    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.weight || 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();

    if (s.type === 'path' && s.points.length > 1) {
      ctx.moveTo(s.points[0].x, s.points[0].y);
      for (let i = 1; i < s.points.length; i++) {
        ctx.lineTo(s.points[i].x, s.points[i].y);
      }
      ctx.stroke();
    } else if (s.type === 'rect' && s.end) {
      const w = s.end.x - s.start.x;
      const h = s.end.y - s.start.y;
      ctx.rect(s.start.x, s.start.y, w, h);
      ctx.stroke();
    } else if (s.type === 'oval' && s.end) {
      const rx = Math.abs(s.end.x - s.start.x) / 2;
      const ry = Math.abs(s.end.y - s.start.y) / 2;
      const cx = Math.min(s.start.x, s.end.x) + rx;
      const cy = Math.min(s.start.y, s.end.y) + ry;
      if (ctx.ellipse) {
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      } else {
        ctx.rect(s.start.x, s.start.y, s.end.x - s.start.x, s.end.y - s.start.y);
      }
      ctx.stroke();
    } else if (s.type === 'line' && s.end) {
      ctx.moveTo(s.start.x, s.start.y);
      ctx.lineTo(s.end.x, s.end.y);
      ctx.stroke();
    }
  }

  /**
   * Collision detection logic to determine if a given coordinate interacts with a stroke.
   * Used when clicking to select an object or when using the eraser tool.
   * 
   * @param {Object} p - The mouse coordinate {x, y}.
   * @param {Object} stroke - The stroke object to test against.
   * @param {number} radius - The hit-tolerance radius (in pixels).
   * @returns {boolean} True if the point 'hits' the stroke, false otherwise.
   */
  function checkHitStroke(p, stroke, radius) {
    if (stroke.type === 'path') {
      for (let j = 0; j < stroke.points.length - 1; j++) {
        if (getPointToSegmentDistance(p, stroke.points[j], stroke.points[j + 1]) <= radius) {
          return true;
        }
      }
    } else if (stroke.type === 'rect') {
      const lines = [
        { a: { x: stroke.start.x, y: stroke.start.y }, b: { x: stroke.end.x, y: stroke.start.y } },
        { a: { x: stroke.end.x, y: stroke.start.y }, b: { x: stroke.end.x, y: stroke.end.y } },
        { a: { x: stroke.end.x, y: stroke.end.y }, b: { x: stroke.start.x, y: stroke.end.y } },
        { a: { x: stroke.start.x, y: stroke.end.y }, b: { x: stroke.start.x, y: stroke.start.y } }
      ];
      for (let line of lines) {
        if (getPointToSegmentDistance(p, line.a, line.b) <= radius) return true;
      }
    } else if (stroke.type === 'oval') {
      const rx = Math.max(0.1, Math.abs(stroke.end.x - stroke.start.x) / 2);
      const ry = Math.max(0.1, Math.abs(stroke.end.y - stroke.start.y) / 2);
      const cx = Math.min(stroke.start.x, stroke.end.x) + rx;
      const cy = Math.min(stroke.start.y, stroke.end.y) + ry;
      const nx = (p.x - cx) / rx;
      const ny = (p.y - cy) / ry;
      const nd = Math.sqrt(nx * nx + ny * ny);
      if (Math.abs(nd - 1) < Math.max(radius / rx, radius / ry)) return true;
    } else if (stroke.type === 'line') {
      if (getPointToSegmentDistance(p, stroke.start, stroke.end) <= radius) return true;
    } else if (stroke.type === 'text') {
      ctx.font = (stroke.fontSize || 20) + 'px Arial';
      const w = ctx.measureText(stroke.text).width;
      const h = stroke.fontSize || 20;
      if (p.x >= stroke.pos.x && p.x <= stroke.pos.x + w && p.y >= stroke.pos.y - h && p.y <= stroke.pos.y) {
        return true;
      }
    }
    return false;
  }

  /**
   * The primary render loop for the application.
   * 1. Clears the canvas with a white background.
   * 2. Iterates through the 'strokes' array and draws each finalized object.
   * 3. Renders the 'currentStroke' if a drawing operation is actively in progress.
   * 4. If in 'select' mode, renders the marquee selection box or bounding boxes/handles
   *    around currently selected objects. Locks are styled in red, normal selections in blue.
   */
  function redraw() {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    strokes.forEach(s => drawStroke(s));

    if (currentStroke) {
      drawStroke(currentStroke);
    }

    if (getTool() === 'select') {
      if (dragState && dragState.mode === 'marquee') {
        ctx.save();
        ctx.fillStyle = 'rgba(0, 123, 255, 0.15)';
        ctx.strokeStyle = '#007bff';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        const w = dragState.endP.x - dragState.startP.x;
        const h = dragState.endP.y - dragState.startP.y;
        ctx.fillRect(dragState.startP.x, dragState.startP.y, w, h);
        ctx.strokeRect(dragState.startP.x, dragState.startP.y, w, h);
        ctx.restore();
      } else if (selectedStrokes.length > 0) {
        const isGroupLocked = selectedStrokes.every(s => s.locked);
        const box = getBoundingBox(selectedStrokes);
        if (box) {
          ctx.save();
          ctx.strokeStyle = isGroupLocked ? '#ff0000' : '#007bff';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.strokeRect(box.minX, box.minY, box.maxX - box.minX, box.maxY - box.minY);

          if (!isGroupLocked) {
            ctx.fillStyle = '#ffffff';
            ctx.setLineDash([]);
            const nodes = getCornerNodes(box);
            for (let n of nodes) {
              ctx.fillRect(n.x - 4, n.y - 4, 8, 8);
              ctx.strokeRect(n.x - 4, n.y - 4, 8, 8);
            }
          }
          ctx.restore();
        }
      }
    }
  }

  /**
   * Converts global browser mouse event coordinates to canvas-relative local coordinates.
   * @param {MouseEvent} e - The DOM mouse event.
   * @returns {Object} Extracted local coordinate {x, y}.
   */
  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height)
    };
  }

  /**
   * Iterates through strokes in reverse (top-to-bottom visual order) to find the first
   * object that intersects with the given point.
   * @param {Object} p - The point to test.
   * @returns {Object|null} The hit stroke and its index, or null if none found.
   */
  function getHitStroke(p) {
    for (let i = strokes.length - 1; i >= 0; i--) {
      if (checkHitStroke(p, strokes[i], 10)) return { stroke: strokes[i], index: i };
    }
    return null;
  }

  /**
   * Deletes any unlocked stroke that intersects with the given point 'p'.
   * Used continuously while dragging the eraser tool.
   * @param {Object} p - The mouse coordinate to erase at.
   */
  function eraseAt(p) {
    let modified = false;
    strokes = strokes.filter(stroke => {
      if (stroke.locked) return true; // prevent erasing locked items
      if (checkHitStroke(p, stroke, 10)) { modified = true; return false; }
      return true;
    });

    if (modified) {
      selectedStrokes = [];
      redraw();
    }
  }

  /**
   * Creates an absolutely positioned HTML text `<input>` field layered directly above the canvas.
   * This provides a native typing experience for the user. When the user clicks away (blurs)
   * or hits Enter/Escape, the text is committed and converted into a persistent canvas 'text' stroke.
   * 
   * @param {Object} p - The {x, y} coordinates to place the input.
   * @param {Object|null} existingStroke - If editing an existing text stroke, pass it here to pre-fill the input.
   */
  function createTextOverlay(p, existingStroke = null) {
    if (textInputActive) return;
    textInputActive = true;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'csbs-drawing-text-input';

    const targetPos = existingStroke ? existingStroke.pos : p;
    input.style.left = targetPos.x + 'px';
    input.style.top = targetPos.y + 'px';
    input.style.color = existingStroke ? existingStroke.color : getColor();
    input.style.fontSize = (existingStroke && existingStroke.fontSize ? existingStroke.fontSize : 20) + 'px';
    if (existingStroke) {
      input.value = existingStroke.text;
    }

    container.appendChild(input);

    setTimeout(() => {
      input.focus();
      if (existingStroke) input.select();
    }, 10);

    let committed = false;
    const cleanupWindowListener = () => {
      window.removeEventListener('keydown', captureKeys, true);
    };

    const commitText = () => {
      if (committed) return;
      committed = true;
      cleanupWindowListener();

      const val = input.value.trim();
      const needsHistory = existingStroke ? (val !== existingStroke.text) : (val !== '');
      if (needsHistory) saveState();

      if (existingStroke) {
        if (val !== '') {
          existingStroke.text = val;
        } else {
          strokes = strokes.filter(s => s !== existingStroke);
          selectedStrokes = selectedStrokes.filter(s => s !== existingStroke);
        }
      } else {
        if (val !== '') {
          strokes.push({
            type: 'text',
            text: val,
            pos: targetPos,
            color: input.style.color,
            fontSize: 20,
            locked: false
          });
        }
      }

      redraw();
      if (input.parentNode) {
        input.parentNode.removeChild(input);
      }

      setTimeout(() => { textInputActive = false; }, 100);
    };

    input.addEventListener('blur', () => {
      // slightly delay blur to allow Escape key handler to fire first if they occurred at similar times
      setTimeout(() => {
        if (!committed) commitText();
      }, 50);
    });

    const captureKeys = (e) => {
      if (e.key === 'Enter' || e.keyCode === 13) {
        e.preventDefault();
        e.stopPropagation();
        commitText();
      } else if (e.key === 'Escape' || e.key === 'Esc' || e.keyCode === 27) {
        e.preventDefault();
        e.stopPropagation();
        if (committed) return;
        committed = true;
        cleanupWindowListener();

        if (input.parentNode) {
          input.parentNode.removeChild(input);
        }
        setTimeout(() => { textInputActive = false; }, 100);
      }
    };

    window.addEventListener('keydown', captureKeys, true);
  }

  // Double Click to Edit Text
  canvas.addEventListener('dblclick', (e) => {
    if (textInputActive) return;
    const p = getPos(e);
    const hitObj = getHitStroke(p);
    if (hitObj && hitObj.stroke.type === 'text') {
      if (!hitObj.stroke.locked) {
        createTextOverlay(p, hitObj.stroke);
      }
    }
  });

  // Mouse Down: Starts drawing a new shape, begins a selection, or initiates text input
  canvas.addEventListener('mousedown', (e) => {
    if (textInputActive) return;

    pendingHistoryState = JSON.stringify(strokes);
    isDrawing = true;
    const p = getPos(e);
    const tool = getTool();
    if (tool === 'pen') {
      currentStroke = { type: 'path', color: getColor(), weight: getWeight(), points: [p], locked: false };
    } else if (tool === 'rect') {
      currentStroke = { type: 'rect', color: getColor(), weight: getWeight(), start: p, end: p, locked: false };
    } else if (tool === 'oval') {
      currentStroke = { type: 'oval', color: getColor(), weight: getWeight(), start: p, end: p, locked: false };
    } else if (tool === 'line') {
      currentStroke = { type: 'line', color: getColor(), weight: getWeight(), start: p, end: p, locked: false };
    } else if (tool === 'select') {
      const isGroupLocked = selectedStrokes.length > 0 && selectedStrokes.every(s => s.locked);

      // Check handles first (only if not locked)
      if (selectedStrokes.length > 0 && !isGroupLocked) {
        const box = getBoundingBox(selectedStrokes);
        const nodes = getCornerNodes(box);
        let hitNode = null;
        for (let n of nodes) {
          if (Math.abs(p.x - n.x) <= 8 && Math.abs(p.y - n.y) <= 8) {
            hitNode = n; break;
          }
        }
        if (hitNode) {
          dragState = {
            mode: 'resize', strokes: selectedStrokes, origP: hitNode, fixedP: hitNode.fixed,
            origStrokes: JSON.parse(JSON.stringify(selectedStrokes))
          };
          return;
        }
      }

      // Check shapes
      const hitObj = getHitStroke(p);
      if (hitObj) {
        if (!selectedStrokes.includes(hitObj.stroke)) {
          selectedStrokes = [hitObj.stroke];
        }
        // Bring selected up to front
        strokes = strokes.filter(s => !selectedStrokes.includes(s));
        strokes.push(...selectedStrokes);

        // Only allow moving if the group isn't fully locked
        const checkLocked = selectedStrokes.every(s => s.locked);
        if (!checkLocked) {
          dragState = { mode: 'move', lastP: p };
        } else {
          dragState = null;
        }
        redraw();
      } else {
        selectedStrokes = [];
        dragState = { mode: 'marquee', startP: p, endP: p };
        redraw();
      }
    } else if (tool === 'text') {
      e.preventDefault();
      createTextOverlay(p);
      isDrawing = false;
    } else if (tool === 'eraser') {
      eraseAt(p);
    }
  });

  // Mouse Move: Updates points of the current shape, updates selection rectangles,
  // or handles moving/resizing of selected objects.
  canvas.addEventListener('mousemove', (e) => {
    const tool = getTool();
    const p = getPos(e);

    if (tool === 'select' && !isDrawing) {
      let cursor = 'default';
      if (selectedStrokes.length > 0 && !selectedStrokes.every(s => s.locked)) {
        const box = getBoundingBox(selectedStrokes);
        const nodes = getCornerNodes(box);
        for (let n of nodes) {
          if (Math.abs(p.x - n.x) <= 8 && Math.abs(p.y - n.y) <= 8) {
            if (n.id === 'TL' || n.id === 'BR') cursor = 'nwse-resize';
            if (n.id === 'TR' || n.id === 'BL') cursor = 'nesw-resize';
            break;
          }
        }
      }
      canvas.style.cursor = cursor;
    }

    if (!isDrawing) return;

    if (tool === 'pen') {
      currentStroke.points.push(p);
    } else if (tool === 'rect' || tool === 'oval') {
      currentStroke.end = p;
    } else if (tool === 'line') {
      if (e.shiftKey) {
        const dx = p.x - currentStroke.start.x;
        const dy = p.y - currentStroke.start.y;
        const angle = Math.atan2(dy, dx);
        const snapAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
        const dist = Math.sqrt(dx * dx + dy * dy);
        currentStroke.end = {
          x: currentStroke.start.x + Math.cos(snapAngle) * dist,
          y: currentStroke.start.y + Math.sin(snapAngle) * dist
        };
      } else {
        currentStroke.end = p;
      }
    } else if (tool === 'select' && dragState) {
      if (dragState.mode === 'move') {
        const dx = p.x - dragState.lastP.x;
        const dy = p.y - dragState.lastP.y;

        selectedStrokes.forEach(s => {
          if (s.type === 'path') {
            s.points.forEach(pt => { pt.x += dx; pt.y += dy; });
          } else if (s.type === 'rect' || s.type === 'oval' || s.type === 'line') {
            s.start.x += dx; s.start.y += dy;
            s.end.x += dx; s.end.y += dy;
          } else if (s.type === 'text') {
            s.pos.x += dx; s.pos.y += dy;
          }
        });
        dragState.lastP = p;

      } else if (dragState.mode === 'resize') {
        const dx = p.x - dragState.fixedP.x;
        const dy = p.y - dragState.fixedP.y;
        const origDx = dragState.origP.x - dragState.fixedP.x;
        const origDy = dragState.origP.y - dragState.fixedP.y;

        let scaleX = Math.abs(origDx) < 0.1 ? 1 : dx / origDx;
        let scaleY = Math.abs(origDy) < 0.1 ? 1 : dy / origDy;

        for (let i = 0; i < dragState.strokes.length; i++) {
          const s = dragState.strokes[i];
          const os = dragState.origStrokes[i];

          if (s.type === 'text') {
            const maxScale = Math.max(Math.abs(scaleX), Math.abs(scaleY)) * (Math.sign(scaleX) || 1);
            const curScaleX = maxScale;
            const curScaleY = maxScale;

            const applyScale = (pt, opt) => {
              pt.x = dragState.fixedP.x + (opt.x - dragState.fixedP.x) * curScaleX;
              pt.y = dragState.fixedP.y + (opt.y - dragState.fixedP.y) * curScaleY;
            };

            applyScale(s.pos, os.pos);
            s.fontSize = Math.max(5, Math.abs((os.fontSize || 20) * curScaleX));
          } else {
            const applyScale = (pt, opt) => {
              pt.x = dragState.fixedP.x + (opt.x - dragState.fixedP.x) * scaleX;
              pt.y = dragState.fixedP.y + (opt.y - dragState.fixedP.y) * scaleY;
            };

            if (s.type === 'path') {
              for (let j = 0; j < s.points.length; j++) {
                applyScale(s.points[j], os.points[j]);
              }
            } else if (s.type === 'rect' || s.type === 'oval' || s.type === 'line') {
              applyScale(s.start, os.start);
              applyScale(s.end, os.end);
            }
          }
        }
      } else if (dragState.mode === 'marquee') {
        dragState.endP = p;
      }
    } else if (tool === 'eraser') {
      eraseAt(p);
    }

    if (tool !== 'eraser') {
      redraw();
    }
  });

  /**
   * Finalizes the current drawing, selecting, or moving operation.
   * Triggered on mouseup or when the mouse leaves the canvas bounds.
   * Handles marquee selection intersections, scribble-to-erase detection,
   * committing the current shape to the global strokes array, and saving the history state.
   */
  const finishDrawing = () => {
    if (isDrawing && getTool() === 'select' && dragState && dragState.mode === 'marquee') {
      const mx1 = Math.min(dragState.startP.x, dragState.endP.x);
      const mx2 = Math.max(dragState.startP.x, dragState.endP.x);
      const my1 = Math.min(dragState.startP.y, dragState.endP.y);
      const my2 = Math.max(dragState.startP.y, dragState.endP.y);

      selectedStrokes = strokes.filter(s => {
        const b = getSingleBoundingBox(s);
        if (!b) return false;
        return !(b.maxX < mx1 || b.minX > mx2 || b.maxY < my1 || b.minY > my2);
      });

      if (selectedStrokes.length > 0) {
        strokes = strokes.filter(s => !selectedStrokes.includes(s));
        strokes.push(...selectedStrokes);
      }
    } else if (isDrawing && currentStroke && getTool() !== 'eraser' && getTool() !== 'text' && getTool() !== 'select') {

      let isScribbleDeleted = false;
      if (currentStroke.type === 'path' && currentStroke.points.length > 15) {
        let pts = currentStroke.points;
        let minX = pts[0].x, maxX = pts[0].x, minY = pts[0].y, maxY = pts[0].y;
        let dxCount = 0; let lastDx = 0;
        let pathLength = 0;
        for (let i = 1; i < pts.length; i++) {
          const d = Math.sqrt((pts[i].x - pts[i - 1].x) ** 2 + (pts[i].y - pts[i - 1].y) ** 2);
          pathLength += d;
          minX = Math.min(minX, pts[i].x); maxX = Math.max(maxX, pts[i].x);
          minY = Math.min(minY, pts[i].y); maxY = Math.max(maxY, pts[i].y);

          let dx = pts[i].x - pts[i - 1].x;
          if (Math.abs(dx) > 2) {
            if (lastDx !== 0 && Math.sign(dx) !== Math.sign(lastDx)) dxCount++;
            lastDx = dx;
          }
        }

        const bbW = maxX - minX;
        const bbH = maxY - minY;
        const isScribble = dxCount >= 4 && pathLength > 100 && bbW < 150 && bbH < 150;

        if (isScribble) {
          let newlyDeleted = false;
          strokes = strokes.filter(s => {
            if (s.locked) return true;
            const sb = getSingleBoundingBox(s);
            if (!sb) return true;
            const overlap = !(sb.maxX < minX || sb.minX > maxX || sb.maxY < minY || sb.minY > maxY);
            if (overlap) {
              newlyDeleted = true; return false;
            }
            return true;
          });
          if (newlyDeleted) isScribbleDeleted = true;
        }
      }

      if (!isScribbleDeleted) {
        let isValid = false;
        if (currentStroke.type === 'path' && currentStroke.points.length > 1) isValid = true;
        if ((currentStroke.type === 'rect' || currentStroke.type === 'oval' || currentStroke.type === 'line') &&
          (currentStroke.start.x !== currentStroke.end.x || currentStroke.start.y !== currentStroke.end.y)) isValid = true;

        if (isValid) strokes.push(currentStroke);
      } else {
        selectedStrokes = []; // reset selection if we deleted something
      }
      currentStroke = null;
    }
    isDrawing = false;
    dragState = null;
    redraw();

    if (pendingHistoryState) {
      const finalState = JSON.stringify(strokes);
      if (finalState !== pendingHistoryState) {
        undoHistory.push(JSON.parse(pendingHistoryState));
        if (undoHistory.length > 50) undoHistory.shift();
        redoHistory = [];
        updateUndoRedoUI();
      }
      pendingHistoryState = null;
    }
  };

  canvas.addEventListener('mouseup', finishDrawing);
  canvas.addEventListener('mouseout', finishDrawing);

  // Global Keyboard Listener: Handles shortcuts for deletion, duplication (Alt-drag),
  // undo/redo, and quick tool switching.
  document.addEventListener('keydown', (e) => {
    const activeEl = document.activeElement;
    const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);

    if (!isInput) {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedStrokes.length > 0) {
        e.preventDefault();
        saveState();
        strokes = strokes.filter(s => !selectedStrokes.includes(s) || s.locked);
        selectedStrokes = selectedStrokes.filter(s => s.locked);
        redraw();
        return;
      }

      if (e.key === 'Alt' && selectedStrokes.length > 0) {
        e.preventDefault();
        saveState();
        const clonedSelection = [];
        selectedStrokes.forEach(s => {
          const clone = JSON.parse(JSON.stringify(s));
          const dx = 15; const dy = 15;
          if (clone.type === 'path') {
            clone.points.forEach(pt => { pt.x += dx; pt.y += dy; });
          } else if (clone.type === 'rect' || clone.type === 'oval' || clone.type === 'line') {
            clone.start.x += dx; clone.start.y += dy;
            clone.end.x += dx; clone.end.y += dy;
          } else if (clone.type === 'text') {
            clone.pos.x += dx; clone.pos.y += dy;
          }
          clone.locked = false; // ensure new clones can be moved immediately
          clonedSelection.push(clone);
          strokes.push(clone);
        });
        selectedStrokes = clonedSelection;
        redraw();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === '2') {
        e.preventDefault();
        ui.lockBtn.click(); c
        return;
      }

      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault();
        performRedo();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        performUndo();
        return;
      }

      const key = e.key.toLowerCase();
      if (key === 'v') ui.selectBtn.click();
      if (key === 'p') ui.penBtn.click();
      if (key === 'o') ui.ovalBtn.click();
      if (key === 'l') ui.lineBtn.click();
      if (key === 'r') ui.rectBtn.click();
      if (key === 'e') ui.eraserBtn.click();
      if (key === 't') ui.textBtn.click();
    }
  });

  const buttons = [ui.selectBtn, ui.lockBtn, ui.penBtn, ui.lineBtn, ui.rectBtn, ui.ovalBtn, ui.textBtn, ui.eraserBtn];

  const handleToolBtn = (btn, toolName, cursorName) => {
    if (toolName === 'lock') return; // Handled separately

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      setTool(toolName);
      buttons.forEach(b => {
        if (b.id !== 'csbs-lock-btn') b.classList.remove('active');
      });
      btn.classList.add('active');
      canvas.style.cursor = cursorName;

      if (toolName !== 'select') {
        selectedStrokes = [];
        redraw();
      }
    });
  };

  handleToolBtn(ui.selectBtn, 'select', 'default');
  handleToolBtn(ui.penBtn, 'pen', 'crosshair');

  ui.penBtn.addEventListener('dblclick', (e) => {
    sliderPopover.style.display = 'flex';
    const wrapperRect = wrapper.getBoundingClientRect();
    const btnRect = ui.penBtn.getBoundingClientRect();
    sliderPopover.style.left = (btnRect.left - wrapperRect.left) + 'px';
    sliderPopover.style.top = (header.offsetHeight + 5) + 'px';
  });

  document.addEventListener('mousedown', (e) => {
    if (sliderPopover.style.display !== 'none') {
      if (!sliderPopover.contains(e.target) && !ui.penBtn.contains(e.target)) {
        sliderPopover.style.display = 'none';
      }
    }
  });

  handleToolBtn(ui.lineBtn, 'line', 'crosshair');
  handleToolBtn(ui.rectBtn, 'rect', 'crosshair');
  handleToolBtn(ui.ovalBtn, 'oval', 'crosshair');
  handleToolBtn(ui.textBtn, 'text', 'text');
  handleToolBtn(ui.eraserBtn, 'eraser', 'cell');

  // Lock Action (Not a tool state swap)
  ui.lockBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (selectedStrokes.length > 0) {
      saveState();
      // Find if any are unlocked in the selection
      const anyUnlocked = selectedStrokes.some(s => !s.locked);
      selectedStrokes.forEach(s => s.locked = anyUnlocked);
      redraw();
    }
  });

  ui.clearBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const lockedCount = strokes.filter(s => s.locked).length;
    if (lockedCount < strokes.length) {
      saveState();
      strokes = strokes.filter(s => s.locked);
      currentStroke = null; dragState = null; selectedStrokes = []; redraw();
    }
  });

  ui.saveBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const tempSelected = selectedStrokes;
    selectedStrokes = []; // hide bounding box for screenshot
    redraw();

    const dataURL = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.download = `scratchpad-${Date.now()}.png`;
    a.href = dataURL;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    selectedStrokes = tempSelected; // restore
    redraw();
  });
}

// Initialization: Check if the HTML document is still loading.
// If it is, wait for the DOM to finish parsing before injecting the panel.
// If it has already loaded, inject the drawing panel immediately.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectDrawingPanel);
} else {
  injectDrawingPanel();
}

// MutationObserver watches the DOM to dynamically re-inject the drawing panel
// if the page content updates (e.g. going to next problem).
const observer = new MutationObserver((mutations, obs) => {
  if (document.getElementById('solutionarea') && !document.getElementById('csbs-drawing-panel-wrapper')) {
    injectDrawingPanel();
  }
});

// Start observing the entire document body for any structural changes.
// 'childList: true' watches for direct children additions/removals.
// 'subtree: true' watches all descendants, ensuring we catch any dynamic 
// content updates that might recreate the 'solutionarea'.
observer.observe(document.body, { childList: true, subtree: true });
