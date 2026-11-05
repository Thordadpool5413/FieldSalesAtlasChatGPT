import { test, expect } from '@playwright/test';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test.beforeEach(async ({ context, baseURL }) => {
  // Exercise the bundled-map fallback deterministically, without third-party uptime.
  await context.route('**/*', route => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort());
  await context.addInitScript(() => localStorage.setItem('field-atlas-map-source-v9', 'outline'));
});

test('Atlas loads; manager creation persists across a reload; navigation works', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', failure => errors.push(failure.message));
  await page.goto('/');
  await expect(page).toHaveTitle(/Field Sales Atlas/);
  await expect(page.locator('#field-atlas-main')).toBeVisible();
  await expect(page).toHaveURL(/#workspace=[0-9a-f]{64}/);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'People', exact: true }).filter({ visible: true }).first()).toBeVisible();
  await page.screenshot({ path: join(tmpdir(), `field-atlas-${info.project.name}-atlas.png`), fullPage: true });
  await page.getByRole('button', { name: 'People', exact: true }).filter({ visible: true }).first().click();
  await page.getByRole('button', { name: /Add manager/ }).filter({ visible: true }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const name = `Browser ${info.project.name} Manager`;
  await dialog.getByLabel('Territory manager name', { exact: false }).fill(name);
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: join(tmpdir(), `field-atlas-${info.project.name}-people.png`), fullPage: true });
  await page.getByRole('button', { name: 'Calendar', exact: true }).filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/page=calendar/);
  await page.getByRole('button', { name: 'Travel', exact: true }).filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/page=plan/);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test('live updates deliver saved manager changes to another browser tab', async ({ page, context }) => {
  await page.goto('/?page=people');
  await expect(page).toHaveURL(/#workspace=[0-9a-f]{64}/);
  const key = new URL(page.url()).hash.slice('#workspace='.length);
  const second = await context.newPage();
  await second.goto(page.url());
  // Subscription registration proves the event connection completed its handshake.
  await expect(page.locator('.atlas-sync-live')).toHaveCount(1);
  await expect(second.locator('.atlas-sync-live')).toHaveCount(1);
  const response = await page.request.post('/api/managers?workspaceKey=' + key, { data: { name: 'Live Sync Manager', baseState: 'FL' } });
  expect(response.status()).toBe(201);
  await expect(second.getByText('Live Sync Manager', { exact: true }).first()).toBeVisible();
  await second.close();
});
