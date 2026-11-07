import { test, expect, type Page } from '@playwright/test';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

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

test('setup opens existing trainer tools, resumes after dismissal, and keeps demo records separate', async ({ page }, info) => {
  await page.goto('/');
  await expect(page).toHaveURL(/#workspace=[0-9a-f]{64}/);
  const realUrl = page.url();
  const realKey = new URL(realUrl).hash.slice('#workspace='.length);
  if (info.project.name === 'mobile') {
    await page.getByTestId('setup-open').click();
  } else {
    await page.getByRole('button', { name: 'Set up workspace', exact: true }).click();
  }
  const setup = page.getByRole('region', { name: 'Workspace setup' });
  await expect(setup.getByText('0 of 3 setup steps complete')).toBeVisible();
  await setup.getByRole('button', { name: 'Set trainer profiles' }).click();
  await expect(page.getByRole('dialog', { name: 'Manage the two field sales trainers' })).toBeVisible();
  await page.getByRole('button', { name: 'Close trainer settings' }).click();
  await page.getByRole('button', { name: 'Set up workspace', exact: true }).click();
  await setup.getByRole('button', { name: 'Explore a demo' }).click();
  await expect(page.getByRole('region', { name: 'Demo workspace' })).toBeVisible();
  expect(new URL(page.url()).hash).not.toEqual(new URL(realUrl).hash);
  const original = await page.request.get('/api/operations?workspaceKey=' + realKey);
  expect((await original.json()).managers).toHaveLength(0);
  await page.getByRole('button', { name: 'Return to my workspace' }).click();
  await expect(page).toHaveURL(realUrl);
  await page.getByRole('button', { name: 'Dismiss setup reminder' }).click();
  await page.reload();
  await expect(page.getByRole('region', { name: 'Workspace setup' })).toHaveCount(0);
  await page.getByRole('button', { name: 'People', exact: true }).filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/page=people/);
  if (info.project.name === 'mobile') {
    await page.getByRole('button', { name: 'Open tools and navigation' }).click();
  } else {
    await page.getByText('Workspace controls', { exact: true }).click();
  }
  await page.getByRole('button', { name: 'Workspace setup', exact: true }).filter({ visible: true }).first().click();
  const reopenedSetup = page.getByRole('region', { name: 'Workspace setup' });
  await expect(page).toHaveURL(/page=home/);
  await expect(reopenedSetup.locator('.atlas-setup-body')).toBeVisible();
  await expect(reopenedSetup.getByRole('button', { name: 'Collapse', exact: true })).toBeVisible();
});

function nextFieldWeek() {
  const date = new Date(); date.setUTCDate(date.getUTCDate() + 14);
  while (date.getUTCDay() !== 1) date.setUTCDate(date.getUTCDate() + 1);
  const start = date.toISOString().slice(0, 10);
  date.setUTCDate(date.getUTCDate() + 2);
  return { start, end: date.toISOString().slice(0, 10) };
}

test('guided planning saves the proposed trip and visits into the shared calendar', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', failure => errors.push(failure.message));
  const demo = await page.request.post('/api/demo/create', { data: {} });
  const key = (await demo.json()).workspaceKey;
  await page.goto('/?page=plan&tool=travel#workspace=' + key);
  const planner = page.getByRole('region', { name: 'Guided trip planner' });
  await planner.getByRole('checkbox', { name: /Demo · Jordan Ellis/ }).check();
  await planner.getByRole('checkbox', { name: /Demo · Casey Rivera/ }).check();
  await planner.getByRole('button', { name: 'Continue to Dates' }).click();
  const { start, end } = nextFieldWeek();
  await planner.getByLabel('Trip name').fill('Guided Florida circuit');
  await planner.getByLabel('Departure date', { exact: true }).fill(start);
  await planner.getByLabel('Return date', { exact: true }).fill(end);
  await planner.getByRole('button', { name: 'Continue to Airports' }).click();
  await planner.getByLabel('Departure airport', { exact: true }).selectOption('MIA');
  await planner.getByRole('radio', { name: /MCO/ }).check();
  await planner.getByRole('button', { name: 'Continue to Review' }).click();
  await expect(planner.getByText('No conflicts found in saved workspace records.')).toBeVisible();
  await page.screenshot({ path: join(tmpdir(), `field-atlas-${info.project.name}-guided-review.png`), fullPage: false, scale: 'css' });
  await planner.getByRole('button', { name: 'Add trip and visits to Calendar' }).click();
  await expect(page).toHaveURL(/page=calendar/);
  const board = await (await page.request.get('/api/operations?workspaceKey=' + key)).json();
  expect(board.trips).toHaveLength(1);
  expect(board.trips[0].title).toBe('Guided Florida circuit');
  expect(board.visits).toHaveLength(2);
  expect(board.visits.every((visit: { tripId: string }) => visit.tripId === board.trips[0].id)).toBe(true);
  expect(errors).toEqual([]);
});

