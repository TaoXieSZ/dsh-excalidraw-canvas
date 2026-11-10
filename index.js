/**
 * Excalidraw canvas bundle — Host half.
 *
 * One scene per Session. Two callers share it:
 *  - the agent, through `excalidraw_draw` / `excalidraw_canvas`;
 *  - the right-sidebar canvas tab, through same-origin HTTP routes.
 *
 * The Client polls the scene, posts its own strokes back, and the tool mutates
 * the same object, so AI strokes and user strokes land on one board instead of
 * two private copies. Scenes are mirrored to one JSON file under the Harness
 * home, so a plugin reload or an application restart does not wipe the board;
 * the session log and the workspace are never touched.
 */
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'

export const inject = ['tools', 'webServer']

const API = '/excalidraw/api'
const BOARD = { width: 1600, height: 1000 }
const ELEMENT_LIMIT = 600
const DIARY_LIMIT = 40
const BODY_LIMIT = 4 * 1024 * 1024

/** One shared board for the whole profile: `shared -> { version, elements, updatedAt }`. */
const SCENE = 'shared'
const scenes = new Map()
/** Newest AI mutation across every scene; the Client watcher opens the tab on it. */
const latest = { activity: null }
/** Ring buffer of Client diagnostics, readable over HTTP for verification. */
const diary = []

export function apply(ctx) {
  loadScenes()
  diary.push({ at: new Date().toISOString(), level: 'host', message: `host half active · ${scenes.size} saved scene(s)` })
  ctx.effect(() => registerRoutes(ctx), 'excalidraw-canvas: http api')
  ctx.effect(() => ctx.tools.register(drawTool()), 'excalidraw-canvas: draw tool')
  ctx.effect(() => ctx.tools.register(canvasTool()), 'excalidraw-canvas: canvas tool')
  // Flush a pending write before the module goes away on reload or unload.
  ctx.effect(() => () => flushScenes(), 'excalidraw-canvas: scene persistence')
}

/* ------------------------------------------------------------- persistence */

function stateFile() {
  const home = text(process.env.DSH_HOME) || join(homedir(), '.dsh')
  return join(home, 'excalidraw-canvas', 'scenes.json')
}

/** Read the saved scenes once at activation; a broken file never blocks the plugin. */
function loadScenes() {
  let raw
  try {
    raw = readFileSync(stateFile(), 'utf8')
  } catch (error) {
    if (!error || error.code !== 'ENOENT') {
      diary.push({ at: new Date().toISOString(), level: 'load-failed', message: messageOf(error) })
    }
    return
  }
  try {
    const parsed = JSON.parse(raw)
    const stored = parsed && typeof parsed === 'object' && parsed.scenes ? parsed.scenes : {}
    // Older files kept one scene per Session; fold them into the shared board.
    const byId = new Map()
    let version = 0
    let updatedAt = 0
    for (const scene of Object.values(stored)) {
      if (scene === null || typeof scene !== 'object' || !Array.isArray(scene.elements)) continue
      version = Math.max(version, Number.isFinite(scene.version) ? Number(scene.version) : 0)
      updatedAt = Math.max(updatedAt, Number.isFinite(scene.updatedAt) ? Number(scene.updatedAt) : 0)
      for (const element of scene.elements.slice(-ELEMENT_LIMIT)) {
        const clean = normalizeElement(element)
        if (clean !== null) byId.set(clean.id, clean)
      }
    }
    if (byId.size > 0) {
      scenes.set(SCENE, { version, updatedAt, elements: [...byId.values()].slice(-ELEMENT_LIMIT) })
    }
  } catch (error) {
    diary.push({ at: new Date().toISOString(), level: 'load-failed', message: messageOf(error) })
  }
}

let saveTimer = null

function scheduleSave() {
  if (saveTimer !== null) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    void flushScenes()
  }, 300)
}

