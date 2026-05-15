import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SHOTS_DIR = path.join(__dirname, '..', 'test-results', 'evidence');
fs.mkdirSync(SHOTS_DIR, { recursive: true });

const ACCOUNTS = {
  creator:    { email: 'maria.torres@demo.alicorp.com',     password: 'creador_demo_2026',     name: 'María',  badge: 'Creador' },
  approver_a: { email: 'carlos.ramirez@demo.alicorp.com',   password: 'aprobador_a_demo_2026', name: 'Carlos', badge: 'Aprobador A' },
  approver_b: { email: 'lucia.fernandez@demo.alicorp.com',  password: 'aprobador_b_demo_2026', name: 'Lucía',  badge: 'Aprobador B' },
} as const;

// Sequential evidence numbering — count files in dir (survives worker isolation)
async function capture(page: Page, label: string) {
  const existing = fs.readdirSync(SHOTS_DIR).filter((f) => f.endsWith('.png')).length;
  const idx = existing + 1;
  const fname = `${String(idx).padStart(2, '0')}-${label.replace(/[^a-z0-9-]+/gi, '-').toLowerCase()}.png`;
  const fullPath = path.join(SHOTS_DIR, fname);
  await page.screenshot({ path: fullPath, fullPage: true });
  console.log(`📸 ${fname}`);
  return fname;
}

async function loginAs(page: Page, role: keyof typeof ACCOUNTS) {
  const acc = ACCOUNTS[role];
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(acc.email);
  await page.locator('input[type="password"]').fill(acc.password);
  await page.getByRole('button', { name: /entrar/i }).click();
  // Wait for the topbar to render after auth resolves
  await expect(page.getByText(acc.badge, { exact: true })).toBeVisible({ timeout: 15_000 });
}

async function logout(page: Page) {
  // Open user menu (the avatar button on the topbar)
  await page.locator('button').filter({ hasText: /Cerrar sesión/i }).first().click().catch(async () => {
    // If the menu isn't open, click the avatar first
    await page.locator('header button').last().click();
    await page.getByRole('button', { name: /Cerrar sesión/i }).click();
  });
  await expect(page).toHaveURL(/\/login/i, { timeout: 5_000 });
}

test.describe('Content Suite — Demo flow', () => {
  test('1. Login as Creator (María) and see Home', async ({ page }) => {
    await page.goto('/login');
    await capture(page, 'login-page');

    await loginAs(page, 'creator');
    await capture(page, 'home-creator');

    // Verify greeting personalizes to first name
    await expect(page.getByText('María', { exact: false }).first()).toBeVisible();
    // Verify role badge
    await expect(page.getByText('Creador', { exact: true })).toBeVisible();
  });

  test('2. Creator navigates Brand DNA Architect page', async ({ page }) => {
    await loginAs(page, 'creator');

    await page.getByRole('button', { name: /Brand DNA Architect/i }).click();
    await expect(page).toHaveURL(/\/brand-dna/);
    await expect(page.locator('h1').filter({ hasText: /Cualquier brief/i })).toBeVisible();
    await capture(page, 'brand-dna-architect');
  });

  test('3. Creator navigates Creative Engine page', async ({ page }) => {
    await loginAs(page, 'creator');

    await page.getByRole('button', { name: /Creative Engine/i }).click();
    await expect(page).toHaveURL(/\/creative/);
    await expect(page.locator('h1').filter({ hasText: /respeta cada regla/i })).toBeVisible();
    await capture(page, 'creative-engine');
  });

  test('4. Creator is BLOCKED from Governance (RBAC)', async ({ page }) => {
    await loginAs(page, 'creator');

    // RBAC evidence #1: Governance entry NOT in sidebar for creator role
    const govButton = page.getByRole('button', { name: /Gobernanza/i });
    await expect(govButton).toHaveCount(0);

    // RBAC evidence #2: client-side guard kicks in when navigating to /governance
    // We use React Router's pushState (preserves auth state) instead of full page reload
    await page.evaluate(() => window.history.pushState({}, '', '/governance'));
    // Trigger React Router to react to the URL change
    await page.evaluate(() => window.dispatchEvent(new PopStateEvent('popstate')));
    await expect(page).not.toHaveURL(/\/governance/, { timeout: 5_000 });

    await capture(page, 'rbac-creator-blocked-from-governance');
  });

  test('5. Creator views Observability page (Langfuse traces)', async ({ page }) => {
    await loginAs(page, 'creator');

    await page.getByRole('button', { name: /Observabilidad/i }).click();
    await expect(page).toHaveURL(/\/observability/);
    await expect(page.locator('h1').filter({ hasText: /queda auditable/i })).toBeVisible();
    await capture(page, 'observability');
  });

  test('6. Login as Approver A (Carlos) — sees governance text queue', async ({ page }) => {
    await loginAs(page, 'approver_a');
    await capture(page, 'home-approver-a');

    await expect(page.getByText('Aprobador A', { exact: true })).toBeVisible();

    // Now Governance is accessible
    await page.getByRole('button', { name: /Gobernanza/i }).click();
    await expect(page).toHaveURL(/\/governance/);
    await expect(page.locator('h1').filter({ hasText: /Aprueba con/i })).toBeVisible();
    await capture(page, 'governance-approver-a-text-queue');
  });

  test('7. Login as Approver B (Lucía) — sees Vision Audit page', async ({ page }) => {
    await loginAs(page, 'approver_b');
    await capture(page, 'home-approver-b');

    await expect(page.getByText('Aprobador B', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: /Gobernanza/i }).click();
    await expect(page).toHaveURL(/\/governance/);
    await expect(page.locator('h1').filter({ hasText: /Cada visual auditado/i })).toBeVisible();
    await capture(page, 'governance-approver-b-vision-audit');
  });

  test('8. Logout flow returns to /login', async ({ page }) => {
    await loginAs(page, 'creator');

    // Open avatar menu then click logout
    await page.locator('header button').last().click();
    await page.getByRole('button', { name: /Cerrar sesión/i }).click();

    await expect(page).toHaveURL(/\/login/i, { timeout: 5_000 });
    await capture(page, 'after-logout');
  });
});