test('compact Atlas shows the map early, loads vector mode without MapLibre, and opens region details', async ({ page }, info) => {
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await page.addInitScript(() => localStorage.setItem('field-atlas-map-welcome-v1', 'seen'));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Explore Florida', exact: true })).toBeVisible();
  expect(requests.some(url => url.includes('/assets/LiveTerritoryMap-'))).toBe(false);
  const map = page.getByRole('group', { name: /Interactive United States map/ });
  const bounds = await map.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.y).toBeLessThan(page.viewportSize()!.height * .72);
  await page.screenshot({ path: join(tmpdir(), `field-atlas-${info.project.name}-compact-atlas.png`), fullPage: false, scale: 'css' });
  await page.getByRole('button', { name: 'Explore Florida', exact: true }).press('Enter');
  const inspector = page.getByRole('complementary', { name: 'Territory details for Florida' });
  await expect(inspector).toBeVisible();
  if (info.project.name === 'mobile') {
    expect(await inspector.evaluate(element => getComputedStyle(element).position)).toBe('fixed');
    const sheet = await inspector.boundingBox();
    expect(sheet!.y).toBeGreaterThanOrEqual(54);
    expect(sheet!.y + sheet!.height).toBeLessThan(page.viewportSize()!.height - 60);
    await page.screenshot({ path: join(tmpdir(), 'field-atlas-mobile-territory-sheet.png'), scale: 'css' });
  }
  await expect(page.getByRole('button', { name: 'Close destination inspector' })).toBeVisible();
  await page.getByRole('button', { name: 'Close destination inspector' }).click();
  await expect(inspector).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test('map symbols and controls stay clear in both map modes and themes', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Map-source parity is covered at desktop size.');
  await page.route('https://tiles.openfreemap.org/styles/**', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      version: 8,
      sources: {},
      layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#102238' } }],
    }),
  }));
  const demo = await page.request.post('/api/demo/create', { data: {} });
  const { workspaceKey } = await demo.json();
  await page.addInitScript(() => localStorage.setItem('field-atlas-map-welcome-v1', 'seen'));
  await page.goto('/#workspace=' + workspaceKey);

  const mapKey = page.getByTestId('atlas-map-key');
  const assignedRegion = page.locator('.mv-region-us.assigned').first();
  const airportMarker = page.locator('.mv-airport-mark.major .mv-airport-bubble').first();
  await expect(mapKey).toBeVisible();
  await expect(mapKey).toContainText('Saved territory');
  await expect(mapKey).toContainText('Workspace assignment');
  await expect(mapKey).toContainText('Public airport');
  await expect(mapKey).toContainText('Location reference, not live flights');
  await expect(mapKey).toContainText('Workspace records');
  await expect(assignedRegion).toHaveCount(1);
  await expect(airportMarker).toHaveCount(1);

  const appearance = page.locator('.fsa-sidebar-controls summary');
  const controls = page.locator('.fsa-sidebar-controls');
  const appearanceGroup = page.getByRole('group', { name: 'Appearance' });
  const themeValues: Record<string, string> = {};

  async function chooseTheme(name: 'Light' | 'Dark') {
    if (!await controls.evaluate(element => (element as HTMLDetailsElement).open)) {
      await appearance.click();
    }
    await appearanceGroup.getByRole('button', { name, exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-field-atlas-theme', name.toLowerCase());
  }

  async function verifyLegendAndControls(theme: 'light' | 'dark', mode: 'svg' | 'maplibre') {
    await expect(mapKey).toContainText(/Live connection|Recently updated|Offline|Connecting/);
    await expect.poll(() => page.evaluate(() => {
      const app = document.querySelector('.mv-app')!;
      return getComputedStyle(app.querySelector('.mv-region-us.assigned')!).fill ===
        getComputedStyle(app.querySelector('.atlas-map-key-territory')!).backgroundColor;
    })).toBe(true);
    const colors = await page.evaluate(() => {
      const app = document.querySelector('.mv-app')!;
      const keyTerritory = app.querySelector('.atlas-map-key-territory')!;
      const assigned = app.querySelector('.mv-region-us.assigned')!;
      const keyAirport = app.querySelector('.atlas-map-key-airport')!;
      const airport = app.querySelector('.mv-airport-mark.major .mv-airport-bubble')!;
      return {
        territoryKey: getComputedStyle(keyTerritory).backgroundColor,
        territoryFill: getComputedStyle(assigned).fill,
        airportKey: getComputedStyle(keyAirport).color,
        airportFill: getComputedStyle(airport).fill,
      };
    });
    expect(colors.airportFill).toBe(colors.airportKey);
    const signature = JSON.stringify(colors);
    if (themeValues[theme]) expect(signature).toBe(themeValues[theme]);
    else themeValues[theme] = signature;

    const sourceToggle = page.locator('.atlas-map-mode-toggle');
    await sourceToggle.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(sourceToggle).toBeFocused();
    const focusStyle = await sourceToggle.evaluate(element => {
      const style = getComputedStyle(element);
      return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
    });
    expect(focusStyle.outlineStyle).not.toBe('none');
    expect(parseFloat(focusStyle.outlineWidth)).toBeGreaterThanOrEqual(2);

    const zoomToRegion = page.getByRole('button', { name: 'Zoom to selected state' });
    await expect(zoomToRegion).toBeDisabled();
    const disabledStyle = await zoomToRegion.evaluate(element => {
      const style = getComputedStyle(element);
      return { opacity: Number(style.opacity), cursor: style.cursor };
    });
    expect(disabledStyle.opacity).toBeLessThan(1);
    expect(disabledStyle.cursor).toBe('not-allowed');

    if (mode === 'maplibre') {
      await expect(page.locator('.atlas-live-map-ready canvas')).toBeVisible();
    } else {
      await expect(page.locator('.atlas-live-map-ready')).toHaveCount(0);
    }
  }

  for (const theme of ['Light', 'Dark'] as const) {
    await chooseTheme(theme);
    const normalizedTheme = theme.toLowerCase() as 'light' | 'dark';
    await verifyLegendAndControls(normalizedTheme, 'svg');

    const sourceToggle = page.locator('.atlas-map-mode-toggle');
    await sourceToggle.click();
    await expect(sourceToggle).toContainText('Street map');
    await expect(page.locator('.atlas-live-map-ready canvas')).toBeVisible();
    await verifyLegendAndControls(normalizedTheme, 'maplibre');
    await sourceToggle.click();
    await expect(sourceToggle).toContainText('Vector map');
    await expect(page.locator('.atlas-live-map-ready')).toHaveCount(0);
  }
});

