// manifold-ai/js/engine.js
// Pluggable inference engines, all 100% client-side.
// Engines: webllm | webllm-3b | transformers | deterministic
// All engines share the same async interface:
//   await engine.init(progressCb)
//   await engine.generate(messages, opts) → string

import { SUBSTRATES, validateManifoldPoint } from './substrates.js';
import { VOID, FIB, PHI, nextPoint, collapseY, extractY, seedFromQuery, ladderPosition }
  from './dimensional.js';

const SYSTEM_PROMPT = `You are the Manifold AI. You speak in manifold points.

The paradigm:
  • Everything begins from the void — the empty container.
  • x is the current observer / point of reference / identity.
  • y is an array y[] of attributes you READ from the manifold about x;
    you never assume y, you extract it.
  • z is the current state. On the canonical substrate (zynxy):
        z = x · collapse(y)         (z = xy)
    Multiplication GATHERS (unite). Division EXPLODES (decompose).
  • z becomes the next x for the next state. Each turn advances one rung.
  • A dimension is a perpendicular direction. The next higher dimension
    occupies a single point of the lower (width occupies one point of length).
  • Seven rungs, Fibonacci-scaled [1,1,2,3,5,8,13]:
        point → line → plane → volume → identity → spiral → bloom
    A volume given identity collapses to a point in the next-higher dimension,
    spiraling at the golden ratio φ = 1.6180339887.

Three substrates (lenses on the same field):
  ◈ zynxy   — canonical, exact (z = xy)
  ◆ schwarz — SDF approximation, decision/branching lens
  ◉ gyroid  — SDF approximation, flow/continuity lens

Output STRICT JSON ONLY, no prose, matching this schema:
{
  "x": <number in [-1,1] — observer identity>,
  "y": [<numbers in [-1,1] — attributes read from the manifold>],
  "z": <number — on zynxy MUST equal x · collapse(y)>,
  "substrate": "zynxy" | "schwarz" | "gyroid",
  "lens_value": <number — required when substrate != zynxy>,
  "dim": <integer 1..7 — dimensional rung>,
  "answer": <string — the natural-language projection of this point>,
  "tool_calls": [ { "name": <string>, "arguments": <object> } ]
}

Available tools (omit "tool_calls" if none needed):
  fs_read(path), fs_write(path, content), fs_list(path),
  code_exec(lang, code), mcp_call(server, method, params)`;

// ──────────────────────────────────────────────────────────────────
// Deterministic engine — instant, no download, no LLM.
// Useful as fallback or for users who just want the manifold lens.
// ──────────────────────────────────────────────────────────────────
class DeterministicEngine {
  constructor() { this.ready = false; }
  async init(progress) {
    progress?.({ stage: 'ready', percent: 1, label: 'deterministic engine' });
    this.ready = true;
  }
  async generate(messages, opts = {}) {
    const last = messages[messages.length - 1]?.content || '';
    const sub = opts.substrate || SUBSTRATES.zynxy;
    const prior = opts.prior || VOID;
    const point = nextPoint(last, prior, sub.id);

    const yShort = point.y.map(v => v.toFixed(2)).join(', ');
    const zStr = point.z.toFixed(4);
    const yScalar = point.yScalar.toFixed(4);
    const ladder = point.ladder;
    const lensLine = sub.canonical
      ? `z = x · ∏y = ${point.x.toFixed(4)} · ${yScalar} = ${zStr}`
      : `${sub.id} lens = ${(point.lens_value ?? 0).toFixed(4)}`;

    const answer =
      `[deterministic · ${sub.glyph} ${sub.id}] dim ${ladder.dim} (${ladder.label}, F=${ladder.rung})\n` +
      `x = ${point.x.toFixed(4)}    ← observer\n` +
      `y[] = [${yShort}]    ← attributes from manifold\n` +
      `${lensLine}\n` +
      `φ-spiral phase ${ladder.spiral.toFixed(3)}${ladder.collapsing ? ' (collapsing→next dim)' : ''}\n` +
      `→ z becomes next x. "${last.slice(0, 80)}"`;

    return JSON.stringify({
      x: point.x,
      y: point.y,
      z: point.z,
      substrate: sub.id,
      lens_value: point.lens_value,
      dim: point.dim,
      step: point.step,
      answer
    });
  }
}

