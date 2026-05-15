# Content Suite — Explicación Técnica Completa

## 1. ¿Qué problema resuelve?

Alicorp lanza decenas de productos al año. Cada lanzamiento necesita un **Brand Manual**: documento que define el tono de voz, vocabulario, personas objetivo, posicionamiento competitivo, etc. Hacerlo manualmente toma semanas. Este sistema lo hace con IA en menos de 90 segundos.

---

## 2. Arquitectura General

```
Internet → Frontend (React/Vite)
               ↓ HTTP REST
         FastAPI Backend
         ├── Auth: Supabase JWT
         ├── DB: Supabase Postgres + pgvector
         ├── LLMs: Claude (Anthropic) + Groq (fallback)
         ├── Embeddings: Voyage AI
         └── Observability: Langfuse
```

---

## 3. Cómo arranca el servidor

### `main.py`

```python
def create_app() -> FastAPI:
    app = FastAPI(lifespan=lifespan)
    app.add_middleware(CORSMiddleware, ...)   # permite peticiones desde el frontend
    app.include_router(brand_dna_router)     # /api/v1/brand-dna/*
    app.include_router(creative_router)      # /api/v1/creative/
    app.include_router(governance_router)    # /api/v1/governance/
    return app
```

El **lifespan** es una función especial que corre al inicio y al apagado:
- **Al inicio**: configura los logs (`structlog`) e inicia Langfuse (observabilidad)
- **Al apagar**: hace flush de todos los eventos pendientes en Langfuse

### `config.py`

Lee todas las variables de entorno del archivo `.env` usando **pydantic-settings**. Una sola instancia cargada con `@lru_cache` — nunca se crea dos veces:

```python
@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
```

Los modelos de Claude configurables:

| Variable | Modelo | Para qué |
|----------|--------|----------|
| `CLAUDE_MODEL_ORCHESTRATOR` | sonnet-4-6 | Planificar investigación |
| `CLAUDE_MODEL_WORKER` | haiku-4-5 | 5 agentes paralelos (barato) |
| `CLAUDE_MODEL_SYNTHESIZER` | opus-4-7 | Generar el manual completo |
| `CLAUDE_MODEL_EVALUATOR` | sonnet-4-6 | Juzgar la calidad |

---

## 4. El corazón: `call_claude()` — Cómo se habla con Claude

### `llm/claude_client.py`

Esta es la función central. **Todos** los agentes la usan.

```python
async def call_claude(
    *, model, system, messages, tools=None,
    max_tokens=4096, enable_thinking=False,
    budget=None, span=None, allow_groq_fallback=False
) -> dict
```

**Paso a paso de lo que hace:**

### 4.1 Prompt Caching — Ahorra dinero

```python
def _cached_system(text: str):
    return [{"type": "text", "text": text, "cache_control": {"type": "ephemeral"}}]
```

El system prompt se marca con `cache_control: ephemeral`. Anthropic guarda el prompt en caché hasta 5 minutos. Si el mismo system prompt se usa de nuevo, cobran solo `$0.30/MTok` en vez de `$3.00/MTok` (10x más barato).

### 4.2 Separación de herramientas nativas vs custom

```python
native_tools = [t for t in tools if t.get("type", "").startswith("web_search")]
custom_tools = [t for t in tools if not ...]
```

`web_search_20250305` es una herramienta nativa de Anthropic (Claude busca en internet directamente). Las otras herramientas son "client-side" (el servidor las ejecuta).

### 4.3 Extended Thinking (solo Synthesizer)

```python
if enable_thinking:
    kwargs["thinking"] = {"type": "adaptive"}
    kwargs["output_config"] = {"effort": "high"}
```

Activa el razonamiento interno de Claude Opus antes de responder — como si "pensara en voz alta" antes de escribir el JSON.

### 4.4 Retry automático con `tenacity`

```python
_claude_retry = retry(
    retry=retry_if_exception_type((RateLimitError, APIStatusError)),
    stop=stop_after_attempt(3),
    wait=wait_exponential_jitter(initial=1.0, max=30.0)
)
```

Si Claude falla por rate limit o error 5xx, reintenta hasta 3 veces con espera exponencial (1s → 2s → 8s aprox).

### 4.5 Fallback a Groq

```python
except (anthropic.RateLimitError, anthropic.APIStatusError):
    if allow_groq_fallback:
        return await _call_groq(system, messages, ...)
```