test('first visit welcomes; returning visit keeps the map compact and usable', async ({ page }) => {
  const viewport = page.viewportSize()!;
  const mobile = viewport.width <= 900;
  const map = page.getByRole('group', { name: /Interactive United States map/ });
  const mapFrame = page.locator('.mv-map-frame');

  async function expectMapProminentAndUsable(compact: boolean) {
    await expect(map).toBeVisible();
    const bounds = await map.boundingBox();
    const frame = await mapFrame.boundingBox();
    expect(bounds).not.toBeNull();
    expect(frame).not.toBeNull();
    if (compact) expect(bounds!.y).toBeLessThan(viewport.height * .76);
    expect(frame!.height).toBeGreaterThanOrEqual(mobile ? 320 : 480);

    const zoomControls = page.getByRole('group', { name: 'Map zoom controls' });
    const zoomIn = zoomControls.getByRole('button', { name: 'Zoom in' });
    await expect(zoomIn).toBeVisible();
    await zoomIn.click();
    await expect(zoomControls.getByLabel('Map magnification')).toHaveText('135%');
  }

  await page.goto('/');
  const welcome = page.locator('.mv-map-page > .vice-masthead');
  await expect(welcome).toBeVisible();
  await expect(welcome.getByRole('heading', { name: 'Your field. In perspective.' })).toBeVisible();
  await expect.poll(() => welcome.locator('img').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator('.fsa-map-heading-text h2')).toHaveText('Territory atlas');
  await expectMapProminentAndUsable(false);

  await page.reload();
  await expect(welcome).toHaveCount(0);
  await expect(page.locator('.fsa-map-heading')).toBeVisible();
  await expect(page.locator('.fsa-map-heading-text')).toHaveCount(0);
  await expectMapProminentAndUsable(true);
  expect(await page.evaluate(() => localStorage.getItem('field-atlas-map-welcome-v1'))).toBe('seen');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test('saved territory stays selected in the compact map after reload', async ({ page }) => {
  const viewport = page.viewportSize()!;
  const mobile = viewport.width <= 900;
  const demo = await page.request.post('/api/demo/create', { data: {} });
  const { workspaceKey } = await demo.json();
  const board = await (await page.request.get('/api/operations?workspaceKey=' + workspaceKey)).json();
  expect(board.assignments.some((assignment: { stateCode: string }) => assignment.stateCode === 'FL')).toBe(true);

  await page.addInitScript(() => localStorage.setItem('field-atlas-map-welcome-v1', 'seen'));
  await page.goto('/#workspace=' + workspaceKey);
  const regionPicker = page.getByLabel('Jump to any U.S. state or Canadian province');
  await expect(regionPicker).toBeVisible();
  await regionPicker.selectOption('FL');

  const inspector = page.getByRole('complementary', { name: 'Territory details for Florida' });
  await expect(inspector).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('field-atlas-focused-region-v1')))
    .toBe(JSON.stringify({ code: 'FL', name: 'Florida', country: 'US' }));

  await page.reload();
  await expect(page.locator('.mv-map-page > .vice-masthead')).toHaveCount(0);
  await expect(page.locator('.fsa-map-heading')).toBeVisible();
  await expect(page.locator('.fsa-map-heading-text')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Field actions for Florida' })).toBeVisible();
  await expect(inspector).toBeVisible();
  await expect(page.locator('.atlas-context')).toContainText('Florida');
  await expect(page.locator('.mv-region-us.active.assigned[aria-label^="Explore Florida"]')).toHaveCount(1);

  const map = page.getByRole('group', { name: /Interactive United States map/ });
  const frame = page.locator('.mv-map-frame');
  await expect(map).toBeVisible();
  const frameBounds = await frame.boundingBox();
  expect(frameBounds).not.toBeNull();
  expect(frameBounds!.height).toBeGreaterThanOrEqual(mobile ? 320 : 480);

  await expect(regionPicker).toHaveValue('FL');
  if (mobile) {
    const focusMap = page.getByRole('button', { name: 'Focus', exact: true });
    await expect(focusMap).toBeVisible();
    await focusMap.click();
    await expect(inspector).toBeHidden();
    await expect(page.locator('.mv-region-us.active.assigned[aria-label^="Explore Florida"]')).toHaveCount(1);
  }
  const zoomControls = page.getByRole('group', { name: 'Map zoom controls' });
  await expect(zoomControls).toBeVisible();
  await zoomControls.getByRole('button', { name: 'Zoom in' }).click();
  await expect(zoomControls.getByLabel('Map magnification')).toHaveText('135%');
  await page.getByRole('button', { name: /Layers/ }).click();
  await expect(page.locator('.mv-layers-popover')).toBeVisible();
  await expect(page.getByLabel('Assigned territories')).toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test('guided review blocks saving when the trainer is unavailable', async ({ page }) => {
  const key = (await (await page.request.post('/api/demo/create', { data: {} })).json()).workspaceKey;
  const { start, end } = nextFieldWeek();
  const response = await page.request.post('/api/trainer-availability?workspaceKey=' + key, { data: {
    id: randomUUID(), trainerId: 'trainer_a', startDate: start, endDate: end, reason: 'Personal time', notes: '',
  } });
  expect(response.status()).toBe(201);
  await page.goto('/?page=plan&tool=travel#workspace=' + key);
  const planner = page.getByRole('region', { name: 'Guided trip planner' });
  await planner.getByRole('checkbox', { name: /Demo · Jordan Ellis/ }).check();
  await planner.getByRole('button', { name: 'Continue to Dates' }).click();
  await planner.getByLabel('Departure date', { exact: true }).fill(start);
  await planner.getByLabel('Return date', { exact: true }).fill(end);
  await planner.getByRole('button', { name: 'Continue to Airports' }).click();
  await planner.getByRole('radio', { name: /MCO/ }).check();
  await planner.getByRole('button', { name: 'Continue to Review' }).click();
  await expect(planner.getByRole('alert')).toContainText('personal time');
  await expect(planner.getByRole('button', { name: 'Add trip and visits to Calendar' })).toBeDisabled();
  const board = await (await page.request.get('/api/operations?workspaceKey=' + key)).json();
  expect(board.trips).toHaveLength(0);
  expect(board.visits).toHaveLength(0);
});

test('advanced comparison retains the people and dates chosen in the guide', async ({ page }) => {
  const key = (await (await page.request.post('/api/demo/create', { data: {} })).json()).workspaceKey;
  await page.goto('/?page=plan&tool=travel#workspace=' + key);
  const planner = page.getByRole('region', { name: 'Guided trip planner' });
  await planner.getByRole('checkbox', { name: /Demo · Jordan Ellis/ }).check();
  await planner.getByRole('button', { name: 'Continue to Dates' }).click();
  const { start, end } = nextFieldWeek();
  await planner.getByLabel('Departure date', { exact: true }).fill(start);
  await planner.getByLabel('Return date', { exact: true }).fill(end);
  await planner.getByRole('button', { name: 'Advanced comparison' }).click();
  await expect(page.getByRole('heading', { name: 'Travel planning', exact: true })).toBeVisible();
  const advanced = page.locator('.travel-page');
  await expect(advanced.getByLabel('Depart', { exact: true })).toHaveValue(start);
  await expect(advanced.getByLabel('Return', { exact: true })).toHaveValue(end);
  await expect(advanced.getByRole('button', { name: 'Demo · Jordan Ellis', exact: true })).toBeVisible();
});

test('joint travel intelligence compares options, discloses evidence gaps and saves both trainers atomically', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const key = (await (await page.request.post('/api/demo/create', { data: {} })).json()).workspaceKey;
  const initial = await (await page.request.get('/api/operations?workspaceKey=' + key)).json();
  const partnerManager = initial.managers.find((person: { name: string }) => person.name.includes('Casey'));
  expect((await page.request.put('/api/managers/' + partnerManager.id + '?workspaceKey=' + key, { data: { ...partnerManager, trainer: 'Morgan', expectedUpdatedAt: partnerManager.updatedAt } })).status()).toBe(200);
  await page.goto('/?page=plan&tool=travel#workspace=' + key);
  await page.getByRole('button', { name: 'Plan together' }).click();
  const planner = page.getByRole('region', { name: 'Intelligent journey planner' });
  await planner.getByRole('checkbox', { name: /Demo · Jordan Ellis/ }).check();
  await planner.getByRole('checkbox', { name: /Demo · Casey Rivera/ }).check();
  const { start, end } = nextFieldWeek();
  await planner.getByLabel('First field date').fill(start); await planner.getByLabel('Last field date').fill(end);
  await planner.getByRole('button', { name: 'Build travel options' }).click();
  await expect(planner.getByRole('heading', { name: 'Your week, considered.' })).toBeVisible({ timeout: 20000 });
  const optionCount = await planner.getByRole('radiogroup', { name: 'Travel options' }).getByRole('radio').count();
  expect(optionCount).toBeGreaterThanOrEqual(1); expect(optionCount).toBeLessThanOrEqual(3);
  await expect(planner.getByText('No road-routing service is configured.', { exact: false }).first()).toBeVisible();
  await expect(planner.getByText('America/New_York', { exact: false }).first()).toBeVisible();
  await expect(planner.getByRole('button', { name: 'Add this option to Calendar' })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: join(tmpdir(), `field-atlas-${info.project.name}-joint-intelligence.png`), fullPage: true, scale: 'css' });
  const partner = await page.context().newPage();
  const subscribed = partner.waitForResponse(response => response.url().includes('/api/subscriptions?') && response.status() === 200);
  await partner.goto('/?page=calendar#workspace=' + key);
  await expect(partner.locator('.mv-app')).toBeVisible();
  await subscribed;
  const partnerRefresh = partner.waitForResponse(async response => response.url().includes('/api/operations?') && response.status() === 200 && (await response.json()).trips?.length === 2);
  await planner.getByRole('checkbox', { name: 'I reviewed the estimates and unresolved evidence.' }).check();
  await planner.getByRole('button', { name: 'Add this option to Calendar' }).click();
  await expect(page).toHaveURL(/page=calendar/);
  await partnerRefresh; await partner.close();
  const board = await (await page.request.get('/api/operations?workspaceKey=' + key)).json();
  expect(board.trips).toHaveLength(2); expect(board.visits).toHaveLength(2);
  expect(new Set(board.trips.map((trip: { trainerId: string }) => trip.trainerId)).size).toBe(2);
  expect(errors).toEqual([]);
});

async function savedAirJourney(page: Page) {
  const key = (await (await page.request.post('/api/demo/create', { data: {} })).json()).workspaceKey;
  const board = await (await page.request.get('/api/operations?workspaceKey=' + key)).json();
  const people = board.managers.filter((person: { baseState: string }) => person.baseState === 'FL');
  const partner = people.find((person: { name: string }) => person.name.includes('Casey'));
  expect((await page.request.put('/api/managers/' + partner.id + '?workspaceKey=' + key, { data: { ...partner, trainer: 'Morgan', expectedUpdatedAt: partner.updatedAt } })).status()).toBe(200);
  const start = nextFieldWeek().start, last = new Date(start + 'T12:00:00Z'); last.setUTCDate(last.getUTCDate() + 3);
  const end = last.toISOString().slice(0, 10);
  const flights = [
    { trainerId: 'trainer_a', carrier: 'AA', flightNumber: '100', origin: 'MIA', destination: 'MCO', departDate: start, departTime: '06:00', arriveDate: start, arriveTime: '07:00' },
    { trainerId: 'trainer_a', carrier: 'AA', flightNumber: '101', origin: 'MCO', destination: 'MIA', departDate: end, departTime: '19:00', arriveDate: end, arriveTime: '20:00' },
    { trainerId: 'trainer_b', carrier: 'AA', flightNumber: '200', origin: 'CLT', destination: 'MCO', departDate: start, departTime: '06:00', arriveDate: start, arriveTime: '07:30' },
    { trainerId: 'trainer_b', carrier: 'AA', flightNumber: '201', origin: 'MCO', destination: 'CLT', departDate: end, departTime: '19:00', arriveDate: end, arriveTime: '20:45' },
  ];
  const result = await page.request.post('/api/travel/scenarios?workspaceKey=' + key, { data: { managerIds: people.map((person: { id: string }) => person.id), trainerIds: ['trainer_a', 'trainer_b'], startDate: start, endDate: end, arrivalAirport: 'MCO', flights } });
  expect(result.status()).toBe(201); const report = await result.json();
  const option = report.scenarios.find((option: { feasible: boolean }) => option.feasible); expect(option).toBeTruthy();
  expect((await page.request.post('/api/travel/scenarios/' + report.id + '/approve?workspaceKey=' + key, { data: { scenarioId: option.id, acknowledgeGaps: true } })).status()).toBe(201);
  return { key, report, start, end, flights };
}

test('travel assistant explains a Thursday home deadline, reveals source age and preserves the workspace link', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const { key, report, end } = await savedAirJourney(page);
  const before = await (await page.request.get('/api/operations?workspaceKey=' + key)).json();
  await page.goto('/?page=plan&tool=travel#workspace=' + key);
  await page.getByRole('button', { name: 'Travel assistant', exact: true }).click();
  const assistant = page.getByRole('region', { name: 'Evidence-backed travel assistant' });
  await expect(assistant.getByLabel('Saved travel plan')).toHaveValue(report.id);
  await assistant.getByRole('button', { name: 'Calculate an evidence-backed answer' }).click();
  await expect(assistant.getByRole('heading', { name: 'Your supplied timings fit the deadline.' })).toBeVisible({ timeout: 20000 });
  await expect(assistant.getByText('Estimated home: ' + end + ' 21:45', { exact: false })).toBeVisible();
  await assistant.getByRole('button', { name: /Evidence \d+: Saved workspace/ }).first().click();
  await expect(assistant.locator('.travel-answer').getByText(/Retrieval: (Under a minute old|\d+ min old)/).first()).toBeVisible();
  expect(new URL(page.url()).hash).toBe('#workspace=' + key);
  const after = await (await page.request.get('/api/operations?workspaceKey=' + key)).json(); expect(after.visits).toEqual(before.visits);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await assistant.locator('summary').filter({ hasText: 'Evidence behind the answer' }).click();
  await page.screenshot({ path: join(tmpdir(), `field-atlas-${info.project.name}-travel-assistant.png`), fullPage: true, scale: 'css' });
  expect(errors).toEqual([]);
});