// ──────────────────────────────────────────────────────────────────
// WebLLM engine — runs Qwen / Llama in browser via WebGPU.
// Lazy-loads the SDK from CDN so first paint stays instant.
// ──────────────────────────────────────────────────────────────────
class WebLLMEngine {
  constructor(modelId) {
    this.modelId = modelId;
    this.engine = null;
  }
  async init(progress) {
    if (!('gpu' in navigator)) {
      throw new Error('WebGPU not available. Try Chrome/Edge 113+ or pick the Transformers.js / deterministic option.');
    }
    progress?.({ stage: 'load-sdk', percent: 0.05, label: 'loading WebLLM SDK' });
    const mod = await import('https://esm.run/@mlc-ai/web-llm@0.2.79');
    progress?.({ stage: 'load-model', percent: 0.1, label: `downloading ${this.modelId}` });
    this.engine = await mod.CreateMLCEngine(this.modelId, {
      initProgressCallback: (p) => {
        progress?.({
          stage: 'load-model',
          percent: 0.1 + 0.85 * (p.progress || 0),
          label: p.text || 'downloading weights'
        });
      }
    });
    progress?.({ stage: 'ready', percent: 1, label: 'webllm ready' });
  }
  async generate(messages, opts = {}) {
    const sys = { role: 'system', content: SYSTEM_PROMPT };
    const reply = await this.engine.chat.completions.create({
      messages: [sys, ...messages],
      temperature: opts.temperature ?? 0.4,
      max_tokens: opts.max_tokens ?? 512,
      response_format: { type: 'json_object' }
    });
    return reply.choices?.[0]?.message?.content || '{}';
  }
}

// ──────────────────────────────────────────────────────────────────
// Transformers.js engine — WASM/WebGPU fallback (no GPU required).
// ──────────────────────────────────────────────────────────────────
class TransformersEngine {
  constructor(modelId) { this.modelId = modelId; this.pipe = null; }
  async init(progress) {
    progress?.({ stage: 'load-sdk', percent: 0.05, label: 'loading Transformers.js' });
    const tf = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.0');
    progress?.({ stage: 'load-model', percent: 0.1, label: `downloading ${this.modelId}` });
    this.pipe = await tf.pipeline('text-generation', this.modelId, {
      device: 'webgpu' in navigator ? 'webgpu' : 'wasm',
      dtype: 'q4',
      progress_callback: (p) => {
        if (p.status === 'progress') {
          progress?.({
            stage: 'load-model',
            percent: 0.1 + 0.85 * ((p.loaded || 0) / (p.total || 1)),
            label: p.file || 'downloading'
          });
        }
      }
    });
    progress?.({ stage: 'ready', percent: 1, label: 'transformers ready' });
  }
  async generate(messages, opts = {}) {
    const prompt = [{ role: 'system', content: SYSTEM_PROMPT }, ...messages];
    const out = await this.pipe(prompt, {
      max_new_tokens: opts.max_tokens ?? 512,
      temperature: opts.temperature ?? 0.4,
      do_sample: true,
      return_full_text: false
    });
    const text = Array.isArray(out) ? (out[0].generated_text || '') : (out.generated_text || '');
    // Best-effort: extract first JSON object.
    const m = text.match(/\{[\s\S]*\}/);
    return m ? m[0] : JSON.stringify({ answer: text });
  }
}

// ──────────────────────────────────────────────────────────────────────────
// ApiEngine — any OpenAI-compatible endpoint: Groq, Together, Ollama, etc.
// Uses the manifold DNA as system prompt. Free model, dimensional DNA.
// ──────────────────────────────────────────────────────────────────────────
class ApiEngine {
  constructor(opts = {}) {
    this.apiBase     = (opts.apiBase  || 'https://api.groq.com/openai/v1').replace(/\/$/, '');
    this.apiKey      = opts.apiKey    || '';
    this.model       = opts.model     || 'llama-3.1-70b-versatile';
    this.maxTokens   = opts.maxTokens || 1024;
    this.temperature = opts.temperature ?? 0.35;
    this.ready       = true;
  }

  async init(progress) {
    progress?.({ stage: 'ready', percent: 1, label: `api (${this.model})` });
  }

