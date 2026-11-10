window.__ModuleLoader__.load({
  id: '@local/excalidraw-canvas',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useRef } = React

    const NS = 'excalidraw-canvas'
    const TAB_ID = '@local/excalidraw-canvas'
    const TAB_KIND = 'excalidraw-canvas'
    const API = '/excalidraw/api'
    const BOARD = { width: 1600, height: 1000 }
    const HAND_FONT =
      '"Segoe Print", "Bradley Hand", "Chalkboard SE", "Comic Sans MS", "PingFang SC", "Hiragino Sans GB", ui-rounded, system-ui, sans-serif'

    const STROKE_COLORS = ['#1e1e1e', '#e03131', '#1971c2', '#2f9e44', '#f08c00', '#9c36b5']
    const FILL_COLORS = ['transparent', '#ffec99', '#d0ebff', '#d3f9d8', '#ffe3e3', '#e5dbff']
    const TOOLS = ['select', 'rectangle', 'ellipse', 'diamond', 'arrow', 'line', 'draw', 'text', 'eraser']

    const DICTS = {
      zh: {
        'tab.title': 'Excalidraw 画布',
        'guide.title': 'Excalidraw 画布',
        'guide.description': '和 AI 共用一块手绘画布',
        'canvas.label': 'Excalidraw 画布',
        'tool.select': '选择',
        'tool.rectangle': '矩形',
        'tool.ellipse': '椭圆',
        'tool.diamond': '菱形',
        'tool.arrow': '箭头',
        'tool.line': '直线',
        'tool.draw': '自由绘制',
        'tool.text': '文字',
        'tool.eraser': '橡皮',
        'colors.stroke': '线条颜色',
        'colors.fill': '填充颜色',
        'colors.none': '无填充',
        'weight': '线宽',
        'zoom.in': '放大',
        'zoom.out': '缩小',
        'zoom.reset': '回到 100%',
        'undo': '撤销',
        'redo': '重做',
        'clear': '清空画布',
        'export': '下载 .excalidraw',
        'status.synced': '已同步',
        'status.connecting': '连接中…',
        'status.ai': 'AI',
        'status.you': '你',
        'status.empty': '在 AI 对话里让它画，或直接在这里画',
        'text.placeholder': '输入文字，回车确认',
        'notice.load': '读取画布失败：',
        'notice.save': '保存失败：',
        'notice.cleared': '已清空画布',
        'hint.select': '点击选中 · 拖动移动 · 滚轮平移 · ⌘滚轮缩放',
        'hint.draw': '按住拖动手绘 · 滚轮平移',
        'hint.text': '点击画布放置文字',
        'hint.eraser': '点击元素删除',
        'hint.shape': '按住拖动绘制形状',
      },
      en: {
        'tab.title': 'Excalidraw canvas',
        'guide.title': 'Excalidraw canvas',
        'guide.description': 'A hand-drawn board shared with the agent',
        'canvas.label': 'Excalidraw canvas',
        'tool.select': 'Select',
        'tool.rectangle': 'Rectangle',
        'tool.ellipse': 'Ellipse',
        'tool.diamond': 'Diamond',
        'tool.arrow': 'Arrow',
        'tool.line': 'Line',
        'tool.draw': 'Draw',
        'tool.text': 'Text',
        'tool.eraser': 'Eraser',
        'colors.stroke': 'Stroke color',
        'colors.fill': 'Fill color',
        'colors.none': 'No fill',
        'weight': 'Stroke width',
        'zoom.in': 'Zoom in',
        'zoom.out': 'Zoom out',
        'zoom.reset': 'Reset zoom',
        'undo': 'Undo',
        'redo': 'Redo',
        'clear': 'Clear canvas',
        'export': 'Download .excalidraw',
        'status.synced': 'Synced',
        'status.connecting': 'Connecting…',
        'status.ai': 'Agent',
        'status.you': 'You',
        'status.empty': 'Ask the agent to draw here, or draw yourself',
        'text.placeholder': 'Type, then press Enter',
        'notice.load': 'Could not load the canvas: ',
        'notice.save': 'Could not save: ',
        'notice.cleared': 'Canvas cleared',
        'hint.select': 'Click to select · drag to move · wheel to pan · ⌘wheel to zoom',
        'hint.draw': 'Drag to draw · wheel to pan',
        'hint.text': 'Click the canvas to place text',
        'hint.eraser': 'Click an element to remove it',
        'hint.shape': 'Drag to draw the shape',
      },
    }

    const runtime = { locale: null, translate: (key) => key, lastSession: '' }

    /* --------------------------------------------------------------- maths */

    function hashSeed(value) {
      let hash = 2166136261
      const source = String(value)
      for (let index = 0; index < source.length; index += 1) {
        hash ^= source.charCodeAt(index)
        hash = Math.imul(hash, 16777619)
      }
      return hash >>> 0
    }

    function mulberry32(seed) {
      let state = seed >>> 0
      return function rand() {
        state = (state + 0x6d2b79f5) >>> 0
        let t = state
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
      }
    }

    function f(value) {
      return Math.round(value * 100) / 100
    }

    function glyphWidth(char, fontSize) {
      return /[\u1100-\u11ff\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\uff00-\uff60\uffe0-\uffe6]/.test(char)
        ? fontSize
        : fontSize * 0.56
    }

    function wrapText(value, maxWidth, fontSize) {
      const lines = []
      for (const paragraph of String(value === undefined || value === null ? '' : value).split('\n')) {
        if (paragraph === '') {
          lines.push('')
          continue
        }
        let current = ''
        let width = 0
        for (const char of paragraph) {
          const advance = glyphWidth(char, fontSize)
          if (width + advance > maxWidth && current !== '') {
            const space = current.lastIndexOf(' ')
            if (space > 0) {
              lines.push(current.slice(0, space))
              current = current.slice(space + 1)
            } else {
              lines.push(current)
              current = ''
            }
            width = 0
            for (const rest of current) width += glyphWidth(rest, fontSize)
          }
          current += char
          width += advance
        }
        lines.push(current)
      }
      return lines.length === 0 ? [''] : lines
    }

    /* ------------------------------------------------------- rough strokes */

    function roughPolyline(points, rand, amplitude) {
      if (points.length < 2) return ''
      let path = `M ${f(points[0][0])} ${f(points[0][1])}`
      for (let index = 1; index < points.length; index += 1) {
        const from = points[index - 1]
        const to = points[index]
        const dx = to[0] - from[0]
        const dy = to[1] - from[1]
        const length = Math.hypot(dx, dy) || 1
        const nx = -dy / length
        const ny = dx / length
        const mid = (rand() * 2 - 1) * amplitude
        const end = (rand() * 2 - 1) * amplitude * 0.7
        const cx = from[0] + dx * 0.5 + nx * mid
        const cy = from[1] + dy * 0.5 + ny * mid
        path += ` Q ${f(cx)} ${f(cy)} ${f(to[0] + nx * end)} ${f(to[1] + ny * end)}`
      }
      return path
    }

    function roughClosed(points, rand, amplitude) {
      const jittered = points.map(([x, y]) => [x + (rand() * 2 - 1) * amplitude, y + (rand() * 2 - 1) * amplitude])
      return `${roughPolyline(jittered.concat([jittered[0]]), rand, amplitude * 0.7)} Z`
    }

    function cornerPoints(element) {
      const { x, y, width, height } = element
      if (element.type === 'diamond') {
        return [
          [x + width / 2, y],
          [x + width, y + height / 2],
          [x + width / 2, y + height],
          [x, y + height / 2],
        ]
      }
      return [
        [x, y],
        [x + width, y],
        [x + width, y + height],
        [x, y + height],
      ]
    }

    function ellipsePoints(element, count = 16) {
      const cx = element.x + element.width / 2
      const cy = element.y + element.height / 2
      const rx = Math.max(1, element.width / 2)
      const ry = Math.max(1, element.height / 2)
      const points = []
      for (let index = 0; index < count; index += 1) {
        const angle = (index / count) * Math.PI * 2
        points.push([cx + Math.cos(angle) * rx, cy + Math.sin(angle) * ry])
      }
      return points
    }

    function roundedRectPath(element) {
      const { x, y, width, height } = element
      const radius = Math.max(0, Math.min(18, Math.min(width, height) * 0.2))
      return `M ${f(x + radius)} ${f(y)} H ${f(x + width - radius)} Q ${f(x + width)} ${f(y)} ${f(x + width)} ${f(y + radius)} V ${f(y + height - radius)} Q ${f(x + width)} ${f(y + height)} ${f(x + width - radius)} ${f(y + height)} H ${f(x + radius)} Q ${f(x)} ${f(y + height)} ${f(x)} ${f(y + height - radius)} V ${f(y + radius)} Q ${f(x)} ${f(y)} ${f(x + radius)} ${f(y)} Z`
    }

    function ellipsePath(element) {
      const { x, y, width, height } = element
      const rx = Math.max(0.5, width / 2)
      const ry = Math.max(0.5, height / 2)
      const cx = x + rx
      const cy = y + ry
      return `M ${f(cx - rx)} ${f(cy)} A ${f(rx)} ${f(ry)} 0 1 0 ${f(cx + rx)} ${f(cy)} A ${f(rx)} ${f(ry)} 0 1 0 ${f(cx - rx)} ${f(cy)} Z`
    }

    function idealPath(element) {
      if (element.type === 'ellipse') return ellipsePath(element)
      if (element.type === 'diamond') {
        const points = cornerPoints(element)
        return `M ${points.map(([x, y]) => `${f(x)} ${f(y)}`).join(' L ')} Z`
      }
      return roundedRectPath(element)
    }

    function hachureLines(element, rand) {
      const gap = 9
      const paths = []
      const { x, y, width, height } = element
      for (let offset = -height; offset < width; offset += gap) {
        paths.push(
          roughPolyline(
            [
              [x + offset, y + height],
              [x + offset + height, y],
            ],
            rand,
            0.8,
          ),
        )
      }
      return paths.join(' ')
    }

    function arrowHead(from, to, size) {
      const angle = Math.atan2(to[1] - from[1], to[0] - from[0])
      const spread = 0.45
      const left = [to[0] - Math.cos(angle - spread) * size, to[1] - Math.sin(angle - spread) * size]
      const right = [to[0] - Math.cos(angle + spread) * size, to[1] - Math.sin(angle + spread) * size]
      return `M ${f(left[0])} ${f(left[1])} L ${f(to[0])} ${f(to[1])} L ${f(right[0])} ${f(right[1])}`
    }

    function dashArray(element) {
      if (element.strokeStyle === 'dashed') return `${element.strokeWidth * 4} ${element.strokeWidth * 3}`
      if (element.strokeStyle === 'dotted') return `${element.strokeWidth} ${element.strokeWidth * 3}`
      return null
    }

    /* ------------------------------------------------------------ elements */

    function newId() {
      return `e${Math.random().toString(36).slice(2, 8)}`
    }

    function baseElement(type, overrides) {
      const seed = Math.floor(Math.random() * 2147483647)
      return {
        id: newId(),
        type,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        angle: 0,
        strokeColor: '#1e1e1e',
        backgroundColor: 'transparent',
        fillStyle: 'hachure',
        strokeWidth: 2,
        strokeStyle: 'solid',
        roughness: 1,
        opacity: 100,
        groupIds: [],
        frameId: null,
        roundness: null,
        seed,
        version: 1,
        versionNonce: seed,
        isDeleted: false,
        boundElements: [],
        updated: Date.now(),
        link: null,
        locked: false,
        _by: 'user',
        _v: 0,
        ...overrides,
      }
    }

    function shapeFor(tool, point, stroke, fill, weight) {
      const type = tool === 'draw' ? 'freedraw' : tool
      const common = {
        x: point.x,
        y: point.y,
        strokeColor: stroke,
        strokeWidth: weight,
        backgroundColor: fill,
        fillStyle: fill === 'transparent' ? 'none' : 'hachure',
        _by: 'user',
      }
      if (type === 'freedraw') {
        return baseElement('freedraw', { ...common, points: [[0, 0]], opacity: 100 })
      }
      if (type === 'arrow' || type === 'line') {
        return baseElement(type, {
          ...common,
          points: [
            [0, 0],
            [0, 0],
          ],
          startBinding: null,
          endBinding: null,
          startArrowhead: null,
          endArrowhead: type === 'arrow' ? 'arrow' : null,
        })
      }
      return baseElement(type, {
        ...common,
        roundness: type === 'rectangle' ? { type: 3 } : type === 'diamond' ? { type: 2 } : null,
      })
    }

    function resizeDraft(draft, start, point) {
      const dx = point.x - start.x
      const dy = point.y - start.y
      if (draft.type === 'freedraw') {
        const points = draft.points.slice()
        const last = points[points.length - 1]
        if (Math.hypot(dx - last[0], dy - last[1]) < 1.6) return draft
        points.push([dx, dy])
        return { ...draft, points }
      }
      if (draft.type === 'arrow' || draft.type === 'line') {
        return {
          ...draft,
          width: dx,
          height: dy,
          points: [
            [0, 0],
            [dx, dy],
          ],
        }
      }
      return {
        ...draft,
        x: Math.min(start.x, point.x),
        y: Math.min(start.y, point.y),
        width: Math.abs(dx),
        height: Math.abs(dy),
      }
    }

    function elementBounds(element) {
      if (element.type === 'arrow' || element.type === 'line' || element.type === 'freedraw') {
        const points = pointsOf(element)
        let minX = Infinity
        let minY = Infinity
        let maxX = -Infinity
        let maxY = -Infinity
        for (const [x, y] of points) {
          minX = Math.min(minX, x)
          minY = Math.min(minY, y)
          maxX = Math.max(maxX, x)
          maxY = Math.max(maxY, y)
        }
        if (!Number.isFinite(minX)) return { x: element.x, y: element.y, width: 0, height: 0 }
        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
      }
      return { x: element.x, y: element.y, width: element.width, height: element.height }
    }

    function pointsOf(element) {
      const raw = Array.isArray(element.points) ? element.points : []
      return raw.map((point) => [element.x + Number(point[0] || 0), element.y + Number(point[1] || 0)])
    }

    function distanceToSegment(px, py, ax, ay, bx, by) {
      const dx = bx - ax
      const dy = by - ay
      const lengthSquared = dx * dx + dy * dy
      if (lengthSquared === 0) return Math.hypot(px - ax, py - ay)
      let t = ((px - ax) * dx + (py - ay) * dy) / lengthSquared
      t = Math.max(0, Math.min(1, t))
      return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
    }

    function hitTest(element, x, y) {
      if (element.type === 'arrow' || element.type === 'line' || element.type === 'freedraw') {
        const points = pointsOf(element)
        for (let index = 1; index < points.length; index += 1) {
          const distance = distanceToSegment(
            x,
            y,
            points[index - 1][0],
            points[index - 1][1],
            points[index][0],
            points[index][1],
          )
          if (distance <= 9) return true
        }
        return false
      }
      const pad = 5
      return (
        x >= element.x - pad &&
        x <= element.x + element.width + pad &&
        y >= element.y - pad &&
        y <= element.y + element.height + pad
      )
    }

    function topMost(elements, point) {
      for (let index = elements.length - 1; index >= 0; index -= 1) {
        const element = elements[index]
        if (element.containerId) continue
        if (hitTest(element, point.x, point.y)) return element
      }
      return null
    }

    function withContainer(elements, element) {
      const ids = new Set([element.id])
      for (const candidate of elements) {
        if (candidate.containerId === element.id) ids.add(candidate.id)
      }
      return ids
    }

    /* ------------------------------------------------------------- storage */

    async function pullScene(since) {
      const response = await fetch(`${API}/scene?since=${since}`, {
        cache: 'no-store',
        headers: { accept: 'application/json' },
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      if (data === null || typeof data !== 'object' || data.ok !== true) {
        throw new Error((data && data.error) || 'bad payload')
      }
      return data
    }

    async function pushScene(baseVersion, elements) {
      const response = await fetch(`${API}/scene`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ baseVersion, elements }),
      })
      const data = await response.json()
      if (data === null || typeof data !== 'object' || data.ok !== true) {
        throw new Error((data && data.error) || 'save failed')
      }
      return data
    }

    function diag(level, message) {
      try {
        fetch(`${API}/diag`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ level, message: String(message).slice(0, 300) }),
        }).catch(() => {})
      } catch {
        /* diagnostics are best effort */
      }
    }

    /* --------------------------------------------------------- presentation */

    const TOOL_ICONS = {
      select: h('path', { d: 'M3 2.2 12.4 8.1 8.9 9.1 7.2 12.6 5.4 11.8 7 8.6 3 8.1Z' }),
      rectangle: h('rect', { x: 2.4, y: 3.4, width: 11.2, height: 9.2, rx: 1.6 }),
      ellipse: h('ellipse', { cx: 8, cy: 8, rx: 5.6, ry: 4.6 }),
      diamond: h('path', { d: 'M8 2.4 13.6 8 8 13.6 2.4 8Z' }),
      arrow: h('path', { d: 'M2.6 13.4 13 3M8.4 2.8H13v4.6' }),
      line: h('path', { d: 'M2.8 13.2 13.2 2.8' }),
      draw: h('path', { d: 'M2.8 13.2c2.2-.4 3-2.2 4.4-3.6 1.3-1.3 3.4-2.9 5.2-4.7M10.4 2.6l3 3' }),
      text: h('path', { d: 'M3 12.8 8 3.2l5 9.6M5.1 9.4h5.8' }),
      eraser: h('path', { d: 'M3.2 10.6 9 4.7l3.6 3.5-4.5 4.6H5.4ZM4 13.4h8.8' }),
    }

    function ToolIcon(props) {
      return h(
        'svg',
        {
          width: 16,
          height: 16,
          viewBox: '0 0 16 16',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.3,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
          style: { display: 'block' },
        },
        TOOL_ICONS[props.name],
      )
    }

    function CanvasGlyph(props) {
      const size = props && typeof props.size === 'number' ? props.size : 32
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 64 64',
          fill: 'none',
          'aria-hidden': 'true',
          style: { display: 'block' },
        },
        h('rect', { x: 2, y: 2, width: 60, height: 60, rx: 14, fill: '#6965db' }),
        h('rect', {
          x: 13.5,
          y: 15.5,
          width: 25,
          height: 21,
          rx: 3,
          stroke: '#ffffff',
          strokeWidth: 3,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
        h('path', {
          d: 'M19 43.5c3.6-.6 5-3.6 7.3-5.9 2.2-2.2 5.6-4.8 8.6-7.7',
          stroke: '#ffffff',
          strokeWidth: 3,
          strokeLinecap: 'round',
        }),
        h('path', {
          d: 'M37 24.5 45 32.5 51 26.5 43 18.5Z',
          fill: '#ffd8a8',
          stroke: '#ffffff',
          strokeWidth: 2.4,
          strokeLinejoin: 'round',
        }),
      )
    }

    function ToolButton(props) {
      return h(
        'button',
        {
          type: 'button',
          className: 'eca-btn' + (props.pressed ? ' eca-btn-on' : ''),
          'aria-pressed': props.pressed ? 'true' : 'false',
          'aria-label': props.label,
          title: props.label,
          onClick: props.onClick,
          disabled: props.disabled === true,
        },
        props.children,
      )
    }

    /* -------------------------------------------------------------- canvas */

    function CanvasPanel(props) {
      const tick = useLocaleTick()
      const t = runtime.translate
      const sessionId =
        props && typeof props.sessionId === 'string' && props.sessionId !== ''
          ? props.sessionId
          : runtime.lastSession || 'default'

      const [elements, setElements] = useState([])
      const [tool, setTool] = useState('select')
      const [stroke, setStroke] = useState(STROKE_COLORS[0])
      const [fill, setFill] = useState(FILL_COLORS[1])
      const [weight, setWeight] = useState(2)
      const [size, setSize] = useState({ w: 0, h: 0 })
      const [view, setView] = useState({ x: 0, y: 0, zoom: 0.55 })
      const zoom = view.zoom
      const [selected, setSelected] = useState('')
      const [draft, setDraft] = useState(null)
      const [editor, setEditor] = useState(null)
      const [notice, setNotice] = useState({ ok: true, text: '' })
      const [connected, setConnected] = useState(false)
      const [flash, setFlash] = useState({ ids: [], token: 0 })
      const [counts, setCounts] = useState({ ai: 0, user: 0 })
      const [ready, setReady] = useState(false)

      const elementsRef = useRef([])
      const versionRef = useRef(-1)
      const busyRef = useRef(false)
      const dirtyRef = useRef(false)
      const historyRef = useRef({ past: [], future: [] })
      const pushTimer = useRef(0)
      const chainRef = useRef(Promise.resolve())
      const svgRef = useRef(null)
      const rootRef = useRef(null)
      const stageRef = useRef(null)
      const viewRef = useRef(view)
      const sizeRef = useRef(size)
      const fittedRef = useRef(false)
      const spaceRef = useRef(false)
      const dragRef = useRef(null)
      const editorRef = useRef(null)
      const docId = useRef(`d${Math.random().toString(36).slice(2, 7)}`)

      function apply(next) {
        elementsRef.current = next
        setElements(next)
        let ai = 0
        for (const element of next) if (element._by === 'ai') ai += 1
        setCounts({ ai, user: next.length - ai })
      }

      function applyView(next) {
        viewRef.current = next
        setView(next)
      }

      function clampZoom(value) {
        return Math.min(2.4, Math.max(0.2, Math.round(value * 100) / 100))
      }

      /** Frame a scene-space box inside the current stage, or the 1600x1000 board. */
      function frame(box) {
        const { w, h } = sizeRef.current
        if (w <= 0 || h <= 0) return
        const padding = 46
        const zoomNext = clampZoom(Math.min(w / Math.max(120, box.width + padding), h / Math.max(120, box.height + padding)))
        applyView({
          zoom: zoomNext,
          x: box.x + box.width / 2 - w / zoomNext / 2,
          y: box.y + box.height / 2 - h / zoomNext / 2,
        })
      }

      function zoomTo(nextZoom, anchor) {
        const current = viewRef.current
        const { w, h } = sizeRef.current
        const zoomNext = clampZoom(nextZoom)
        const center = anchor === undefined ? { x: current.x + w / current.zoom / 2, y: current.y + h / current.zoom / 2 } : anchor
        applyView({
          zoom: zoomNext,
          x: center.x - w / zoomNext / 2,
          y: center.y - h / zoomNext / 2,
        })
      }

      function pulse(ids) {
        if (ids.length === 0) return
        setFlash({ ids, token: Date.now() })
      }

      function applyRemote(list) {
        const known = new Set(elementsRef.current.map((element) => element.id))
        const fresh = []
        for (const element of list) {
          if (element._by === 'ai' && !known.has(element.id)) fresh.push(element.id)
        }
        apply(list)
        pulse(fresh)
      }

      async function pull() {
        const data = await pullScene(versionRef.current)
        setConnected(true)
        setReady(true)
        if (data.changed === false) {
          setNotice((current) => (current.ok ? current : { ok: true, text: '' }))
          return
        }
        if (Number.isFinite(data.version) && data.version < versionRef.current) {
          // The Host started a fresh copy. Adopt whatever it restored from disk;
          // only when it restored nothing does the local board become the source.
          const restored = Array.isArray(data.elements) ? data.elements : []
          versionRef.current = data.version
          if (restored.length === 0 && elementsRef.current.length > 0) schedulePush()
          else applyRemote(restored)
          return
        }
        if (busyRef.current || dirtyRef.current) return
        versionRef.current = data.version
        applyRemote(data.elements || [])
      }

      function schedulePush() {
        dirtyRef.current = true
        if (pushTimer.current) clearTimeout(pushTimer.current)
        pushTimer.current = setTimeout(() => {
          pushTimer.current = 0
          chainRef.current = chainRef.current.then(flushPush, flushPush)
        }, 180)
      }

      async function flushPush() {
        const list = elementsRef.current
        try {
          const data = await pushScene(versionRef.current, list)
          versionRef.current = data.version
          if (Array.isArray(data.elements) && !busyRef.current) applyRemote(data.elements)
          setConnected(true)
          setNotice((current) => (current.ok ? current : { ok: true, text: '' }))
        } catch (error) {
          setNotice({ ok: false, text: `${t('notice.save')}${messageOf(error)}` })
        } finally {
          if (pushTimer.current === 0) dirtyRef.current = false
        }
      }

      function remember() {
        historyRef.current.past.push(elementsRef.current)
        if (historyRef.current.past.length > 60) historyRef.current.past.shift()
        historyRef.current.future.length = 0
      }

      function commit(next) {
        apply(next)
        schedulePush()
      }

      function undo() {
        const past = historyRef.current.past
        if (past.length === 0) return
        historyRef.current.future.push(elementsRef.current)
        commit(past.pop())
      }

      function redo() {
        const future = historyRef.current.future
        if (future.length === 0) return
        historyRef.current.past.push(elementsRef.current)
        commit(future.pop())
      }

      function clearAll() {
        if (elementsRef.current.length === 0) return
        remember()
        commit([])
        setSelected('')
        setNotice({ ok: true, text: t('notice.cleared') })
      }

      function removeIds(ids) {
        if (ids.length === 0) return
        const dropping = new Set(ids)
        commit(elementsRef.current.filter((element) => !dropping.has(element.id)))
        if (dropping.has(selected)) setSelected('')
      }

      function download() {
        const payload = {
          type: 'excalidraw',
          version: 2,
          source: 'https://excalidraw.com',
          elements: elementsRef.current.map(stripInternal),
          appState: { viewBackgroundColor: '#ffffff', gridSize: null },
          files: {},
        }
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `excalidraw-canvas-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.excalidraw`
        link.click()
        setTimeout(() => URL.revokeObjectURL(url), 2000)
      }

      /* ---------------------------------------------------------- pointer */

      function scenePoint(event) {
        const svg = svgRef.current
        if (svg === null) return { x: 0, y: 0 }
        const rect = svg.getBoundingClientRect()
        const current = viewRef.current
        const width = sizeRef.current.w > 0 ? sizeRef.current.w : rect.width
        const scale = (rect.width * current.zoom) / width
        return {
          x: current.x + (event.clientX - rect.left) / scale,
          y: current.y + (event.clientY - rect.top) / scale,
        }
      }

      function onPointerDown(event) {
        if (event.button === 1 || spaceRef.current) {
          event.preventDefault()
          busyRef.current = true
          dragRef.current = {
            mode: 'pan',
            start: { x: event.clientX, y: event.clientY },
            view: { ...viewRef.current },
          }
          capture(event)
          return
        }
        if (event.button !== 0) return
        const point = scenePoint(event)
        if (editorRef.current !== null) commitText()
        if (tool === 'select') {
          const hit = topMost(elementsRef.current, point)
          if (hit === null) {
            setSelected('')
            return
          }
          setSelected(hit.id)
          const ids = withContainer(elementsRef.current, hit)
          const origin = elementsRef.current
            .filter((element) => ids.has(element.id))
            .map((element) => ({ id: element.id, x: element.x, y: element.y }))
          remember()
          busyRef.current = true
          dragRef.current = { mode: 'move', start: point, origin }
          capture(event)
          return
        }
        if (tool === 'eraser') {
          remember()
          busyRef.current = true
          dragRef.current = { mode: 'erase', erased: 0 }
          eraseAt(point, true)
          capture(event)
          return
        }
        if (tool === 'text') {
          openEditor({ x: point.x, y: point.y, value: '', fontSize: 20 })
          return
        }
        busyRef.current = true
        dragRef.current = { mode: 'draft', start: point }
        setDraft(shapeFor(tool, point, stroke, fill, weight))
        capture(event)
      }

      function capture(event) {
        try {
          event.currentTarget.setPointerCapture(event.pointerId)
        } catch {
          /* pointer capture is unavailable for this pointer */
        }
      }

      function eraseAt(point, first) {
        const hit = topMost(elementsRef.current, point)
        if (hit === null) return
        const ids = withContainer(elementsRef.current, hit)
        const next = elementsRef.current.filter((element) => !ids.has(element.id))
        apply(next)
        const drag = dragRef.current
        if (drag !== null && drag.mode === 'erase') drag.erased += ids.size
      }

      function onPointerMove(event) {
        const drag = dragRef.current
        if (drag === null) return
        const point = scenePoint(event)
        if (drag.mode === 'pan') {
          applyView({
            ...drag.view,
            x: drag.view.x - (event.clientX - drag.start.x) / drag.view.zoom,
            y: drag.view.y - (event.clientY - drag.start.y) / drag.view.zoom,
          })
          return
        }
        if (drag.mode === 'move') {
          const dx = point.x - drag.start.x
          const dy = point.y - drag.start.y
          const origins = new Map(drag.origin.map((entry) => [entry.id, entry]))
          apply(
            elementsRef.current.map((element) => {
              const origin = origins.get(element.id)
              if (origin === undefined) return element
              return { ...element, x: origin.x + dx, y: origin.y + dy, _by: 'user' }
            }),
          )
          return
        }
        if (drag.mode === 'draft' && draft !== null) {
          setDraft(resizeDraft(draft, drag.start, point))
          return
        }
        if (drag.mode === 'erase') eraseAt(point, false)
      }

      function onPointerUp() {
        const drag = dragRef.current
        dragRef.current = null
        busyRef.current = false
        if (drag !== null && drag.mode === 'draft' && draft !== null) {
          const finished = draft
          setDraft(null)
          if (isMeaningful(finished)) {
            remember()
            commit(elementsRef.current.concat([finished]))
          }
        } else if (drag !== null && drag.mode === 'move') {
          schedulePush()
        } else if (drag !== null && drag.mode === 'pan') {
          /* the view moved, the scene did not */
        } else if (drag !== null && drag.mode === 'erase') {
          if (drag.erased > 0) schedulePush()
          else historyRef.current.past.pop()
        }
      }

      function onPointerCancel() {
        dragRef.current = null
        busyRef.current = false
        setDraft(null)
      }

      function isMeaningful(element) {
        if (element.type === 'freedraw') return Array.isArray(element.points) && element.points.length > 1
        if (element.type === 'arrow' || element.type === 'line') {
          return Math.hypot(element.width, element.height) > 6
        }
        return element.width > 4 || element.height > 4
      }

      function openEditor(next) {
        editorRef.current = next
        setEditor(next)
      }

      function closeEditor() {
        editorRef.current = null
        setEditor(null)
      }

      function commitText() {
        const current = editorRef.current
        if (current === null) return
        editorRef.current = null
        setEditor(null)
        const value = current.value.trim()
        if (value === '') return
        const fontSize = 20
        const lines = wrapText(value, 520, fontSize)
        let widest = 0
        for (const line of lines) {
          let width = 0
          for (const char of line) width += glyphWidth(char, fontSize)
          widest = Math.max(widest, width)
        }
        const element = baseElement('text', {
          x: current.x,
          y: current.y,
          width: Math.max(20, Math.ceil(widest)),
          height: Math.ceil(lines.length * fontSize * 1.25),
          text: value,
          originalText: value,
          fontSize,
          fontFamily: 1,
          textAlign: 'left',
          verticalAlign: 'top',
          baseline: Math.round(fontSize * 0.9),
          lineHeight: 1.25,
          containerId: null,
          strokeColor: stroke,
        })
        remember()
        commit(elementsRef.current.concat([element]))
      }

      function onKeyDown(event) {
        const meta = event.metaKey || event.ctrlKey
        if (event.code === 'Space' || event.key === ' ') {
          spaceRef.current = true
          event.preventDefault()
          return
        }
        if (meta && event.key.toLowerCase() === 'z') {
          event.preventDefault()
          if (event.shiftKey) redo()
          else undo()
          return
        }
        if (event.key === 'Delete' || event.key === 'Backspace') {
          if (selected === '') return
          event.preventDefault()
          remember()
          removeIds([...withContainer(elementsRef.current, { id: selected })])
          return
        }
        if (event.key === 'Escape') {
          setSelected('')
          setDraft(null)
          closeEditor()
        }
      }

      function onKeyUp(event) {
        if (event.code === 'Space' || event.key === ' ') spaceRef.current = false
      }

      /* ----------------------------------------------------------- effects */

      useEffect(() => {
        const locale = runtime.locale
        if (locale === null || typeof locale.getSnapshot !== 'function') return undefined
        diag('tab-mounted', `session ${String(sessionId).slice(0, 12)}`)
        return undefined
      }, [sessionId])

      useEffect(() => {
        let stopped = false
        let timer = 0
        versionRef.current = -1
        apply([])
        const tickPull = () => {
          if (stopped) return
          if (document.visibilityState === 'hidden') {
            timer = setTimeout(tickPull, 1500)
            return
          }
          pull()
            .catch((error) => setNotice({ ok: false, text: `${t('notice.load')}${messageOf(error)}` }))
            .then(() => {
              if (!stopped) timer = setTimeout(tickPull, 650)
            })
        }
        tickPull()
        return () => {
          stopped = true
          clearTimeout(timer)
          if (pushTimer.current) clearTimeout(pushTimer.current)
        }
      }, [])

      // Track the drawing area so the SVG can map scene units onto it exactly.
      // The tab body is not ours: when it lays a child out at content size, take
      // the room it offers so the canvas still covers the pane.
      useEffect(() => {
        const stage = stageRef.current
        if (stage === null) return undefined
        const root = rootRef.current
        const parent = root === null ? null : root.parentElement
        const settle = () => {
          if (root === null || parent === null) return
          const availableWidth = parent.clientWidth
          const availableHeight = parent.clientHeight
          const box = root.getBoundingClientRect()
          if (availableWidth > 0 && box.width < availableWidth - 8) {
            root.style.width = `${availableWidth}px`
            root.style.flex = '0 0 auto'
          }
          if (availableHeight > 0 && box.height < availableHeight - 8) {
            root.style.height = `${availableHeight}px`
            root.style.flexBasis = 'auto'
          }
        }
        const measure = () => {
          settle()
          const w = stage.clientWidth
          const h = stage.clientHeight
          if (w <= 0 || h <= 0) return
          sizeRef.current = { w, h }
          setSize({ w, h })
        }
        measure()
        if (typeof ResizeObserver !== 'function') return undefined
        const observer = new ResizeObserver(measure)
        observer.observe(stage)
        if (parent !== null) observer.observe(parent)
        return () => {
          observer.disconnect()
          if (root !== null) {
            root.style.removeProperty('width')
            root.style.removeProperty('height')
            root.style.removeProperty('flex')
            root.style.removeProperty('flex-basis')
          }
        }
      }, [])

      // Frame the board once the first scene arrives, then never move by itself.
      useEffect(() => {
        if (fittedRef.current || !ready || size.w <= 0 || size.h <= 0) return
        fittedRef.current = true
        const list = elementsRef.current
        if (list.length === 0) {
          frame({ x: 0, y: 0, width: BOARD.width, height: BOARD.height })
          return
        }
        let minX = Infinity
        let minY = Infinity
        let maxX = -Infinity
        let maxY = -Infinity
        for (const element of list) {
          const box = elementBounds(element)
          minX = Math.min(minX, box.x)
          minY = Math.min(minY, box.y)
          maxX = Math.max(maxX, box.x + box.width)
          maxY = Math.max(maxY, box.y + box.height)
        }
        frame({ x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) })
      }, [ready, size.w, size.h])

      // Wheel pans the infinite board; Cmd/Ctrl + wheel zooms around the pointer.
      useEffect(() => {
        const svg = svgRef.current
        if (svg === null) return undefined
        const onWheel = (event) => {
          event.preventDefault()
          const current = viewRef.current
          const rect = svg.getBoundingClientRect()
          const width = sizeRef.current.w > 0 ? sizeRef.current.w : rect.width
          const scale = (rect.width * current.zoom) / width
          if (event.ctrlKey || event.metaKey) {
            const anchor = {
              x: current.x + (event.clientX - rect.left) / scale,
              y: current.y + (event.clientY - rect.top) / scale,
            }
            const zoomNext = clampZoom(current.zoom * Math.exp(-event.deltaY * 0.0025))
            const ratio = zoomNext / current.zoom
            applyView({
              zoom: zoomNext,
              x: anchor.x - (anchor.x - current.x) / ratio,
              y: anchor.y - (anchor.y - current.y) / ratio,
            })
            return
          }
          applyView({
            zoom: current.zoom,
            x: current.x + event.deltaX / current.zoom,
            y: current.y + event.deltaY / current.zoom,
          })
        }
        svg.addEventListener('wheel', onWheel, { passive: false })
        return () => svg.removeEventListener('wheel', onWheel)
      }, [])

      useEffect(() => {
        if (flash.ids.length === 0) return undefined
        const timer = setTimeout(() => setFlash((current) => ({ ids: [], token: current.token })), 1200)
        return () => clearTimeout(timer)
      }, [flash.token])

      /* ------------------------------------------------------------ render */

      const byId = new Map()
      for (const element of elements) byId.set(element.id, element)
      const viewWidth = size.w > 0 ? size.w / zoom : BOARD.width
      const viewHeight = size.h > 0 ? size.h / zoom : BOARD.height
      const flashIds = new Set(flash.ids)
      const visible = draft === null ? elements : elements.concat([draft])

      const toolHint =
        tool === 'select'
          ? t('hint.select')
          : tool === 'eraser'
            ? t('hint.eraser')
            : tool === 'text'
              ? t('hint.text')
              : tool === 'draw'
                ? t('hint.draw')
                : t('hint.shape')

      return h(
        'div',
        { className: 'eca-root', 'data-tick': tick, ref: rootRef },
        h('style', null, STYLES),

        h(
          'div',
          { className: 'eca-bar', role: 'toolbar', 'aria-label': t('tab.title') },
          TOOLS.map((name) =>
            h(
              ToolButton,
              {
                key: name,
                pressed: tool === name,
                label: t(`tool.${name}`),
                onClick: () => {
                  setTool(name)
                  if (name !== 'select') setSelected('')
                },
              },
              h(ToolIcon, { name }),
            ),
          ),
        ),

        h(
          'div',
          { className: 'eca-bar eca-bar-colors' },
          h(
            'div',
            { className: 'eca-swatches', role: 'group', 'aria-label': t('colors.stroke') },
            STROKE_COLORS.map((color) =>
              h('button', {
                key: color,
                type: 'button',
                className: 'eca-swatch' + (stroke === color ? ' eca-swatch-on' : ''),
                style: { background: color },
                'aria-label': `${t('colors.stroke')} ${color}`,
                'aria-pressed': stroke === color ? 'true' : 'false',
                onClick: () => setStroke(color),
              }),
            ),
          ),
          h(
            'div',
            { className: 'eca-swatches', role: 'group', 'aria-label': t('colors.fill') },
            FILL_COLORS.map((color) =>
              h('button', {
                key: color,
                type: 'button',
                className:
                  'eca-swatch eca-swatch-fill' + (fill === color ? ' eca-swatch-on' : '') + (color === 'transparent' ? ' eca-swatch-empty' : ''),
                style: color === 'transparent' ? undefined : { background: color },
                'aria-label': color === 'transparent' ? t('colors.none') : `${t('colors.fill')} ${color}`,
                'aria-pressed': fill === color ? 'true' : 'false',
                onClick: () => setFill(color),
              }),
            ),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'eca-weight',
              'aria-label': t('weight'),
              title: `${t('weight')} ${weight}`,
              onClick: () => setWeight(weight >= 4 ? 1 : weight + 1),
            },
            h('span', { className: 'eca-weight-dot', style: { width: 3 + weight * 2, height: 3 + weight * 2 } }),
          ),
          h('span', { className: 'eca-spacer', 'aria-hidden': 'true' }),
          h(ToolButton, { label: t('undo'), onClick: undo }, h('span', { className: 'eca-glyph' }, '↶')),
          h(ToolButton, { label: t('redo'), onClick: redo }, h('span', { className: 'eca-glyph' }, '↷')),
          h(ToolButton, { label: t('zoom.out'), onClick: () => zoomTo(zoom / 1.25) }, h('span', { className: 'eca-glyph' }, '−')),
          h(
            'button',
            {
              type: 'button',
              className: 'eca-zoom',
              title: t('zoom.reset'),
              'aria-label': t('zoom.reset'),
              onClick: () => zoomTo(1),
            },
            `${Math.round(zoom * 100)}%`,
          ),
          h(ToolButton, { label: t('zoom.in'), onClick: () => zoomTo(zoom * 1.25) }, h('span', { className: 'eca-glyph' }, '+')),
          h(ToolButton, { label: t('clear'), onClick: clearAll }, h('span', { className: 'eca-glyph' }, '⌫')),
          h(ToolButton, { label: t('export'), onClick: download }, h('span', { className: 'eca-glyph' }, '⤓')),
        ),

        h(
          'div',
          { className: 'eca-stage', ref: stageRef },
          h(
            'div',
            { className: 'eca-paper' },
            h(
              'svg',
              {
                ref: svgRef,
                className: 'eca-svg',
                width: '100%',
                height: '100%',
                viewBox: `${f(view.x)} ${f(view.y)} ${f(Math.max(1, viewWidth))} ${f(Math.max(1, viewHeight))}`,
                preserveAspectRatio: 'none',
                role: 'application',
                tabIndex: 0,
                'aria-label': t('canvas.label'),
                onPointerDown,
                onPointerMove,
                onPointerUp,
                onPointerCancel,
                onKeyDown,
                onKeyUp,
                onBlur: () => {
                  spaceRef.current = false
                },
              },
              h(
                'defs',
                null,
                h(
                  'pattern',
                  { id: `${docId.current}-grid`, width: 26, height: 26, patternUnits: 'userSpaceOnUse' },
                  h('circle', { cx: 1.4, cy: 1.4, r: 1.1, fill: '#dcdcdc' }),
                ),
                visible.map((element) =>
                  element.type === 'rectangle' || element.type === 'ellipse' || element.type === 'diamond'
                    ? h(
                        'clipPath',
                        { key: `clip-${element.id}`, id: `${docId.current}-${element.id}` },
                        h('path', { d: idealPath(element) }),
                      )
                    : null,
                ),
              ),
              h('rect', {
                x: view.x,
                y: view.y,
                width: viewWidth,
                height: viewHeight,
                fill: '#ffffff',
              }),
              h('rect', {
                x: view.x,
                y: view.y,
                width: viewWidth,
                height: viewHeight,
                fill: `url(#${docId.current}-grid)`,
              }),
              visible.map((element) =>
                renderElement(element, {
                  byId,
                  clipPrefix: docId.current,
                  selected: element.id === selected,
                  flashing: flashIds.has(element.id),
                }),
              ),
              selected !== '' && byId.has(selected)
                ? h(
                    'rect',
                    {
                      x: elementBounds(byId.get(selected)).x - 6,
                      y: elementBounds(byId.get(selected)).y - 6,
                      width: Math.max(6, elementBounds(byId.get(selected)).width + 12),
                      height: Math.max(6, elementBounds(byId.get(selected)).height + 12),
                      fill: 'none',
                      stroke: '#6965db',
                      strokeWidth: 1.4,
                      strokeDasharray: '5 4',
                      pointerEvents: 'none',
                    },
                  )
                : null,
            ),
            editor !== null
              ? h('textarea', {
                  className: 'eca-editor',
                  autoFocus: true,
                  value: editor.value,
                  placeholder: t('text.placeholder'),
                  style: {
                    left: (editor.x - view.x) * zoom,
                    top: (editor.y - view.y) * zoom,
                    fontSize: editor.fontSize * zoom,
                    lineHeight: 1.25,
                    fontFamily: HAND_FONT,
                    color: stroke,
                  },
                  onChange: (event) => {
                    const next = { ...editorRef.current, value: event.target.value }
                    editorRef.current = next
                    setEditor(next)
                  },
                  onBlur: commitText,
                  onKeyDown: (event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      commitText()
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      closeEditor()
                    }
                  },
                })
              : null,
          ),
        ),

        h(
          'div',
          { className: 'eca-status' },
          h('span', {
            className: 'eca-dot' + (notice.ok && connected ? ' eca-dot-ok' : notice.ok ? '' : ' eca-dot-bad'),
            'aria-hidden': 'true',
          }),
          h('span', { className: 'eca-status-text' }, notice.ok ? toolHint : notice.text),
          h('span', { className: 'eca-counts' }, `AI ${counts.ai} · ${t('status.you')} ${counts.user}`),
          elements.length === 0 && notice.ok ? h('span', { className: 'eca-empty' }, t('status.empty')) : null,
        ),
      )
    }

    function useLocaleTick() {
      const [tick, setTick] = useState(0)
      useEffect(() => {
        const locale = runtime.locale
        if (locale === null || typeof locale.subscribe !== 'function') return undefined
        return locale.subscribe(() => setTick((value) => value + 1))
      }, [])
      return tick
    }

    /* ------------------------------------------------------------ one node */

    function renderElement(element, options) {
      const rand = mulberry32(hashSeed(element.id) ^ (Number(element.seed) >>> 0))
      const stroke = element.strokeColor || '#1e1e1e'
      const weight = Number(element.strokeWidth) || 2
      const dash = dashArray(element)
      const className =
        'eca-el' + (options.flashing ? ' eca-el-new' : '') + (options.selected ? ' eca-el-sel' : '')
      const children = []

      if (element.type === 'rectangle' || element.type === 'ellipse' || element.type === 'diamond') {
        const points =
          element.type === 'ellipse' ? ellipsePoints(element) : cornerPoints(element)
        const outline = roughClosed(points, rand, Math.max(0.8, Math.min(3, (element.width + element.height) / 220)))
        if (element.fillStyle === 'solid' && element.backgroundColor !== 'transparent') {
          children.push(
            h('path', {
              key: 'fill',
              d: idealPath(element),
              fill: element.backgroundColor,
              stroke: 'none',
              opacity: (Number(element.opacity) || 100) / 100,
            }),
          )
        } else if (element.backgroundColor !== 'transparent' && element.fillStyle !== 'none') {
          children.push(
            h(
              'g',
              { key: 'fill', clipPath: `url(#${options.clipPrefix}-${element.id})`, opacity: 0.85 },
              h('path', {
                d: hachureLines(element, mulberry32(hashSeed(`${element.id}-fill`))),
                fill: 'none',
                stroke: element.backgroundColor,
                strokeWidth: 1.6,
                strokeLinecap: 'round',
              }),
            ),
          )
        }
        children.push(
          h('path', {
            key: 'outline',
            d: outline,
            fill: 'none',
            stroke,
            strokeWidth: weight,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
            strokeDasharray: dash || undefined,
            opacity: (Number(element.opacity) || 100) / 100,
          }),
        )
      } else if (element.type === 'arrow' || element.type === 'line') {
        const points = pointsOf(element)
        children.push(
          h('path', {
            key: 'line',
            d: roughPolyline(points, rand, 1.2),
            fill: 'none',
            stroke,
            strokeWidth: weight,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
            strokeDasharray: dash || undefined,
            opacity: (Number(element.opacity) || 100) / 100,
          }),
        )
        if (element.type === 'arrow' && points.length >= 2) {
          const to = points[points.length - 1]
          const from = points[points.length - 2]
          children.push(
            h('path', {
              key: 'head',
              d: arrowHead(from, to, Math.max(9, weight * 4.5)),
              fill: 'none',
              stroke,
              strokeWidth: weight,
              strokeLinecap: 'round',
              strokeLinejoin: 'round',
            }),
          )
        }
      } else if (element.type === 'freedraw') {
        const points = pointsOf(element)
        if (points.length > 1) {
          children.push(
            h('polyline', {
              key: 'ink',
              points: points.map(([x, y]) => `${f(x)},${f(y)}`).join(' '),
              fill: 'none',
              stroke,
              strokeWidth: Math.max(1.5, weight),
              strokeLinecap: 'round',
              strokeLinejoin: 'round',
              opacity: (Number(element.opacity) || 100) / 100,
            }),
          )
        }
      } else if (element.type === 'text') {
        const container = element.containerId ? options.byId.get(element.containerId) : null
        const fontSize = Number(element.fontSize) || 20
        const lineHeight = fontSize * 1.25
        const available = container ? Math.max(28, container.width - 20) : element.width > 0 ? element.width : 460
        const lines = wrapText(element.text || '', available, fontSize)
        const total = lines.length * lineHeight
        const anchor = container ? 'middle' : 'start'
        const originX = container ? container.x + container.width / 2 : element.x
        const originY = container
          ? container.y + container.height / 2 - total / 2 + fontSize * 0.82
          : element.y + fontSize * 0.86
        children.push(
          h(
            'text',
            {
              key: 'text',
              fill: stroke,
              fontFamily: HAND_FONT,
              fontSize,
              textAnchor: anchor,
              opacity: (Number(element.opacity) || 100) / 100,
            },
            lines.map((line, index) =>
              h('tspan', { key: index, x: f(originX), y: f(originY + index * lineHeight) }, line === '' ? ' ' : line),
            ),
          ),
        )
      }

      return h(
        'g',
        { key: element.id, className, 'data-element-id': element.id, 'data-author': element._by || 'user' },
        children,
      )
    }

    function stripInternal(element) {
      const copy = { ...element }
      delete copy._by
      delete copy._v
      return copy
    }

    function messageOf(error) {
      if (error === null || error === undefined) return 'unknown error'
      return String(error.message || error)
    }

    /* ------------------------------------------------- open watcher/service */

    function currentSession(ctx) {
      try {
        const sidebarRight = ctx.get('sidebarRight')
        if (!sidebarRight) return ''
        const mounted = sidebarRight.mounted
        if (mounted === null || mounted === undefined) return ''
        if (typeof mounted.get === 'function') return stringOf(mounted.get())
        if (typeof mounted.getSnapshot === 'function') return stringOf(mounted.getSnapshot())
        if (typeof mounted.peek === 'function') return stringOf(mounted.peek())
        if (typeof mounted === 'string') return mounted
        if (typeof mounted.value === 'string') return mounted.value
      } catch {
        return ''
      }
      return ''
    }

    function stringOf(value) {
      return typeof value === 'string' ? value : ''
    }

    function startWatcher(ctx) {
      let stopped = false
      let timer = 0
      let seen = null
      let reported = '\u0000'
      const opened = new Set()

      const tick = async () => {
        if (stopped) return
        try {
          if (document.visibilityState !== 'hidden') {
            const response = await fetch(`${API}/activity`, {
              cache: 'no-store',
              headers: { accept: 'application/json' },
            })
            const data = await response.json()
            const activity = data && data.ok ? data.activity : null
            const session = currentSession(ctx)
            if (session !== reported) {
              reported = session
              diag('session', session === '' ? 'no mounted session resolved' : `mounted session ${session.slice(0, 12)}`)
            }
            if (session !== '') runtime.lastSession = session
            // Adopt the activity the page booted with, so a refresh never re-opens
            // a tab the user closed; only a draw that lands while this page is
            // watching may claim the sidebar.
            if (seen === null) {
              seen = activity && Number.isFinite(activity.version) ? activity.version : 0
            } else if (activity && Number.isFinite(activity.version) && activity.version > seen) {
              seen = activity.version
              if (activity.by === 'ai' && !opened.has('shared')) {
                try {
                  ctx.sidebarRight.openTab(TAB_KIND)
                  opened.add('shared')
                  diag('auto-open', 'opened the shared canvas tab')
                } catch (error) {
                  diag('auto-open-failed', messageOf(error))
                }
              }
            }
          }
        } catch {
          /* the Host route may not be up yet */
        }
        if (!stopped) timer = setTimeout(tick, 2000)
      }
      tick()
      return () => {
        stopped = true
        clearTimeout(timer)
      }
    }

    /* ---------------------------------------------------------------- styles */

    const STYLES = `
.eca-root {
  width: 100%;
  width: -webkit-fill-available;
  height: 100%;
  min-width: 0;
  min-height: 0;
  flex: 1 1 auto;
  align-self: stretch;
  display: flex;
  flex-direction: column;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  line-height: 18px;
}
.eca-root *, .eca-root *::before, .eca-root *::after { box-sizing: border-box; }

.eca-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}
.eca-bar-colors { gap: 8px; padding: 6px 8px; }
.eca-spacer { flex: 1 1 auto; min-width: 6px; }

.eca-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
}
.eca-btn:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.eca-btn:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.eca-btn-on {
  background: var(--dsw-alias-bg-layer-2);
  border-color: var(--dsw-alias-border-l2);
  color: var(--dsw-alias-brand-primary);
}
.eca-btn[disabled] { opacity: 0.45; cursor: default; }

.eca-glyph { font-size: 15px; line-height: 1; }

.eca-swatches { display: flex; align-items: center; gap: 4px; }
.eca-swatch {
  width: 18px;
  height: 18px;
  padding: 0;
  border-radius: 50%;
  border: 1px solid var(--dsw-alias-border-l2);
  cursor: pointer;
}
.eca-swatch:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.eca-swatch-on { box-shadow: 0 0 0 2px var(--dsw-alias-bg-base), 0 0 0 3.5px var(--dsw-alias-brand-primary); }
.eca-swatch-fill { border-radius: 5px; }
.eca-swatch-empty {
  background:
    linear-gradient(to top right, transparent 46%, var(--dsw-alias-label-secondary) 46%, var(--dsw-alias-label-secondary) 54%, transparent 54%),
    var(--dsw-alias-bg-layer-1);
}

.eca-weight {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 22px;
  margin-left: 0;
  padding: 0;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 7px;
  background: transparent;
  cursor: pointer;
}
.eca-weight-dot { display: block; border-radius: 50%; background: var(--dsw-alias-label-primary); }
.eca-weight:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }

.eca-zoom {
  min-width: 46px;
  height: 26px;
  padding: 0 6px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 7px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}
.eca-zoom:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.eca-zoom:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }

.eca-stage {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 180px;
  overflow: hidden;
  background: #ffffff;
  padding: 0;
}
.eca-paper {
  position: absolute;
  inset: 0;
  background: #ffffff;
  overflow: hidden;
}
.eca-svg {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
  cursor: crosshair;
  user-select: none;
  -webkit-user-select: none;
  outline: none;
}
.eca-svg:focus-visible { box-shadow: inset 0 0 0 2px var(--dsw-alias-brand-primary); }
.eca-svg * { pointer-events: none; }

.eca-el-new { animation: eca-appear 1.1s ease-out; }
@keyframes eca-appear {
  0% { opacity: 0.15; transform: translateY(-2px); }
  55% { opacity: 1; }
  100% { opacity: 1; transform: none; }
}

.eca-editor {
  position: absolute;
  z-index: 3;
  min-width: 160px;
  max-width: 420px;
  min-height: 1.3em;
  padding: 2px 4px;
  border: 1px dashed #6965db;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.92);
  outline: none;
  resize: none;
  overflow: hidden;
  white-space: pre-wrap;
}

.eca-status {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px 8px;
  border-top: 1px solid var(--dsw-alias-border-l1);
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  line-height: 15px;
  min-height: 30px;
}
.eca-status-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.eca-counts { margin-left: auto; font-variant-numeric: tabular-nums; }
.eca-empty { display: none; }
.eca-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--dsw-alias-state-idle-primary);
  flex: 0 0 auto;
}
.eca-dot-ok { background: var(--dsw-alias-state-success-primary); }
.eca-dot-bad { background: var(--dsw-alias-state-error-primary); }

@media (prefers-reduced-motion: reduce) {
  .eca-el-new { animation: none; }
  .eca-btn { transition: none; }
}
`

    /* ----------------------------------------------------------------- apply */

    return {
      inject: ['slots', 'locale', 'sidebarRightTabs', 'sidebarRight'],
      apply(ctx) {
        runtime.locale = ctx.locale
        runtime.translate = ctx.locale.bind(NS)

        ctx.effect(() => ctx.locale.register(NS, 'zh', DICTS.zh))
        ctx.effect(() => ctx.locale.register(NS, 'en', DICTS.en))

        ctx.effect(() => {
          const tabs = ctx.get('sidebarRightTabs')
          if (!tabs) {
            diag('tabs-missing', 'sidebarRightTabs is unavailable in this Client')
            return () => {}
          }
          return tabs.register({
            id: TAB_ID,
            kind: TAB_KIND,
            title: () => runtime.translate('tab.title'),
            guide: [
              {
                id: 'canvas',
                order: 30,
                title: () => runtime.translate('guide.title'),
                description: () => runtime.translate('guide.description'),
                icon: CanvasGlyph,
              },
            ],
          })
        }, 'excalidraw-canvas: tab type')

        ctx.effect(
          () =>
            ctx.slots.inject('sidebar.right.pane.tab', () =>
              ctx.slots.register({ name: 'sidebar.right.pane.tab', key: TAB_ID }, CanvasPanel),
            ),
          'excalidraw-canvas: tab body',
        )

        ctx.effect(() => startWatcher(ctx), 'excalidraw-canvas: activity watcher')
      },
    }
  },
})
