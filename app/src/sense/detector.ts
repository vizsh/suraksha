// On-device hazard detection. Nothing leaves the phone except the resulting observation.
//  - Objects, every frame: MediaPipe Object Detector (EfficientDet-Lite0, COCO), ~7 MB.
//  - Road surface, every ~1.5 s: CLIP ViT-B/32 vision encoder (transformers.js, ONNX), ~89 MB once,
//    compared against class embeddings precomputed by scripts/clip-labels.mjs.
import { create } from 'zustand'
import type { ObjectDetector as OD } from '@mediapipe/tasks-vision'
import labels from './clip-labels.json'
import { classify, type Box, type SurfaceLabel } from './gate'

export interface Detection {
  label: string
  score: number
  box: Box
}

interface DetectorState {
  objects: 'off' | 'loading' | 'ready' | 'error'
  surface: 'off' | 'loading' | 'ready' | 'error'
  surfaceProgress: number
  backend: string
  dets: Detection[]
  probs: Record<SurfaceLabel, number> | null
  fps: number
}

export const useDetector = create<DetectorState>(() => ({
  objects: 'off',
  surface: 'off',
  surfaceProgress: 0,
  backend: '',
  dets: [],
  probs: null,
  fps: 0,
}))

const OD_MODEL = 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite'
const ALLOW = ['person', 'cow', 'dog', 'horse', 'sheep', 'car', 'bus', 'truck', 'motorcycle', 'bicycle']

let detector: OD | null = null

export async function loadObjects() {
  if (detector || useDetector.getState().objects === 'loading') return
  useDetector.setState({ objects: 'loading' })
  try {
    const { ObjectDetector, FilesetResolver } = await import('@mediapipe/tasks-vision')
    const fileset = await FilesetResolver.forVisionTasks('/mediapipe/wasm')
    detector = await ObjectDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: OD_MODEL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      scoreThreshold: 0.4,
      maxResults: 12,
      categoryAllowlist: ALLOW,
    })
    useDetector.setState({ objects: 'ready' })
  } catch {
    useDetector.setState({ objects: 'error' })
  }
}

/** Detect objects in the current frame. Boxes are normalised to 0..1. */
export function detectObjects(frame: HTMLCanvasElement, t: number): Detection[] {
  if (!detector) return []
  const res = detector.detectForVideo(frame, t)
  const W = frame.width
  const H = frame.height
  return res.detections
    .map((d) => {
      const c = d.categories[0]
      const b = d.boundingBox!
      return { label: c.categoryName, score: c.score, box: { x: b.originX / W, y: b.originY / H, w: b.width / W, h: b.height / H } }
    })
    .filter((d) => d.box.w > 0)
}

// ---------- road surface (CLIP) ----------

type Processor = (img: unknown) => Promise<{ pixel_values: unknown }>
type Vision = (inputs: { pixel_values: unknown }) => Promise<{ image_embeds: { data: Float32Array } }>
let processor: Processor | null = null
let vision: Vision | null = null
let RawImageCls: { new (data: Uint8ClampedArray, w: number, h: number, c: number): unknown } | null = null

export async function loadSurface() {
  if (vision || useDetector.getState().surface === 'loading') return
  useDetector.setState({ surface: 'loading', surfaceProgress: 0 })
  try {
    const tf = await import('@huggingface/transformers')
    tf.env.allowLocalModels = false
    const webgpu = typeof navigator !== 'undefined' && 'gpu' in navigator
    const progress = (p: { status?: string; progress?: number; file?: string }) => {
      if (p.status === 'progress' && p.file?.includes('vision_model') && typeof p.progress === 'number') useDetector.setState({ surfaceProgress: p.progress / 100 })
    }
    processor = (await tf.AutoProcessor.from_pretrained(labels.model)) as unknown as Processor
    const opts = { dtype: 'q8' as const, progress_callback: progress }
    try {
      vision = (await tf.CLIPVisionModelWithProjection.from_pretrained(labels.model, { ...opts, device: webgpu ? 'webgpu' : 'wasm' })) as unknown as Vision
      useDetector.setState({ backend: webgpu ? 'WebGPU' : 'WASM' })
    } catch {
      vision = (await tf.CLIPVisionModelWithProjection.from_pretrained(labels.model, { ...opts, device: 'wasm' })) as unknown as Vision
      useDetector.setState({ backend: 'WASM' })
    }
    RawImageCls = tf.RawImage as unknown as typeof RawImageCls
    useDetector.setState({ surface: 'ready', surfaceProgress: 1 })
  } catch {
    useDetector.setState({ surface: 'error' })
  }
}

const crop = typeof document !== 'undefined' ? document.createElement('canvas') : null

/** Classify the road ahead: the lower-middle of the frame, where the carriageway is. */
export async function classifySurface(frame: HTMLCanvasElement) {
  if (!vision || !processor || !RawImageCls || !crop) return null
  const W = frame.width
  const H = frame.height
  const sx = W * 0.12
  const sy = H * 0.42
  const sw = W * 0.76
  const sh = H * 0.55
  crop.width = 224
  crop.height = 224
  const ctx = crop.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(frame, sx, sy, sw, sh, 0, 0, 224, 224)
  const { data } = ctx.getImageData(0, 0, 224, 224)
  const image = new RawImageCls(data, 224, 224, 4)
  const inputs = await processor(image)
  const { image_embeds } = await vision(inputs)
  const probs = classify(image_embeds.data, labels.classes as Record<string, number[]>)
  useDetector.setState({ probs })
  return probs
}
