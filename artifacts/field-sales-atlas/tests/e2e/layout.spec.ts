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

for (const viewport of [
  { width: 844, height: 390 },
  { width: 780, height: 360 },
  { width: 667, height: 375 },
]) {
  test(`short landscape phones keep the map and zoom controls within reach at ${viewport.width} × ${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');

    const map = page.getByRole('group', { name: /Interactive United States map/ });
    const frame = page.locator('.mv-map-frame');
    await expect(map).toBeVisible();
    const frameBounds = (await frame.boundingBox())!;
    expect(frameBounds.height).toBeGreaterThanOrEqual(180);
    expect(frameBounds.x).toBeGreaterThanOrEqual(0);
    expect(frameBounds.x + frameBounds.width).toBeLessThanOrEqual(viewport.width);
    expect(frameBounds.y).toBeGreaterThanOrEqual(0);
    expect(frameBounds.y).toBeLessThan(viewport.height);

    const zoomControls = page.getByRole('group', { name: 'Map zoom controls' });
    await expect(zoomControls).toBeVisible();
    const zoomIn = zoomControls.getByRole('button', { name: 'Zoom in' });
    const zoomOut = zoomControls.getByRole('button', { name: 'Zoom out' });
    for (const button of [zoomIn, zoomOut]) {
      await expect(button).toBeInViewport();
      const bounds = (await button.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
    }
    await zoomIn.click();
    await expect(zoomControls.getByLabel('Map magnification')).toHaveText('135%');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
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

test('empty manager directory offers one clear action and no unused filters', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?page=people');

  await expect(page.getByRole('button', { name: 'Add manager', exact: true })).toHaveCount(1);
  await expect(page.getByRole('textbox', { name: 'Search territory managers' })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'All trainers' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Add manager', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Add territory manager' })).toBeVisible();
});

test('travel start uses a compact working header instead of the photo hero', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?page=plan&tool=start');

  const header = page.locator('.fao-workbench-head');
  await expect(header).toBeVisible();
  await expect(page.getByTestId('button-new-trip')).toBeVisible();
  await expect(header.locator('.vice-masthead-image')).toHaveCount(0);
  expect((await header.boundingBox())!.height).toBeLessThan(120);
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
  const diagnostics = page.getByRole('region', { name: 'Backend integrity and live data-source diagnostics' });
  await expect(diagnostics).toBeVisible();
  await expect(diagnostics.getByTestId('status-api-health'))
    .toContainText(/API responding|API availability could not be confirmed/);
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
  await expect(flightInsights).toBeVisible();
  await expect(flightInsights.locator('small')).toBeVisible();
  await expect(flightInsights.locator('small')).toHaveText('Check past flights, airport alerts, and weather.');
  await expect(flightInsights).toHaveAccessibleDescription('Check past flights, airport alerts, and weather.');
  await expect(flightInsights).toHaveAttribute('aria-current', 'page');
  await expect(drawer.getByRole('group', { name: 'TEAM tools' })).toContainText('Coordinate trainers');
  await expect(drawer.getByRole('group', { name: 'More tools' })).toContainText('County & ZIP explorer');

  await drawer.getByRole('group', { name: 'More tools' })
    .getByRole('button', { name: 'County & ZIP explorer', exact: true }).click();
  await expect(page).toHaveURL(/page=map/);
  await expect(drawer).toBeHidden();

  await page.goto('/');
  const mapFrame = page.locator('.mv-map-frame');
  await expect(mapFrame).toBeVisible();
  const mapBefore = (await mapFrame.boundingBox())!;
  await page.getByRole('button', { name: 'Open tools and navigation' }).click();
  await expect(drawer).toBeVisible();
  await flightInsights.scrollIntoViewIfNeeded();
  await expect(flightInsights.locator('small')).toBeInViewport();
  const mapAfter = (await mapFrame.boundingBox())!;
  expect(Math.abs(mapAfter.x - mapBefore.x)).toBeLessThan(1);
  expect(Math.abs(mapAfter.width - mapBefore.width)).toBeLessThan(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('desktop navigation and workspace search explain specialized tools without changing destinations', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  const mission = page.getByRole('navigation', { name: 'insights sections' })
    .getByRole('button', { name: 'Mission Control', exact: true });
  await mission.scrollIntoViewIfNeeded();
  await expect(mission.locator('small')).toHaveText('Review field readiness and find work that needs attention.');
  await expect(mission.locator('small')).toBeInViewport();
  await expect(mission).toHaveAccessibleDescription('Review field readiness and find work that needs attention.');

  const map = page.locator('.mv-map-frame');
  await expect(map).toBeVisible();
  const mapBounds = (await map.boundingBox())!;
  expect(mapBounds.width).toBeLessThanOrEqual(1280);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await mission.click();
  await expect(page).toHaveURL(/page=mission/);
  await expect(mission).toHaveAttribute('aria-current', 'page');
  await page.goto('/?page=plan&tool=radar');
  const flightTab = page.locator('.fsa-hub-tabs').getByRole('tab', { name: /Flight DNA/ });
  await expect(flightTab).toContainText('Check past flights, airport alerts, and weather');
  await page.keyboard.press('Control+k');
  const search = page.getByRole('dialog', { name: 'Search all workspace data' });
  await search.getByRole('combobox').fill('Flight DNA');
  const flightResult = search.getByRole('option', { name: /Flight DNA/ });
  await expect(flightResult).toContainText('Check past flights, airport alerts, and weather');
  await flightResult.click();
  await expect(page).toHaveURL(/page=plan&tool=radar/);
});

test('tool purpose copy stays the same in desktop, phone, search and Travel tabs', async ({ page }) => {
  const travelTools = [
    { label: 'Flight DNA', description: 'Check past flights, airport alerts, and weather.' },
    { label: 'Booked flights', description: 'Review imported itineraries and flight details.' },
    { label: 'Airport & route planner', description: 'Compare airports and routes for a trip.' },
    { label: 'Itineraries', description: 'Review saved trip plans.' },
    { label: 'Our Week', description: 'See the team’s weekly schedule.' },
    { label: 'Coordinate trainers', description: 'Balance trainer coverage and find better visit options.' },
  ];

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?page=plan&tool=radar');
  const desktopInsights = page.getByRole('navigation', { name: 'insights sections' });
  for (const item of travelTools.filter(tool => ['Flight DNA', 'Booked flights'].includes(tool.label))) {
    const button = desktopInsights.getByRole('button', { name: item.label, exact: true });
    await expect(button.locator('small')).toHaveText(item.description);
  }
  const desktopTeam = page.getByRole('navigation', { name: 'team sections' });
  const coordinate = desktopTeam.getByRole('button', { name: 'Coordinate trainers', exact: true });
  await expect(coordinate.locator('small')).toHaveText(travelTools[5].description);
  await page.getByText('More tools', { exact: true }).click();
  const desktopMore = page.getByRole('navigation', { name: 'Additional workspace tools' });
  const planner = desktopMore.getByRole('button', { name: 'Airport & route planner', exact: true });
  await expect(planner.locator('small')).toHaveText(travelTools[2].description);

  const tabs = page.getByRole('tablist', { name: 'Planning tools' });
  for (const [index, item] of travelTools.entries()) {
    const tab = tabs.getByRole('tab').nth(index);
    await expect(tab.locator('strong')).toHaveText(item.label);
    await expect(tab.locator('small')).toHaveText(item.description);
  }

  await page.keyboard.press('Control+k');
  const search = page.getByRole('dialog', { name: 'Search all workspace data' });
  const searchInput = search.getByRole('combobox');
  for (const item of travelTools) {
    await searchInput.fill(item.label);
    const result = search.getByRole('option').filter({ hasText: item.label }).last();
    await expect(result.locator('small')).toHaveText(item.description);
  }
  await search.getByRole('button', { name: 'Close search' }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?page=plan&tool=radar');
  await page.getByRole('button', { name: 'Open tools and navigation' }).click();
  const drawer = page.getByRole('dialog', { name: 'Field Sales Atlas tools and navigation' });
  for (const item of travelTools.filter(tool => ['Flight DNA', 'Booked flights', 'Coordinate trainers'].includes(tool.label))) {
    const button = drawer.getByRole('button', { name: item.label, exact: true });
    await expect(button.locator('small')).toHaveText(item.description);
  }
  const phonePlanner = drawer.getByRole('group', { name: 'More tools' })
    .getByRole('button', { name: 'Airport & route planner', exact: true });
  await expect(phonePlanner.locator('small')).toHaveText(travelTools[2].description);
});

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`first-time visitors can choose setup, map or travel at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const firstUse = page.getByRole('region', { name: 'First-time guide' });
    const paths = firstUse.getByRole('group', { name: 'Choose how to start' });
    await expect(firstUse).toBeVisible();
    await expect(firstUse).toContainText('Add a manager, choose a territory, then schedule your first visit.');
    for (const label of ['Set up my team', 'Explore the map', 'Plan travel']) {
      await expect(paths.getByRole('button', { name: label, exact: true })).toBeVisible();
    }
    if (viewport.width <= 600) {
      const mapKey = page.getByTestId('atlas-map-key').first();
      await expect(mapKey).toBeVisible();
      await expect(mapKey).toContainText('Workspace assignment');
      await expect(mapKey).toContainText('Location only—not territory or flight status');
    } else {
      await expect(firstUse).toContainText('Airport dots are public locations, not live flights. Filled areas are saved workspace territories.');
    }

    await paths.getByRole('button', { name: 'Set up my team', exact: true }).click();
    const setup = page.getByRole('region', { name: 'Workspace setup' });
    await expect(setup.getByText('Add your first manager', { exact: true })).toBeVisible();
    await expect(setup.getByText('Choose a region and territory', { exact: true })).toBeVisible();
    await expect(setup.getByText('Schedule your first visit', { exact: true })).toBeVisible();
    await expect(setup.getByRole('button', { name: 'Add first manager', exact: true })).toBeEnabled();
    await expect(setup.getByRole('button', { name: 'Choose a region', exact: true })).toBeDisabled();

    await setup.getByRole('button', { name: 'Explore the map', exact: true }).click();
    const regionPicker = page.getByLabel('Jump to any U.S. state or Canadian province');
    await expect(regionPicker).toBeFocused();
    await expect(firstUse).toHaveCount(0);
    if (viewport.width <= 600) await setup.getByTestId('setup-open').click();
    else await setup.getByRole('button', { name: 'Set up workspace', exact: true }).click();

    await setup.getByRole('button', { name: 'Continue on my own', exact: true }).click();
    await expect(setup).toHaveCount(0);
    if (viewport.width <= 600) {
      await page.getByRole('button', { name: 'Open tools and navigation' }).click();
      await page.getByRole('dialog', { name: 'Field Sales Atlas tools and navigation' })
        .getByRole('button', { name: 'Workspace setup', exact: true }).click();
    } else {
      const controls = page.locator('.fsa-sidebar-controls');
      await controls.locator('summary').click();
      await controls.getByRole('button', { name: 'Workspace setup', exact: true }).click();
    }
    await expect(setup.getByText('Add your first manager', { exact: true })).toBeVisible();
    await setup.getByRole('button', { name: 'Plan travel', exact: true }).click();
    await expect(page).toHaveURL(/page=plan&tool=travel/);
    await expect(page.getByRole('region', { name: 'Guided trip planner' })).toBeVisible();
  });
}

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

  const sources = page.locator('.atlas-data-sources:visible').first();
  await sources.locator('summary').click();
  const airportSource = sources.getByTestId('source-airports');
  await expect(airportSource).toContainText('OurAirports reference directory');
  await expect(airportSource).toContainText('not live flights');

  await page.getByTestId('map-view-map').click();
  await expect(page.locator('.mv-map-body')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const viewport of [{ width: 1280, height: 600 }, { width: 390, height: 664 }]) {
  test(`travel preferences keep their actions visible at ${viewport.width} × ${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const workspaceErrors:string[]=[];
    page.on('pageerror', error => workspaceErrors.push(error.message));
    await page.goto('/?page=plan&tool=travel');
    const comparison=page.getByRole('button', { name: 'Advanced comparison', exact: false });
    await expect(comparison).toBeVisible();
    expect(workspaceErrors).not.toContain('Workspace is still opening.');
    await comparison.click();
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