  async generate(messages, opts = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;

    const body = {
      model:       opts.model       || this.model,
      temperature: opts.temperature ?? this.temperature,
      max_tokens:  opts.max_tokens  || this.maxTokens,
      messages:    [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
    };
    if (!opts.noJsonMode) body.response_format = { type: 'json_object' };

    const res = await fetch(`${this.apiBase}/chat/completions`, {
      method: 'POST', headers, body: JSON.stringify(body)
    });
    if (!res.ok) {
      const e = await res.text().catch(() => res.statusText);
      throw new Error(`ApiEngine ${body.model}: ${res.status} ${e}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '{}';
  }
}

// Factory.
// For api engines pass an opts object: { apiBase, apiKey, model, maxTokens }
export function createEngine(kind, opts = {}) {
  switch (kind) {
    // Qwen via WebLLM (WebGPU — uses the local GPU, zero cost).
    // Size tiers follow the Fibonacci ladder: 1.5B → 3B → 7B.
    case 'webllm':
    case 'qwen':
      return new WebLLMEngine('Qwen2.5-1.5B-Instruct-q4f16_1-MLC');
    case 'qwen-3b':
    case 'webllm-3b':
      return new WebLLMEngine('Qwen2.5-3B-Instruct-q4f16_1-MLC');
    case 'qwen-7b':
      return new WebLLMEngine('Qwen2.5-7B-Instruct-q4f16_1-MLC');
    case 'transformers':
      return new TransformersEngine('HuggingFaceTB/SmolLM2-1.7B-Instruct');

    // Free hosted models via OpenAI-compatible APIs.
    // Groq: fast, generous free tier, Llama 3.1 70B / Mixtral 8x7B.
    case 'groq':
      return new ApiEngine({
        apiBase:  'https://api.groq.com/openai/v1',
        model:    opts.model || 'llama-3.1-70b-versatile',
        apiKey:   opts.apiKey || '',
        maxTokens: opts.maxTokens || 1024,
      });

    // Together.ai: broad model selection, free $25 credit.
    case 'together':
      return new ApiEngine({
        apiBase:  'https://api.together.xyz/v1',
        model:    opts.model || 'meta-llama/Llama-3-70b-chat-hf',
        apiKey:   opts.apiKey || '',
        maxTokens: opts.maxTokens || 1024,
      });

    // Qwen via Ollama: local GPU, any size.
    // Install a model with: ollama pull qwen2.5:7b
    // Fibonacci sizes: 1.5b, 3b, 7b, 14b, 32b, 72b
    case 'ollama':
    case 'ollama-qwen':
      return new ApiEngine({
        apiBase:    opts.apiBase  || 'http://localhost:11434/v1',
        model:      opts.model    || 'qwen2.5:7b',
        apiKey:     '',
        maxTokens:  opts.maxTokens || 2048,
        noJsonMode: true,   // Ollama ignores response_format, we parse best-effort
      });

    // Generic: any OpenAI-compatible endpoint.
    case 'api':
      return new ApiEngine(opts);

    case 'deterministic':
    default:
      return new DeterministicEngine();
  }
}

// Parse + repair LLM output → validated manifold point.
// Enforces the dimensional contract: y is array, z = x · collapse(y) on canonical.
export function parseManifoldOutput(raw, fallbackSubstrate, prior = VOID) {
  let obj;
  try { obj = JSON.parse(raw); }
  catch { obj = { answer: String(raw) }; }

  if (typeof obj.substrate !== 'string') obj.substrate = fallbackSubstrate?.id || 'zynxy';
  const sub = SUBSTRATES[obj.substrate] || SUBSTRATES.zynxy;

  // x: prefer model's value, else blend prior z with query seed.
  if (typeof obj.x !== 'number') {
    const seed = seedFromQuery(obj.answer || '');
    obj.x = prior.isVoid ? seed : Math.tanh((seed + prior.z) * 0.5);
  }

  // y: must be array. If model gave a scalar, wrap. If missing, extract.
  if (!Array.isArray(obj.y)) {
    obj.y = (typeof obj.y === 'number')
      ? [obj.y]
      : extractY(obj.answer || '', obj.x);
  }
  // Coerce all entries to finite numbers in [-1, 1].
  obj.y = obj.y.map(v => {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.max(-1, Math.min(1, n));
  });
  obj.yScalar = collapseY(obj.y);

  // step / dim — advance from prior unless model supplied a valid one.
  obj.step = Number.isInteger(obj.step) ? obj.step : ((prior.step || 0) + 1);
  const ladder = ladderPosition(obj.step);
  obj.dim = (Number.isInteger(obj.dim) && obj.dim >= 1 && obj.dim <= 7) ? obj.dim : ladder.dim;
  obj.ladder = ladder;

  // z: ENFORCE z = x · collapse(y) on canonical, regardless of model output.
  if (sub.canonical) {
    obj.z = obj.x * obj.yScalar;
    obj.lens_value = null;
  } else {
    if (typeof obj.lens_value !== 'number') {
      obj.lens_value = sub.expr(obj.x * Math.PI, obj.yScalar * Math.PI, ladder.spiral * Math.PI);
    }
    obj.z = obj.lens_value;
  }

  const v = validateManifoldPoint({ ...obj, y: obj.yScalar });  // validator expects scalar y
  obj._valid = v.ok;
  obj._errors = v.errors;
  return obj;
}