test('flight cancellation recovery reviews both trainers and applies a handoff with live calendar delivery', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const { key, report } = await savedAirJourney(page);
  await page.goto('/?page=plan&tool=travel#workspace=' + key);
  await page.getByRole('button', { name: 'Flight change', exact: true }).click();
  const recovery = page.getByRole('region', { name: 'Disruption recovery' });
  await expect(recovery.getByLabel('Saved travel plan')).toHaveValue(report.id);
  await expect(recovery.getByLabel('Original origin', { exact: true })).toHaveValue('MIA');
  await recovery.getByRole('combobox', { name: 'Reported change', exact: true }).selectOption('canceled');
  await recovery.getByRole('button', { name: 'Report change without editing Calendar' }).click();
  await expect(recovery.getByRole('button', { name: 'Build recovery options' })).toBeVisible();
  await recovery.getByRole('button', { name: 'Build recovery options' }).click();
  await expect(recovery.getByRole('heading', { name: 'What changes for both trainers' })).toBeVisible({ timeout: 20000 });
  await expect(recovery.getByRole('radio', { name: /Share the remaining visits/ })).toBeChecked();
  const apply = recovery.getByRole('button', { name: 'Apply reviewed calendar changes' }); await expect(apply).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: join(tmpdir(), `field-atlas-${info.project.name}-disruption-recovery.png`), fullPage: true, scale: 'css' });
  const partner = await page.context().newPage(); await partner.goto('/?page=calendar#workspace=' + key); await expect(partner.locator('.atlas-sync-live')).toHaveCount(1);
  const delivered = partner.waitForResponse(async response => response.url().includes('/api/operations?') && response.status() === 200 && (await response.json()).visits?.every((visit: { trainerId: string }) => visit.trainerId === 'trainer_b'));
  await recovery.getByRole('checkbox', { name: 'I reviewed the changes for both trainers and the unverified flight details.' }).check(); await apply.click();
  await expect(page).toHaveURL(/page=calendar/); await delivered; await partner.close();
  const after = await (await page.request.get('/api/operations?workspaceKey=' + key)).json(); expect(after.visits).toHaveLength(2); expect(after.visits.every((visit: { trainerId: string }) => visit.trainerId === 'trainer_b')).toBe(true);
  expect(errors).toEqual([]);
});

