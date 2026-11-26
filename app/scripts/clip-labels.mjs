// Precompute CLIP text embeddings for the road-surface classes, so phones only download the
// vision encoder. Several prompts per class are averaged (prompt ensembling).
// Usage: node scripts/clip-labels.mjs  -> src/sense/clip-labels.json
import { writeFileSync } from 'node:fs'
import { AutoTokenizer, CLIPTextModelWithProjection } from '@huggingface/transformers'

const MODEL = 'Xenova/clip-vit-base-patch32'
export const CLASSES = {
  pothole: ['a photo of a pothole in the road', 'a road with a large pothole', 'a damaged road surface with a deep hole', 'a broken asphalt road with potholes'],
  barricade: ['a road barricade blocking a lane', 'orange and white road barriers on a street', 'a police barricade on a road', 'construction barriers closing a road'],
  cones: ['traffic cones on a road', 'orange traffic cones closing a lane'],
  waterlogging: ['a flooded road with standing water', 'a waterlogged street in heavy rain', 'cars driving through a flooded road'],
  clear: ['an empty clear road', 'a normal city road with cars', 'a road at night with street lights', 'the view from a car driving on a highway', 'a traffic jam on a city road'],
}

const tokenizer = await AutoTokenizer.from_pretrained(MODEL)
const model = await CLIPTextModelWithProjection.from_pretrained(MODEL, { dtype: 'q8' })
const out = { model: MODEL, classes: {} }
for (const [name, prompts] of Object.entries(CLASSES)) {
  const inputs = tokenizer(prompts, { padding: true, truncation: true })
  const { text_embeds } = await model(inputs)
  const [n, d] = text_embeds.dims
  const mean = new Array(d).fill(0)
  for (let i = 0; i < n; i++) {
    let norm = 0
    for (let k = 0; k < d; k++) norm += text_embeds.data[i * d + k] ** 2
    norm = Math.sqrt(norm)
    for (let k = 0; k < d; k++) mean[k] += text_embeds.data[i * d + k] / norm / n
  }
  const m = Math.sqrt(mean.reduce((a, v) => a + v * v, 0))
  out.classes[name] = mean.map((v) => +(v / m).toFixed(6))
  console.log(name, prompts.length, 'prompts')
}
writeFileSync('src/sense/clip-labels.json', JSON.stringify(out))
console.log('wrote src/sense/clip-labels.json')