async function flushScenes() {
  if (saveTimer !== null) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  const payload = { version: 1, savedAt: new Date().toISOString(), scenes: {} }
  for (const [sessionId, scene] of scenes) {
    if (scene.elements.length === 0) continue
    payload.scenes[sessionId] = { version: scene.version, updatedAt: scene.updatedAt, elements: scene.elements }
  }
  const file = stateFile()
  try {
    await mkdir(dirname(file), { recursive: true })
    const temporary = `${file}.${process.pid}.tmp`
    await writeFile(temporary, JSON.stringify(payload), 'utf8')
    await rename(temporary, file)
  } catch (error) {
    diary.push({ at: new Date().toISOString(), level: 'save-failed', message: messageOf(error) })
  }
}

/* ------------------------------------------------------------------ routes */

function registerRoutes(ctx) {
  // A `resource` route only answers GET/HEAD, so the two routes that take a
  // Client upload are raw `handler` routes.
  const disposers = [
    ctx.webServer.register({ kind: 'exact', path: `${API}/scene`, handler: handleScene }),
    ctx.webServer.register({ kind: 'exact', path: `${API}/activity`, resource: handleActivity }),
    ctx.webServer.register({ kind: 'exact', path: `${API}/diag`, handler: handleDiag }),
  ]
  return () => {
    for (const dispose of disposers) {
      try {
        dispose()
      } catch {
        /* the web server is already tearing the route down */
      }
    }
  }
}

async function handleScene(req, res) {
  try {
    if (!trusted(req)) return sendJson(res, { ok: false, error: 'cross-origin request refused' }, 403)
    const url = new URL(req.url || '/', 'http://localhost')
    const head = req.method === 'HEAD'
    if (req.method === 'GET' || head) {
      const since = Number(url.searchParams.get('since'))
      const scene = sceneOf(SCENE)
      if (Number.isFinite(since) && since === scene.version) {
        return sendJson(res, { ok: true, version: scene.version, changed: false, board: BOARD }, 200, head)
      }
      return sendJson(
        res,
        {
          ok: true,
          version: scene.version,
          changed: true,
          board: BOARD,
          updatedAt: scene.updatedAt,
          elements: scene.elements,
        },
        200,
        head,
      )
    }
    if (req.method === 'POST') {
      const raw = await readBody(req)
      const body = raw === '' ? null : JSON.parse(raw)
      if (body === null || typeof body !== 'object') {
        return sendJson(res, { ok: false, error: 'invalid body' }, 400)
      }
      const scene = mergeClientScene(SCENE, body.elements, Number(body.baseVersion))
      return sendJson(res, { ok: true, version: scene.version, changed: true, elements: scene.elements })
    }
    res.writeHead(405, { allow: 'GET, HEAD, POST', 'content-length': '0' })
    res.end()
  } catch (error) {
    sendJson(res, { ok: false, error: messageOf(error) }, 400)
  }
}

async function handleActivity(request) {
  if (!trusted(request)) return json({ ok: false, error: 'cross-origin request refused' }, 403)
  return json({ ok: true, activity: latest.activity })
}

async function handleDiag(req, res) {
  try {
    if (!trusted(req)) return sendJson(res, { ok: false, error: 'cross-origin request refused' }, 403)
    if (req.method === 'POST') {
      const raw = await readBody(req)
      const body = raw === '' ? null : JSON.parse(raw)
      if (body !== null && typeof body === 'object') {
        diary.push({
          at: new Date().toISOString(),
          level: text(body.level).slice(0, 20) || 'log',
          message: text(body.message).slice(0, 400),
        })
        if (diary.length > DIARY_LIMIT) diary.splice(0, diary.length - DIARY_LIMIT)
      }
      return sendJson(res, { ok: true })
    }
    if (req.method === 'GET' || req.method === 'HEAD') {
      return sendJson(res, { ok: true, entries: diary.slice(-DIARY_LIMIT) }, 200, req.method === 'HEAD')
    }
    res.writeHead(405, { allow: 'GET, HEAD, POST', 'content-length': '0' })
    res.end()
  } catch (error) {
    sendJson(res, { ok: false, error: messageOf(error) }, 400)
  }
}

