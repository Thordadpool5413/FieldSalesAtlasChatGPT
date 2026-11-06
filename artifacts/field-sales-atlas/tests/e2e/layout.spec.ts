import { test, expect } from '@playwright/test';

test.beforeEach(async ({ context, baseURL }) => {
  await context.route('**/*', route => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort());
  await context.addInitScript(() => localStorage.setItem('field-atlas-map-source-v9', 'outline'));
});

for (const viewport of [{ width: 1536, height: 694 }, { width: 1366, height: 768 }, { width: 1280, height: 600 }]) {
  test(`navigation and map fit a ${viewport.width} × ${viewport.height} laptop window`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.locator('#field-atlas-main')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const logo = page.locator('.fsa-sidebar-brand img');
    const before = (await logo.boundingBox())!;
    const primary = page.getByRole('navigation', { name: 'Main sections' });
    const firstLink = (await primary.getByRole('button').first().boundingBox())!;
    expect(before.y).toBeGreaterThanOrEqual(8);
    expect(before.height).toBeGreaterThanOrEqual(96);
    expect(before.y + before.height).toBeLessThan(firstLink.y);
    const map = (await page.getByRole('group', { name: /Interactive United States map/ }).boundingBox())!;
    expect(map.y).toBeLessThan(viewport.height * .76);

    const tools = page.getByRole('region', { name: 'Workspace tools', exact: true });
    await tools.getByText('Reports & tools', { exact: true }).click();
    const lastTool = tools.getByRole('button').last();
    await lastTool.focus();
    await expect(lastTool).toBeInViewport();
    const after = (await logo.boundingBox())!;
    expect(Math.abs(after.y - before.y)).toBeLessThan(1);
    for (const name of ['Atlas', 'Travel', 'People', 'Calendar']) {
      await expect(primary.getByRole('button', { name, exact: true })).toBeInViewport();
    }
    await expect(page.locator('.fsa-sidebar-controls summary')).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('short-window forms keep validation, save and close controls visible while fields scroll', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto('/?page=people');
  await page.getByRole('button', { name: 'Add manager', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Add territory manager' });
  const save = dialog.getByRole('button', { name: 'Save changes' });
  await expect(save).toBeInViewport();
  await save.click();
  await expect(dialog.getByRole('alert')).toContainText('Enter the manager name.');
  await expect(dialog.getByRole('alert')).toBeInViewport();
  await dialog.getByLabel('Territory manager name', { exact: false }).fill('Laptop layout manager');
  await dialog.locator('.op-modal-body').evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(dialog.getByRole('button', { name: 'Close dialog' })).toBeInViewport();
  await expect(save).toBeInViewport();
  await save.click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Laptop layout manager', { exact: true }).first()).toBeVisible();

  await page.locator('.fsa-sidebar-controls summary').click();
  await page.getByRole('button', { name: 'Trainer profiles', exact: true }).click();
  const trainers = page.getByRole('dialog', { name: 'Manage the two field sales trainers' });
  await expect(trainers.getByRole('button', { name: 'Save trainer', exact: true })).toBeInViewport();
  await trainers.locator('.trainer-dialog-body').evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(trainers.getByRole('button', { name: 'Close trainer settings' })).toBeInViewport();
  await trainers.getByRole('button', { name: 'Close trainer settings' }).click();
  await expect(trainers).toBeHidden();
});

test('empty calendar has one time-block action and a header that fits the window', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto('/?page=calendar');
  const actions = page.locator('.fsa-calendar-header-actions');
  await expect(actions.getByRole('button', { name: 'Block trainer time', exact: true })).toHaveCount(1);
  for (const button of await actions.getByRole('button').all()) await expect(button).toBeInViewport();
  await actions.getByRole('button', { name: 'Block trainer time', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Block trainer time' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('a direct data-page link waits for workspace access before opening diagnostics', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/guest/create', async route => {
    await new Promise(resolve => setTimeout(resolve, 350));
    await route.continue();
  });
  await page.goto('/?page=data');
  await expect(page.getByRole('heading', { name: 'Data & exports' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Backend integrity and live data-source diagnostics' })).toBeVisible();
  await expect(page.getByText('Empty workspace', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('recovered workspace controls fit a short window and search works in focus mode', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto('/');
  const controls = page.locator('.fsa-sidebar-controls');
  await controls.locator('summary').click();
  const panel = (await controls.locator('.fsa-sidebar-control-body').boundingBox())!;
  expect(panel.y).toBeGreaterThanOrEqual(0);
  expect(panel.y + panel.height).toBeLessThanOrEqual(600);
  await controls.getByTitle('Miami Vice Light').click();
  await expect(controls).not.toHaveAttribute('open');
  await expect(page.locator('html')).toHaveAttribute('data-field-atlas-theme', 'light');
  await controls.locator('summary').click();
  await controls.getByRole('button', { name: 'Focus workspace', exact: true }).click();
  await expect(page.locator('.fsa-sidebar')).toBeHidden();
  await page.keyboard.press('Control+k');
  const search = page.getByRole('dialog', { name: 'Search the Field Sales Atlas' });
  await expect(search).toHaveCount(1);
  await expect(search).toBeVisible();
  await search.getByRole('button', { name: 'Close search' }).click();
  await page.getByRole('button', { name: 'Show navigation', exact: true }).click();
  await expect(page.locator('.fsa-sidebar')).toBeVisible();
});

test('phone keyboard search opens one visible dialog with the desktop rail hidden', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 664 });
  await page.goto('/');
  await expect(page.locator('#field-atlas-main')).toBeVisible();
  await page.keyboard.press('Control+k');
  const search = page.getByRole('dialog', { name: 'Search the Field Sales Atlas' });
  await expect(search).toHaveCount(1);
  await expect(search).toBeVisible();
  await search.getByRole('button', { name: 'Close search' }).click();
  await expect(search).toBeHidden();
});

for (const viewport of [{ width: 1280, height: 600 }, { width: 390, height: 664 }]) {
  test(`travel preferences keep their actions visible at ${viewport.width} × ${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/?page=plan&tool=travel');
    await page.getByRole('button', { name: 'Advanced comparison', exact: false }).click();
    await page.getByTitle('Edit travel preferences').click();
    const dialog = page.getByRole('dialog', { name: 'Personal travel settings' });
    const save = dialog.getByRole('button', { name: 'Save personal travel profile' });
    await expect(save).toBeInViewport();
    await dialog.locator('.op-modal-body').evaluate(element => { element.scrollTop = element.scrollHeight; });
    await expect(dialog.getByRole('button', { name: 'Close personal travel settings' })).toBeInViewport();
    await expect(save).toBeInViewport();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