test('data connections display failed checks as unavailable and keep routing estimates provisional', async ({ page }, info) => {
  await page.goto('/?page=plan&tool=travel'); await page.getByRole('button', { name: 'Data connections', exact: true }).click();
  const connections = page.getByRole('region', { name: 'Travel data connections' });
  await expect(connections.getByRole('button', { name: 'Validate official sources and routing' })).toBeVisible();
  await page.route('**/api/travel/connections/check?*', async route => {
    const status = await (await page.request.get('/api/travel/connections?workspaceKey=' + new URL(page.url()).hash.slice('#workspace='.length))).json();
    const evidence = { id: 'browser-unavailable-fixture', provider: 'FAA NAS', subject: 'MCO', sourceUrl: 'https://nasstatus.faa.gov/api/airport-events', kind: 'observation', state: 'unavailable', retrievedAt: new Date().toISOString(), version: 'fixture', scope: 'Airport-wide notices only.', limitation: 'Provider unavailable; no current operational conclusion is available.' };
    await route.fulfill({ json: { ...status, results: [{ airport: 'MCO', checks: [{ evidence, data: null }] }], routingProbe: { roadBased: false, minutes: null, evidence: { ...evidence, id: 'browser-road-fixture', provider: 'Geographic fallback', kind: 'estimate', state: 'partial', limitation: 'A road-network route could not be validated.' } } } });
  });
  await connections.getByRole('button', { name: 'Validate official sources and routing' }).click();
  await expect(connections.getByText('unavailable', { exact: true })).toBeVisible();
  await expect(connections.getByText('A drivable road-network route was not validated. Geographic estimates are provisional.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: join(tmpdir(), `field-atlas-${info.project.name}-data-connections.png`), fullPage: true, scale: 'css' });
});

test('booked-flight readiness calculates connection margin, saves explicit checks and compares a revised confirmation', async ({ page }, info) => {
  const errors:string[]=[];page.on('pageerror',failure=>errors.push(failure.message));
  await page.goto('/?page=plan&tool=booked');
  const text='Flight AA 100\nDecember 7, 2026\nFrom: Miami (MIA) 6:00 AM\nTo: New York (JFK) December 7, 2026 9:00 AM\n\nFlight AA 101\nDecember 7, 2026\nFrom: New York (JFK) 10:30 AM\nTo: Boston (BOS) December 7, 2026 11:30 AM\nConfirmation: ABC123';
  await page.locator('#fg-email').fill(text);await page.getByRole('button',{name:'Extract flight details'}).click();
  const legs=page.locator('.fg-leg');await expect(legs).toHaveCount(2);
  for(const leg of await legs.all()){
    await leg.locator('summary').filter({hasText:'Time zones and connection requirements'}).click();
    await leg.getByLabel('Departure IANA time zone').fill('America/New_York');
    await leg.getByLabel('Arrival IANA time zone').fill('America/New_York');
  }
  await legs.nth(1).getByLabel('Gate-to-gate processing allowance (min)').fill('40');
  await legs.nth(1).getByLabel('Boarding cutoff before departure (min)').fill('20');
  await legs.nth(1).getByLabel('Ticket relationship').selectOption('same-ticket-reported');
  const readiness=page.getByRole('region',{name:'Journey readiness and remaining margin'});
  await expect(readiness.locator('.readiness-margin')).toHaveText('30 min');
  await expect(readiness.getByText('Exceeds margin').first()).toBeVisible();
  await page.getByRole('checkbox',{name:'I have checked these flight details against my airline itinerary.'}).check();
  await page.getByRole('checkbox',{name:/I checked that tickets were issued/}).check();
  await page.getByRole('button',{name:'Save locally',exact:true}).click();
  await expect(page.getByText('Flight saved on this device.',{exact:false})).toBeVisible();
  const stored=await page.evaluate(()=>localStorage.getItem('atlas-booked-flight-guardian-v1')||'');
  expect(stored).not.toContain('ABC123');expect(JSON.parse(stored).records[0].review.ticketingConfirmedAt).toBeTruthy();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await readiness.scrollIntoViewIfNeeded();
  await page.screenshot({path:join(tmpdir(),'field-atlas-'+info.project.name+'-readiness.png'),fullPage:false,scale:'css'});
  await page.getByRole('button',{name:'Update from a new confirmation'}).click();
  await page.locator('#fg-email').fill(text.replace('10:30 AM','11:00 AM'));
  await page.getByRole('button',{name:'Extract flight details'}).click();
  await expect(page.getByText('Changes from the saved itinerary')).toBeVisible();
  await expect(page.getByText('Leg 2 departTime: 10:30 → 11:00')).toBeVisible();
  await expect(page.getByRole('checkbox',{name:/I checked that tickets were issued/})).not.toBeChecked();
  expect(errors).toEqual([]);
});

test('shared readiness persists transport and equipment checks for both trainers without changing visits', async ({page},info)=>{
  const errors:string[]=[];page.on('pageerror',failure=>errors.push(failure.message));
  const {key,report}=await savedAirJourney(page);
  const before=await (await page.request.get('/api/operations?workspaceKey='+key)).json();
  await page.goto('/?page=plan&tool=travel#workspace='+key);
  await page.getByRole('button',{name:'Travel assistant',exact:true}).click();
  const assistant=page.getByRole('region',{name:'Evidence-backed travel assistant'});
  await expect(assistant.getByLabel('Saved travel plan')).toHaveValue(report.id);
  await assistant.locator('summary').filter({hasText:'Journey readiness & remaining margin'}).click();
  const readiness=assistant.getByRole('region',{name:'Journey readiness and remaining margin'});
  await expect(readiness.locator('.readiness-trainers>article')).toHaveCount(2);
  await assistant.locator('summary').filter({hasText:'Review transport, equipment and pickup deadlines'}).click();
  const fields=assistant.locator('.readiness-controls fieldset');
  await fields.nth(0).getByLabel('Ground transport access').selectOption('independent');
  await fields.nth(0).getByLabel('Training equipment access').selectOption('ready');
  await fields.nth(1).getByLabel('Ground transport access').selectOption('shared-needs-review');
  await fields.nth(1).getByLabel('Training equipment access').selectOption('ready');
  await assistant.getByRole('button',{name:'Save reviewed journey requirements'}).click();
  await expect(readiness.locator('.readiness-verdict')).toHaveText('attention');
  const after=await (await page.request.get('/api/operations?workspaceKey='+key)).json();
  expect(after.visits).toEqual(before.visits);
  const persisted=await (await page.request.get('/api/travel/journeys/'+report.id+'/readiness?workspaceKey='+key)).json();
  expect(persisted.requirements.trainers[1].transport).toBe('shared-needs-review');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await readiness.scrollIntoViewIfNeeded();
  await page.screenshot({path:join(tmpdir(),'field-atlas-'+info.project.name+'-shared-readiness.png'),fullPage:false,scale:'css'});
  expect(errors).toEqual([]);
});