function trusted(source) {
  const site = typeof source.headers.get === 'function' ? source.headers.get('sec-fetch-site') : source.headers['sec-fetch-site']
  return site === undefined || site === null || site === 'same-origin' || site === 'none'
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > BODY_LIMIT) {
        reject(new Error('payload too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function sendJson(res, body, status = 200, headOnly = false) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload),
  })
  res.end(headOnly ? undefined : payload)
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

/* ------------------------------------------------------------------ scenes */

function sceneOf(sessionId) {
  let scene = scenes.get(sessionId)
  if (scene === undefined) {
    scene = { version: 0, elements: [], updatedAt: 0 }
    scenes.set(sessionId, scene)
  }
  return scene
}

function mergeClientScene(sessionId, incoming, baseVersion) {
  const scene = sceneOf(sessionId)
  const base = Number.isFinite(baseVersion) ? baseVersion : -1
  const list = Array.isArray(incoming) ? incoming.slice(0, ELEMENT_LIMIT) : []
  const clean = []
  const posted = new Set()
  const version = scene.version + 1
  const now = Date.now()

  for (const element of list) {
    const normalized = normalizeElement(element)
    if (normalized === null) continue
    clean.push(normalized)
    posted.add(normalized.id)
  }
  // Elements the Client has not seen yet (a tool call landed mid-drag) survive.
  const kept = []
  for (const element of scene.elements) {
    if (posted.has(element.id)) continue
    if ((element._v ?? 0) > base) kept.push(element)
  }
  for (const element of clean) {
    kept.push({ ...element, _v: version, _by: element._by === 'ai' ? 'ai' : 'user', updated: now })
  }
  scene.elements = kept.slice(-ELEMENT_LIMIT)
  scene.version = version
  scene.updatedAt = now
  scheduleSave()
  return scene
}

function addAiElements(sessionId, elements) {
  const scene = sceneOf(sessionId)
  const version = scene.version + 1
  const now = Date.now()
  const created = elements.map((element) => ({ ...element, _v: version, _by: 'ai', updated: now }))
  scene.elements = scene.elements.concat(created).slice(-ELEMENT_LIMIT)
  scene.version = version
  scene.updatedAt = now
  latest.activity = { version, by: 'ai', at: now, added: created.length }
  scheduleSave()
  return { scene, created }
}

/* ----------------------------------------------------------------- elements */

const SHAPES = new Set(['rectangle', 'ellipse', 'diamond'])
const STROKES = ['solid', 'dashed', 'dotted']
const FILLS = ['hachure', 'solid', 'cross-hatch', 'none']

function baseElement(type, overrides) {
  const seed = Math.floor(Math.random() * 2147483647)
  return {
    id: `e${Math.random().toString(36).slice(2, 8)}`,
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
    updated: 0,
    link: null,
    locked: false,
    _by: 'ai',
    _v: 0,
    ...overrides,
  }
}

function shapeElement(spec) {
  const type = spec.type
  const x = num(spec.x, 0)
  const y = num(spec.y, 0)
  const width = Math.abs(num(spec.width, 120))
  const height = Math.abs(num(spec.height, 80))
  const backgroundColor = color(spec.backgroundColor, 'transparent')
  const element = baseElement(type, {
    x,
    y,
    width: Math.max(1, width),
    height: Math.max(1, height),
    strokeColor: color(spec.strokeColor, '#1e1e1e'),
    backgroundColor,
    fillStyle: backgroundColor === 'transparent' ? 'none' : fillStyle(spec.fillStyle, 'hachure'),
    strokeWidth: clamp(num(spec.strokeWidth, 2), 1, 6),
    strokeStyle: strokeStyle(spec.strokeStyle),
    roundness: type === 'rectangle' ? { type: 3 } : type === 'diamond' ? { type: 2 } : null,
  })
  return element
}

function linearElement(spec) {
  const type = spec.type === 'line' ? 'line' : 'arrow'
  const x1 = num(spec.x1, num(spec.x, 0))
  const y1 = num(spec.y1, num(spec.y, 0))
  const x2 = num(spec.x2, x1 + 200)
  const y2 = num(spec.y2, y1)
  const dx = x2 - x1
  const dy = y2 - y1
  return baseElement(type, {
    x: x1,
    y: y1,
    width: dx,
    height: dy,
    points: [
      [0, 0],
      [dx, dy],
    ],
    strokeColor: color(spec.strokeColor, '#1e1e1e'),
    strokeWidth: clamp(num(spec.strokeWidth, 2), 1, 6),
    strokeStyle: strokeStyle(spec.strokeStyle),
    startBinding: null,
    endBinding: null,
    startArrowhead: null,
    endArrowhead: type === 'arrow' ? 'arrow' : null,
  })
}

function textElement(x, y, value, options = {}) {
  const fontSize = clamp(num(options.fontSize, 20), 10, 96)
  const body = String(value === undefined || value === null ? '' : value)
  const size = measureText(body, fontSize)
  return baseElement('text', {
    x,
    y,
    width: size.width,
    height: size.height,
    text: body,
    originalText: body,
    fontSize,
    fontFamily: 1,
    textAlign: options.textAlign || 'left',
    verticalAlign: options.verticalAlign || 'top',
    baseline: Math.round(fontSize * 0.9),
    lineHeight: 1.25,
    containerId: options.containerId === undefined ? null : options.containerId,
    strokeColor: color(options.strokeColor, '#1e1e1e'),
  })
}

/** Turn one model-authored spec into elements, or a reason it was skipped. */
function buildSpec(spec) {
  if (spec === null || typeof spec !== 'object') return { error: '元素不是对象' }
  const type = text(spec.type).toLowerCase()
  if (SHAPES.has(type)) {
    const shape = shapeElement(spec)
    const out = [shape]
    const label = text(spec.text)
    if (label !== '') {
      const fontSize = clamp(num(spec.fontSize, 20), 10, 96)
      const size = measureText(label, fontSize)
      const label_ = textElement(
        shape.x + shape.width / 2 - size.width / 2,
        shape.y + shape.height / 2 - size.height / 2,
        label,
        { fontSize, textAlign: 'center', verticalAlign: 'middle', containerId: shape.id, strokeColor: shape.strokeColor },
      )
      shape.boundElements = [{ type: 'text', id: label_.id }]
      out.push(label_)
    }
    return { elements: out }
  }
  if (type === 'arrow' || type === 'line') {
    const line = linearElement({ ...spec, type })
    const out = [line]
    const label = text(spec.text)
    if (label !== '') {
      const fontSize = clamp(num(spec.fontSize, 16), 10, 96)
      const size = measureText(label, fontSize)
      out.push(
        textElement(line.x + line.width / 2 - size.width / 2, line.y + line.height / 2 - size.height / 2 - 6, label, {
          fontSize,
          textAlign: 'center',
          strokeColor: line.strokeColor,
        }),
      )
    }
    return { elements: out }
  }
  if (type === 'text') {
    const value = text(spec.text)
    if (value === '') return { error: 'text 元素缺少 text' }
    return {
      elements: [
        textElement(num(spec.x, 0), num(spec.y, 0), value, {
          fontSize: num(spec.fontSize, 20),
          strokeColor: spec.strokeColor,
        }),
      ],
    }
  }
  return { error: `不支持的元素类型：${type || '(空)'}` }
}

/** Keep a Client-posted element to the fields the renderer understands. */
function normalizeElement(raw) {
  if (raw === null || typeof raw !== 'object') return null
  const id = text(raw.id).slice(0, 40)
  const type = text(raw.type)
  if (id === '') return null
  if (!SHAPES.has(type) && type !== 'arrow' && type !== 'line' && type !== 'text' && type !== 'freedraw') return null
  const element = {
    ...raw,
    id,
    type,
    x: num(raw.x, 0),
    y: num(raw.y, 0),
    width: num(raw.width, 0),
    height: num(raw.height, 0),
    angle: num(raw.angle, 0),
    strokeColor: color(raw.strokeColor, '#1e1e1e'),
    backgroundColor: color(raw.backgroundColor, 'transparent'),
    fillStyle: fillStyle(raw.fillStyle, 'hachure'),
    strokeWidth: clamp(num(raw.strokeWidth, 2), 1, 8),
    strokeStyle: strokeStyle(raw.strokeStyle),
    opacity: clamp(num(raw.opacity, 100), 0, 100),
    seed: Number.isFinite(raw.seed) ? raw.seed : Math.floor(Math.random() * 2147483647),
    points: Array.isArray(raw.points) ? raw.points.slice(0, 4000) : undefined,
    text: typeof raw.text === 'string' ? raw.text.slice(0, 4000) : undefined,
    fontSize: clamp(num(raw.fontSize, 20), 8, 120),
  }
  if (element.points === undefined) delete element.points
  if (element.text === undefined) delete element.text
  if (type === 'text' && element.text === undefined) return null
  return element
}

function isElementLike(value) {
  return value !== null && typeof value === 'object' && text(value.id) !== ''
}

/* -------------------------------------------------------------------- text */

/** Approximate box for a label, so the Client can center it without measuring twice. */
function measureText(value, fontSize) {
  const lines = String(value).split('\n')
  let widest = 0
  for (const line of lines) {
    let width = 0
    for (const char of line) width += glyphWidth(char, fontSize)
    widest = Math.max(widest, width)
  }
  return {
    width: Math.max(12, Math.ceil(widest)),
    height: Math.max(fontSize, Math.ceil(lines.length * fontSize * 1.25)),
  }
}

function glyphWidth(char, fontSize) {
  return /[\u1100-\u11ff\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\uff00-\uff60\uffe0-\uffe6]/.test(char)
    ? fontSize
    : fontSize * 0.56
}

/* ------------------------------------------------------------------- tools */

function drawTool() {
  return {
    name: 'excalidraw_draw',
    description: [
      'Draw on the shared Excalidraw canvas open in the user’s right sidebar: the shapes appear on the user’s screen within a second, and the user can keep drawing on the same board.',
      'Coordinates are canvas units, origin at the top-left, y growing down; the board is 1600×1000. Always lay elements out explicitly — nothing is placed automatically.',
      'Rectangle/ellipse/diamond take x,y,width,height plus an optional text label centered inside. Arrow/line take x1,y1,x2,y2 plus an optional label at the midpoint. Text takes x,y,text.',
      'Call this several times to build a diagram progressively: the user sees each batch as it lands. Use excalidraw_canvas action "read" first when the user has drawn something or when you must not overlap existing shapes.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        elements: {
          type: 'array',
          description: 'Elements to add, drawn in order. 1–200 per call.',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['rectangle', 'ellipse', 'diamond', 'arrow', 'line', 'text'],
                description: 'Element kind.',
              },
              x: { type: 'number', description: 'Left edge (rectangle/ellipse/diamond/text).' },
              y: { type: 'number', description: 'Top edge (rectangle/ellipse/diamond/text).' },
              width: { type: 'number', description: 'Width of a shape, in canvas units.' },
              height: { type: 'number', description: 'Height of a shape, in canvas units.' },
              x1: { type: 'number', description: 'Start x of an arrow or line.' },
              y1: { type: 'number', description: 'Start y of an arrow or line.' },
              x2: { type: 'number', description: 'End x of an arrow or line.' },
              y2: { type: 'number', description: 'End y of an arrow or line.' },
              text: { type: 'string', description: 'Label: centered inside a shape, at the midpoint of an arrow, or the content of a text element.' },
              strokeColor: { type: 'string', description: 'Stroke color such as #1e1e1e, #1971c2, #e03131.' },
              backgroundColor: { type: 'string', description: 'Fill color such as #ffec99, #d0ebff, #d3f9d8; omit for no fill.' },
              fillStyle: {
                type: 'string',
                enum: ['hachure', 'solid', 'cross-hatch', 'none'],
                description: 'How the fill is painted; hachure is the Excalidraw sketch look.',
              },
              strokeWidth: { type: 'number', description: 'Line weight, 1–6.' },
              strokeStyle: {
                type: 'string',
                enum: ['solid', 'dashed', 'dotted'],
                description: 'Stroke dash style.',
              },
              fontSize: { type: 'number', description: 'Label size, 10–96. Default 20 for shapes, 16 for arrows.' },
            },
            required: ['type'],
          },
        },
        clear: {
          type: 'boolean',
          description: 'Erase the whole canvas before drawing these elements.',
        },
      },
      required: ['elements'],
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: String(value) }],
    },
    execute(args, exec) {
      const input = args !== null && typeof args === 'object' ? args : {}
      const specs = Array.isArray(input.elements) ? input.elements : null
      if (specs === null) throw new Error('elements must be an array of element specs')
      if (specs.length === 0) throw new Error('elements is empty: pass at least one element')
      const sessionId = sessionOf(exec)
      const scene = sceneOf(sessionId)
      const cleared = input.clear === true
      if (cleared) scene.elements = []
      const built = []
      const errors = []
      for (const spec of specs.slice(0, 200)) {
        const result = buildSpec(spec)
        if (result.error !== undefined) {
          errors.push(result.error)
          continue
        }
        built.push(...result.elements)
      }
      if (built.length === 0) {
        throw new Error(`nothing was drawn: ${errors.slice(0, 4).join('; ') || 'every spec was empty'}`)
      }
      const added = addAiElements(sessionId, built)
      const lines = [`已画 ${countElements(built)} 个元素，画布上共 ${added.scene.elements.length} 个。`]
      lines.push(sceneDigest(added.created))
      if (cleared) lines.unshift('已清空画布。')
      if (errors.length > 0) lines.push(`跳过 ${errors.length} 个无法解析的元素：${errors.slice(0, 4).join('；')}`)
      lines.push('用户在右侧画布上实时可见；需要看图或改动画布时调用 excalidraw_canvas。')
      return lines.join('\n')
    },
  }
}