Si Claude falla y el worker tiene `allow_groq_fallback=True`, cambia a Groq (Llama 3.3 70B). Más barato y rápido, pero sin herramientas ni thinking.

### 4.6 Cobro al presupuesto

```python
budget.charge_anthropic_usage(model=model, usage=response.usage, span=span)
```

Después de cada llamada, descuenta el costo real del `TraceBudget`.

---

## 5. Control de Costos — `TraceBudget`

### `budget.py`

Cada generación de Brand Manual tiene un presupuesto de **$2.00 USD máximo**.

**Tabla de precios interna:**

```python
PRICING = {
    "claude-opus-4-7":   ModelPricing(input=5.00, output=25.00, cache_read=0.50),
    "claude-sonnet-4-6": ModelPricing(input=3.00, output=15.00, cache_read=0.30),
    "claude-haiku-4-5":  ModelPricing(input=1.00, output=5.00,  cache_read=0.10),
    "llama-3.3-70b":     ModelPricing(input=0.59, output=0.79,  cache_read=0.0),
}
```

(Precios en USD por millón de tokens)

**Cómo funciona el cobro:**

```python
def charge(self, *, model, input_tokens, output_tokens, ...):
    cost = self.estimate_cost(...)
    with self._lock:              # thread-safe (workers corren en paralelo)
        self.spent_usd += cost
        self.entries.append(CallEntry(...))

    if spent > self.ceiling_usd:
        raise BudgetExceeded(...)  # detiene TODO el pipeline
```

Si el presupuesto se excede en cualquier punto (durante workers, síntesis, etc.), se lanza `BudgetExceeded` y el pipeline retorna `status="incomplete_budget_hit"` con lo que se haya generado hasta ese momento.

---

## 6. El Pipeline Completo — Paso a Paso

### Paso 0: El usuario hace una petición HTTP

```
POST /api/v1/brand-dna/generate
Authorization: Bearer <supabase_jwt>

{
  "launch_id": "galletas-andinas-2026",
  "category": "galletas",
  "product_concept": "Galletas con quinua y kiwicha para snacking saludable",
  "target_audience": "Millennials NSE B/C de Lima, 25-35 años",
  "tone_hint": "cercano, auténtico, orgullosamente peruano",
  "market": "PE"
}
```

### `router.py` recibe la petición

```python
@router.post("/generate", status_code=202)
async def generate_brand_dna(brief: ProductBrief, user: CreatorOnly):
    job_id = str(uuid.uuid4())
    budget = TraceBudget(trace_id=job_id, ceiling_usd=2.00)
    _jobs[job_id] = JobState(job_id=job_id, ...)

    asyncio.create_task(_run_pipeline_bg(job_id, brief, budget))

    return {"job_id": job_id, "status": "running"}
```

**Devuelve 202 inmediatamente** — el pipeline corre en segundo plano (`asyncio.create_task`). El usuario luego hace polling:

```
GET /api/v1/brand-dna/jobs/{job_id}
```

---

### Paso 1: Orchestrator — Planifica las preguntas

### `orchestrator.py` → `run_orchestrator()`

Llama a **Claude Sonnet 4.6** y le pide que diseñe 5 preguntas de investigación específicas para el producto:

```
User: "Create a research plan for: Galletas con quinua y kiwicha
       in the galletas category targeting Millennials NSE B/C de Lima"
```

Claude devuelve un JSON como:

```json
{
  "research_plan": {
    "competitive_scan": "¿Quiénes son los principales competidores de galletas saludables en Peru y cuáles son sus propuestas de valor?",
    "audience_research": "¿Cuáles son los hábitos de snacking de millennials NSE B/C en Lima?",
    "trend_analysis": "¿Qué tendencias de consumo saludable están emergiendo en Peru en 2025-2026?",
    "cultural_context": "¿Qué simbolismo cultural tienen la quinua y kiwicha para consumidores peruanos?",
    "positioning_analysis": "¿Cómo posicionar una galleta de quinua frente a marcas importadas y locales?"
  }
}
```

---

### Paso 2: 5 Workers en Paralelo

### `workers/__init__.py` → `run_worker()`

```python
tasks = [
    competitive_scan.run(plan["competitive_scan"], brief, budget, context),
    audience_research.run(plan["audience_research"], brief, budget, context),
    trend_analysis.run(plan["trend_analysis"], brief, budget, context),
    cultural_context.run(plan["cultural_context"], brief, budget, context),
    positioning_analysis.run(plan["positioning_analysis"], brief, budget, context),
]
raw_results = await asyncio.gather(*tasks, return_exceptions=True)
```

