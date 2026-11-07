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
    const primary = page.getByRole('navigation', { name: 'plan sections' });
    const firstLink = (await primary.getByRole('button').first().boundingBox())!;
    expect(before.y).toBeGreaterThanOrEqual(8);
    expect(before.height).toBeGreaterThanOrEqual(96);
    expect(before.y + before.height).toBeLessThan(firstLink.y);
    const map = (await page.getByRole('group', { name: /Interactive United States map/ }).boundingBox())!;
    expect(map.y).toBeLessThan(viewport.height * .76);

    const tools = page.getByRole('region', { name: 'Workspace tools', exact: true });
    await tools.getByText('More tools', { exact: true }).click();
    const lastTool = tools.getByRole('button').last();
    await lastTool.focus();
    await expect(lastTool).toBeInViewport();
    const after = (await logo.boundingBox())!;
    expect(Math.abs(after.y - before.y)).toBeLessThan(1);
    for (const name of ['Atlas', 'Travel', 'People', 'Calendar']) {
      const link = tools.getByRole('button', { name, exact: true });
      await link.focus();
      await expect(link).toBeInViewport();
    }
    await expect(page.locator('.fsa-sidebar-controls summary')).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('short landscape phones keep the map and zoom controls within reach', async ({ page }) => {
  const viewport = { width: 844, height: 390 };
  await page.setViewportSize(viewport);
  await page.goto('/');

  const map = page.getByRole('group', { name: /Interactive United States map/ });
  const frame = page.locator('.mv-map-frame');
  await expect(map).toBeVisible();
  const frameBounds = (await frame.boundingBox())!;
  expect(frameBounds.height).toBeGreaterThanOrEqual(180);
  expect(frameBounds.y).toBeGreaterThanOrEqual(0);
  expect(frameBounds.y).toBeLessThan(viewport.height);

  const zoomControls = page.getByRole('group', { name: 'Map zoom controls' });
  const zoomIn = zoomControls.getByRole('button', { name: 'Zoom in' });
  await expect(zoomIn).toBeInViewport();
  const zoomBounds = (await zoomIn.boundingBox())!;
  expect(zoomBounds.x).toBeGreaterThanOrEqual(0);
  expect(zoomBounds.x + zoomBounds.width).toBeLessThanOrEqual(viewport.width);
  await zoomIn.click();
  await expect(zoomControls.getByLabel('Map magnification')).toHaveText('135%');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

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
  const search = page.getByRole('dialog', { name: 'Search all workspace data' });
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
  const search = page.getByRole('dialog', { name: 'Search all workspace data' });
  await expect(search).toHaveCount(1);
  await expect(search).toBeVisible();
  await search.getByRole('button', { name: 'Close search' }).click();
  await expect(search).toBeHidden();
});

test('mobile tools are grouped consistently and preserve every destination', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?page=plan&tool=radar');
  const bottomTabs = page.getByRole('navigation', { name: 'Primary iPhone tabs' });
  for (const name of ['Atlas', 'Travel', 'People', 'Calendar']) {
    await expect(bottomTabs.getByRole('button', { name, exact: true })).toBeVisible();
  }

  await page.getByRole('button', { name: 'Open tools and navigation' }).click();
  const drawer = page.getByRole('dialog', { name: 'Field Sales Atlas tools and navigation' });
  const insights = drawer.getByRole('group', { name: 'INSIGHTS tools' });
  const flightInsights = insights.getByRole('button', { name: 'Flight DNA', exact: true });
  await expect(flightInsights).toHaveAttribute('aria-current', 'page');
  await expect(drawer.getByRole('group', { name: 'TEAM tools' })).toContainText('Coordinate trainers');
  await expect(drawer.getByRole('group', { name: 'More tools' })).toContainText('County & ZIP explorer');

  await drawer.getByRole('group', { name: 'More tools' })
    .getByRole('button', { name: 'County & ZIP explorer', exact: true }).click();
  await expect(page).toHaveURL(/page=map/);
  await expect(drawer).toBeHidden();
});

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`workspace and map search have one clear scope at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.locator('.fsa-command-trigger:visible')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Search all workspace data: people, places, trips and tools' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Search this map for a state, manager or airport' })).toBeVisible();
  });
}

test('phone users can browse an accessible, searchable map list with source details', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const setupChip = page.getByTestId('setup-open');
  await expect(setupChip).toBeVisible();
  await setupChip.click();
  await expect(page.getByRole('button', { name: 'Add first manager' })).toBeEnabled();
  await page.getByRole('button', { name: 'Collapse', exact: true }).click();
  await page.getByRole('button', { name: 'Minimize setup reminder' }).click();
  await expect(setupChip).toBeVisible();

  const listSwitch = page.getByTestId('map-view-list');
  await expect(listSwitch).toBeVisible();
  await listSwitch.click();
  await expect(page.getByTestId('atlas-readable-list')).toBeVisible();
  await expect(page.locator('.mv-map-body')).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Browse map data as a list' })).toBeVisible();

  const filter = page.getByTestId('map-list-filter');
  await filter.fill('California');
  await expect(filter).toHaveValue('California');
  await expect(page.getByTestId('region-row-CA')).toBeVisible();

  const sources = page.getByTestId('data-sources');
  await sources.locator('summary').click();
  const airportSource = page.getByTestId('source-airports');
  await expect(airportSource).toContainText('OurAirports reference directory');
  await expect(airportSource).toContainText('not live flights');

  await page.getByTestId('map-view-map').click();
  await expect(page.locator('.mv-map-body')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
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