function canvasTool() {
  return {
    name: 'excalidraw_canvas',
    description: [
      'Inspect or edit the shared Excalidraw canvas in the user’s right sidebar.',
      'action "read" lists every element with its id, author (ai or user), position, size and label — use it to see what the user drew or to place new shapes without overlapping.',
      'action "clear" empties the board. action "delete" removes the given ids. action "move" shifts the given ids by dx,dy.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['read', 'clear', 'delete', 'move'],
          description: 'What to do with the canvas.',
        },
        ids: {
          type: 'array',
          description: 'Element ids for delete or move, exactly as "read" reported them.',
          items: { type: 'string' },
        },
        dx: { type: 'number', description: 'Horizontal shift for action "move".' },
        dy: { type: 'number', description: 'Vertical shift for action "move".' },
      },
      required: ['action'],
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: String(value) }],
    },
    execute(args, exec) {
      const input = args !== null && typeof args === 'object' ? args : {}
      const action = text(input.action) || 'read'
      const sessionId = sessionOf(exec)
      const scene = sceneOf(sessionId)

      if (action === 'read') {
        if (scene.elements.length === 0) {
          return `画布是空的（画布尺寸 ${BOARD.width}×${BOARD.height}）。用 excalidraw_draw 开始画。`
        }
        const ai = scene.elements.filter((element) => element._by === 'ai').length
        return [
          `画布尺寸 ${BOARD.width}×${BOARD.height}，共 ${scene.elements.length} 个元素（AI ${ai} 个，用户 ${scene.elements.length - ai} 个）。`,
          sceneDigest(scene.elements, true),
        ].join('\n')
      }
      if (action === 'clear') {
        const removed = scene.elements.length
        scene.elements = []
        scene.version += 1
        scene.updatedAt = Date.now()
        scheduleSave()
        return `已清空画布，移除 ${removed} 个元素。`
      }
      if (action === 'delete') {
        const ids = idsOf(input.ids)
        if (ids.length === 0) throw new Error('action "delete" needs ids')
        const before = scene.elements.length
        scene.elements = scene.elements.filter((element) => !ids.includes(element.id))
        const removed = before - scene.elements.length
        scene.version += 1
        scene.updatedAt = Date.now()
        scheduleSave()
        return removed === 0 ? `没有元素匹配这些 id：${ids.join(', ')}` : `已删除 ${removed} 个元素。`
      }
      if (action === 'move') {
        const ids = idsOf(input.ids)
        if (ids.length === 0) throw new Error('action "move" needs ids')
        const dx = num(input.dx, 0)
        const dy = num(input.dy, 0)
        let moved = 0
        for (const element of scene.elements) {
          if (!ids.includes(element.id)) continue
          element.x += dx
          element.y += dy
          moved += 1
        }
        if (moved === 0) return `没有元素匹配这些 id：${ids.join(', ')}`
        scene.version += 1
        scene.updatedAt = Date.now()
        scheduleSave()
        return `已移动 ${moved} 个元素（dx ${dx}, dy ${dy}）。`
      }
      throw new Error(`unknown action "${action}"; use read, clear, delete or move`)
    },
  }
}