Los 5 workers corren **simultáneamente**, cada uno con Claude Haiku 4.5 (el modelo más barato).

**Cómo funciona un worker individualmente:**

```python
async def run_worker(role, question, brief, budget, context):
    tools = [WEB_SEARCH_TOOL, *ALL_CLIENT_TOOLS]  # web search + herramientas custom

    for turn in range(12):  # máximo 12 turnos de conversación
        response = await call_claude(
            model=haiku,
            system=prompt_del_rol,
            messages=messages,
            tools=tools,
            allow_groq_fallback=True  # si Claude falla, usa Groq
        )

        # Si Claude llama herramientas, las ejecutamos y devolvemos resultados
        for tool_call in response["tool_calls"]:
            result = await execute_tool(tool_call["name"], tool_call["input"], context)

            if tool_call["name"] == "save_research_finding":
                finding_id = result["finding_id"]  # guardado exitoso
                break  # terminamos el loop
```

**Herramientas disponibles para los workers:**

| Herramienta | Qué hace | Estado |
|-------------|----------|--------|
| `web_search` | Claude busca en internet en tiempo real | ✅ Nativa Anthropic |
| `save_research_finding` | Guarda hallazgos en Supabase | ✅ Implementada |
| `competitor_site_scrape` | Scrapea URLs de competidores con httpx | ✅ Implementada |
| `google_trends_peru` | Tendencias en Peru (geo=PE) | ⚠️ Stub (datos demo) |
| `reddit_search_spanish` | Sentimiento en r/peru | ⚠️ Stub (datos demo) |
| `inei_peru_stats` | Estadísticas socioeconómicas INEI | ⚠️ Stub (datos demo) |

**El patrón crítico: `save_research_finding`**

Cada worker DEBE llamar esta herramienta antes de terminar. El handler:

```python
async def _handle_save_research_finding(input_data, context):
    finding = ResearchFinding(
        id=uuid.uuid4(),
        agent_role=input_data["agent_role"],
        summary=input_data["summary"],           # máx 500 chars
        detailed_findings=[...],                  # claims con evidencia y URLs
        structured_data={...},                    # JSON específico del rol
        quality_self_assessment=0.85,             # el propio Claude se califica
    )
    context.findings_cache[finding_id] = finding  # en memoria

    if context.db_pool:
        # también persiste en Supabase
        await conn.execute("INSERT INTO research_findings ...")

    return {"finding_id": finding_id, "summary": ...}
```

El worker retorna solo `{finding_id, summary}` al orchestrator — nunca el texto completo. Esto evita pasar megabytes de texto entre agentes.

---

### Paso 3: Synthesizer — Claude Opus 4.7

### `synthesizer.py` → `synthesize_manual()`

Recibe los 5 `WorkerResult` (que solo tienen `finding_id` y `summary`), recupera los findings completos del caché y construye un resumen para Claude Opus:

```
## competitive_scan
finding_id: abc-123
Summary: Los principales competidores son Tosh (Gloria) y Morochas...
Quality: 0.87
Detailed findings:
  - Tosh domina el 35% del mercado de galletas dulces (confidence: 0.9)
  - Morochas tiene fuerte recall en NSE C...
Structured data: {"competitors": [...], "market_share": {...}}

## audience_research
finding_id: def-456
...
```

Luego llama a **Claude Opus 4.7 con extended thinking**:

```python
response = await call_claude(
    model="claude-opus-4-7",
    system=prompt_sintetizador + resumen_de_findings,
    messages=[{"role": "user", "content": "Genera el Brand Manual completo en JSON"}],
    max_tokens=16000,          # respuesta muy larga
    enable_thinking=True,      # razona antes de escribir
    thinking_budget=4000,
)
```

**Extended thinking** significa que Claude primero "piensa" internamente (esos tokens no se muestran pero cuestan) y luego produce el JSON final. Esto mejora mucho la coherencia del Brand Manual.

Finalmente valida el JSON contra el schema Pydantic:

```python
manual = BrandManual.model_validate(manual_dict)
# Si falla: lanza SynthesisError
```

---

### Paso 4: Evaluator — LLM-as-Judge

### `evaluator.py` → `evaluate_manual()`

**Claude Sonnet 4.6** evalúa el manual generado contra los findings de investigación:

```python
response = await call_claude(
    model="claude-sonnet-4-6",
    system=prompt_evaluador + manual_json + resumen_findings,
    messages=[{"role": "user", "content": "Evalúa este Brand Manual"}],
)
```

Devuelve un `JudgeResult` con:

```json
{
  "scores": {
    "internal_consistency": 0.87,
    "factual_grounding": 0.82,
    "cultural_fit_peru": 0.91,
    "completeness": 0.95,
    "overall": 0.87
  },
  "violations": [
    {
      "dimension": "factual_grounding",
      "description": "El posicionamiento no menciona a Tosh como competidor principal",
      "severity": "medium",
      "suggested_fix": "Agregar referencia a ventajas vs Tosh en reasons_to_believe"
    }
  ],
  "verdict": "repair",
  "reasoning": "El manual es sólido pero necesita..."
}
```

**Pesos de las dimensiones:**

| Dimensión | Peso | Qué mide |
|-----------|------|----------|
| `internal_consistency` | 30% | El manual no se contradice a sí mismo |
| `factual_grounding` | 30% | Cada claim está respaldado por los findings |
| `cultural_fit_peru` | 25% | Es auténticamente peruano (tú, NSE, regionalismos) |
| `completeness` | 15% | Todas las secciones están bien llenas |

---

### Paso 5: Repair Loop — JSON Patch

### `repair.py` → `repair_manual()`

Si el veredicto es `"repair"`, Claude Sonnet genera un **JSON Patch** (RFC 6902) — no regenera el manual completo, solo parchea lo necesario:

```python
# Claude devuelve algo como:
[
  {"op": "add", "path": "/positioning/reasons_to_believe/-",
   "value": "Proceso de horneado sin aceites hidrogenados a diferencia de Tosh"},
  {"op": "replace", "path": "/vocabulary/preferred/0",
   "value": "superalimento andino"}
]

# Se aplica con jsonpatch:
patch = jsonpatch.JsonPatch(patch_ops)
patched_dict = patch.apply(manual_dict)

# Se re-valida con Pydantic:
patched_manual = BrandManual.model_validate(patched_dict)
```

Esto se repite máximo **2 veces**. Después de cada reparación, vuelve al Evaluator.

**Estados posibles del pipeline:**

| Status | Significado |
|--------|------------|
| `complete` | Pasó el juez exitosamente |
| `needs_human_review` | No pasó después de 2 reparaciones o veredicto `reject` |
| `incomplete_budget_hit` | Se agotó el presupuesto de $2.00 |
| `failed` | Error inesperado |

---

### Paso 6: Embeddings y Almacenamiento

### `embedding.py` + `chunking.py`

El Brand Manual se fragmenta en chunks lógicos (uno por sección):

```
"Brand: galletas-andinas. Section: personas[0]. Market: PE.
 Nombre: Valeria, 28 años, Lima Metropolitana, NSE B...
 Pain points: quiere comer sano pero sin sacrificar sabor..."
```

Cada chunk se convierte en un vector de **1024 dimensiones** con Voyage AI y se guarda en la tabla `brand_chunks` de Supabase con pgvector. Esto habilita el **RAG** del Módulo II.

---

## 7. Autenticación y Roles

### `auth/dependencies.py`

FastAPI usa **dependency injection**. En cada endpoint:

```python
@router.post("/generate")
async def generate_brand_dna(brief: ProductBrief, user: CreatorOnly):
    #                                              ↑ tipo alias que fuerza rol
```

`CreatorOnly` es:

```python
CreatorOnly = Annotated[AuthenticatedUser, Depends(require_role("creator"))]
```

Esto hace que FastAPI automáticamente:
1. Extrae el Bearer token del header
2. Verifica la firma JWT de Supabase
3. Carga el rol del usuario desde la DB
4. Si el rol no es `creator`, retorna 403 antes de ejecutar el handler

**Los 3 roles:**

| Rol | Puede hacer |
|-----|------------|
| `creator` | Crear briefs, ver sus propios manuals |
| `approver_a` | Ver todos los manuals, aprobar contenido textual |
| `approver_b` | Subir imágenes, ejecutar auditoría visual |

---

## 8. Observabilidad — Langfuse

### `observability.py`

Cada función importante está decorada con `@observe(name="...")`:

```python
@observe(name="brand_dna_generate")  # span raíz
async def run_brand_dna_pipeline(...):

    @observe(name="orchestrator_plan")  # span hijo
    async def run_orchestrator(...):

    @observe(name="worker")             # 5 spans hijos (uno por worker)
    async def run_worker(...):

    @observe(name="synthesizer")        # span hijo
    async def synthesize_manual(...):

    @observe(name="evaluator")          # span hijo
    async def evaluate_manual(...):
```

