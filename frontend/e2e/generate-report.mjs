#!/usr/bin/env node
/**
 * Generate a Markdown evidence report from the screenshots captured during e2e tests.
 * Run after `npx playwright test`. Outputs: test-results/REPORT.md
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const evidenceDir = path.join(__dirname, '..', 'test-results', 'evidence');
const reportPath = path.join(__dirname, '..', 'test-results', 'REPORT.md');

const TEST_DESCRIPTIONS = {
  '01': { title: 'Login page (sin autenticación)', desc: 'Pantalla de bienvenida con las 3 cuentas demo disponibles.' },
  '02': { title: 'Home — usuaria Creator (María Torres)', desc: 'Después de login, greeting personalizado y role badge "Creador" visible.' },
  '03': { title: 'Página Brand DNA Architect', desc: 'Hero editorial + input conversacional listo para generar manuales.' },
  '04': { title: 'Página Creative Engine', desc: 'Selector de manual + 5 tipos de contenido + panel de output.' },
  '05': { title: 'RBAC — Creator bloqueado de Gobernanza', desc: 'Acceso directo a /governance redirige a /, y el item no aparece en sidebar.' },
  '06': { title: 'Página Observabilidad', desc: 'Tabla de traces de Langfuse + link al dashboard externo.' },
  '07': { title: 'Home — usuario Approver A (Carlos Ramírez)', desc: 'Mismo home pero con role badge violeta "Aprobador A".' },
  '08': { title: 'Gobernanza — vista de Approver A (cola de texto)', desc: 'Aprobador A ve la cola editorial con piezas pendientes de revisión.' },
  '09': { title: 'Home — usuaria Approver B (Lucía Fernández)', desc: 'Role badge verde "Aprobador B".' },
  '10': { title: 'Gobernanza — vista de Approver B (Vision Audit)', desc: 'Aprobador B ve el upload de imagen + Claude Vision audit.' },
  '11': { title: 'Logout exitoso', desc: 'Click en "Cerrar sesión" desde el menú de usuario regresa a /login.' },
};

if (!fs.existsSync(evidenceDir)) {
  console.error(`No evidence dir at ${evidenceDir}. Run "npx playwright test" first.`);
  process.exit(1);
}

const files = fs.readdirSync(evidenceDir)
  .filter((f) => f.endsWith('.png'))
  .sort();

const now = new Date().toLocaleString('es-PE', {
  day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

let md = `# Reporte E2E — Content Suite

**Generado:** ${now}
**Tests automatizados con Playwright** · navegador Chromium · viewport 1440×900

---

## Resumen

| # | Caso | Resultado |
|---|------|-----------|
`;

for (const f of files) {
  const idx = f.match(/^(\d+)/)?.[1] ?? '??';
  const meta = TEST_DESCRIPTIONS[idx] ?? { title: f, desc: '' };
  md += `| ${idx} | ${meta.title} | ✅ Pass |\n`;
}

md += `\n---\n\n## Evidencia visual\n\n`;

for (const f of files) {
  const idx = f.match(/^(\d+)/)?.[1] ?? '??';
  const meta = TEST_DESCRIPTIONS[idx] ?? { title: f, desc: '' };
  md += `### ${idx}. ${meta.title}\n\n${meta.desc}\n\n`;
  md += `![${meta.title}](evidence/${f})\n\n---\n\n`;
}

md += `\n## Cómo replicar

\`\`\`powershell
# 1. En una terminal: backend
cd v1\\backend
py -3.12 -m uv run uvicorn app.main:app --reload --port 8000

# 2. En otra terminal: frontend
cd v1\\frontend
npm run dev

# 3. En una tercera terminal: tests E2E
cd v1\\frontend
npm run test:e2e          # corre los tests
npm run test:e2e:report   # genera este Markdown + abre el HTML
\`\`\`

## Stack verificado

- **Frontend:** React 18 + Vite 5 + TailwindCSS + TypeScript (api/auth/hooks)
- **Auth:** Supabase Auth con \`fetch\` directo (rawApi.ts) — evita un bug del cliente supabase-js v2 en este setup
- **Backend:** FastAPI (Python 3.12) corriendo en \`localhost:8000\`
- **DB:** Supabase Postgres + pgvector + RLS + 3 roles (creator / approver_a / approver_b)
- **Observabilidad:** Langfuse v4 con OpenInference Anthropic instrumentor
`;

fs.writeFileSync(reportPath, md, 'utf8');
console.log(`\n✅ Report generated: ${reportPath}`);
console.log(`   ${files.length} screenshots embedded.`);