function sessionOf(exec) {
  const id = exec && exec.agent && exec.agent.id
  if (typeof id !== 'string' || id === '') {
    throw new Error('the Excalidraw canvas is available from a session turn only')
  }
  return SCENE
}

function countElements(elements) {
  let count = 0
  for (const element of elements) {
    if (element.type !== 'text' || element.containerId === null || element.containerId === undefined) count += 1
  }
  return Math.max(1, count)
}

function idsOf(value) {
  if (!Array.isArray(value)) return []
  return value.map((entry) => text(entry)).filter((entry) => entry !== '').slice(0, 200)
}

/** Compact one-line-per-element listing the model can read and act on. */
function sceneDigest(elements, withIds = false) {
  const labels = new Map()
  for (const element of elements) {
    if (element.type === 'text' && element.containerId) labels.set(element.containerId, text(element.text))
  }
  const rows = []
  let hidden = 0
  for (const element of elements) {
    if (element.containerId) continue
    if (rows.length >= 60) {
      hidden += 1
      continue
    }
    const label = text(element.text) || labels.get(element.id) || ''
    const who = element._by === 'user' ? '用户' : 'AI'
    const box =
      element.type === 'arrow' || element.type === 'line'
        ? `${Math.round(element.x)},${Math.round(element.y)} → ${Math.round(element.x + element.width)},${Math.round(element.y + element.height)}`
        : `${Math.round(element.x)},${Math.round(element.y)} ${Math.round(element.width)}×${Math.round(element.height)}`
    rows.push(
      `${withIds ? `[${element.id}] ` : ''}${element.type} · ${who} · ${box}${label === '' ? '' : ` · 「${label.slice(0, 40)}」`}`,
    )
  }
  if (hidden > 0) rows.push(`…另有 ${hidden} 个元素未列出`)
  return rows.join('\n')
}

/* ----------------------------------------------------------------- helpers */

function text(value) {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

function num(value, fallback) {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return clamp(numeric, -20000, 20000)
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function color(value, fallback) {
  const candidate = text(value)
  if (/^#[0-9a-fA-F]{3,8}$/.test(candidate)) return candidate
  if (/^[a-zA-Z]{3,20}$/.test(candidate)) return candidate.toLowerCase()
  return fallback
}

function fillStyle(value, fallback) {
  const candidate = text(value)
  return FILLS.includes(candidate) ? candidate : fallback
}

function strokeStyle(value) {
  const candidate = text(value)
  return STROKES.includes(candidate) ? candidate : 'solid'
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}