En Langfuse (langfuse.cloud) ves el árbol completo de spans con:
- Tiempo de cada paso
- Tokens consumidos (input/output/caché)
- Costo por llamada
- El reasoning del extended thinking
- Score del juez

---

## 9. Los Schemas Pydantic — Reglas de Negocio Incrustadas

### `schemas.py`

El `BrandManual` tiene validaciones automáticas que el LLM debe respetar:

**Vocabulario disjunto:**

```python
@model_validator(mode="after")
def check_disjoint(self) -> "Vocabulary":
    overlap = set(preferred) & set(forbidden)
    if overlap:
        raise ValueError(f"palabras repetidas en preferred y forbidden: {overlap}")
```

**Tono coherente** (dos/donts no pueden contradecirse):

```python
@model_validator(mode="after")
def check_tone_coherence(self) -> "BrandManual":
    for d in self.tone_of_voice.dos:
        for dont in self.tone_of_voice.donts:
            if _phrases_contradict(d, dont):
                # compara palabras clave, ignora stopwords en español
                contradictions.append(...)
```

**Provenance obligatorio en cada sección:**

```python
class BrandEssence(BaseModel):
    core_idea: str
    values: list[str]
    mission_statement: str
    provenance: Provenance = _prov_field()  # REQUERIDO: qué finding_ids lo respaldan
```

Si Claude genera un JSON que viole cualquiera de estas reglas, Pydantic lanza `ValidationError` → el pipeline entra al repair loop automáticamente.

---

## 10. Flujo de Datos Completo

```
[Usuario] POST /generate
    │
    ▼
[Router] crea job_id, TraceBudget($2.00), corre pipeline en background
    │
    ▼
[Orchestrator — Sonnet 4.6]  ← 1 llamada Claude, ~$0.01
    │  Devuelve: {competitive_scan: "pregunta1", audience_research: "pregunta2", ...}
    │
    ▼
[5 Workers — Haiku 4.5] ← corren en PARALELO con asyncio.gather
    │  Cada worker: hasta 12 turnos, usa web_search + herramientas
    │  Cada worker llama save_research_finding → guarda en Supabase
    │  Retorna: {finding_id: "abc", summary: "..."}
    │  Costo aprox: ~$0.15 total los 5
    │
    ▼
[Synthesizer — Opus 4.7 + extended thinking]  ← ~$0.40-0.50
    │  Lee findings del caché
    │  Genera BrandManual JSON completo (hasta 16000 tokens)
    │  Valida con Pydantic
    │
    ▼
[Evaluator — Sonnet 4.6]  ← ~$0.05
    │  Puntúa en 4 dimensiones
    │  Veredicto: pass / repair / reject
    │
    ▼ (si "repair", máx 2 veces)
[Repair — Sonnet 4.6]  ← ~$0.03 por iteración
    │  Genera JSON Patch RFC 6902
    │  Aplica patch, re-valida Pydantic
    │
    ▼
[Embeddings — Voyage AI]
    │  Fragmenta manual en chunks
    │  Vectoriza (1024 dim)
    │  Guarda en pgvector (Supabase)
    │
    ▼
[Job completado] status = "complete" | "needs_human_review" | etc.

[Usuario] GET /jobs/{job_id}  → pollea hasta status != "running"
```

**Costo típico por manual: ~$0.66 USD. Máximo: $2.00 USD.**

---

## 11. Estado actual del proyecto

| Componente | Estado |
|------------|--------|
| Pipeline completo (orquestador → workers → síntesis → evaluación → reparación) | ✅ Implementado |
| Control de costos (TraceBudget + circuit breaker) | ✅ Implementado |
| Autenticación JWT + RBAC (3 roles) | ✅ Implementado |
| Embeddings + pgvector storage | ✅ Implementado |
| Observabilidad con Langfuse | ✅ Implementado |
| SQL schema (tablas Supabase) | ❌ Falta (`schemas.sql`) |
| Prompt `.md` files (uno por agente) | ❌ Falta (carpeta `prompts/`) |
| Frontend React/Vite | ❌ Falta |
| Tests de integración (2-3) | ❌ Falta |
| README con diagramas | ❌ Falta |
| Módulos II y III (UI stub) | ⚠️ Stub backend listo, falta UI |
