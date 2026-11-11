import { test, expect, type Page } from '@playwright/test';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

test.beforeEach(async ({ context, baseURL }) => {
  // Exercise the bundled-map fallback deterministically, without third-party uptime.
  await context.route('**/*', route => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort());
  await context.addInitScript(() => localStorage.setItem('field-atlas-map-source-v9', 'outline'));
  // Backend adapter contracts are tested separately. Browser fixtures exercise
  // unavailable products without depending on third-party weather uptime.
  await context.route('**/api/travel/airports/*/brief*', route => route.fulfill({ json: {
    airport: { iata: new URL(route.request().url()).pathname.split('/').at(-2), name: 'Fixture airport' },
    checkedAt: new Date().toISOString(), products: [],
  } }));
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
  const setup = page.getByRole('region', { name: 'Workspace setup' });
  if (info.project.name === 'mobile') await setup.getByTestId('setup-open').click();
  else await page.getByRole('button', { name: 'Set up workspace', exact: true }).click();
  await expect(setup.getByText('0 of 3 setup steps complete')).toBeVisible();
  await setup.getByRole('button', { name: 'Set trainer profiles' }).click();
  await expect(page.getByRole('dialog', { name: 'Manage the two field sales trainers' })).toBeVisible();
  await page.getByRole('button', { name: 'Close trainer settings' }).click();
  await setup.getByRole('button', { name: 'Set up workspace', exact: true }).click();
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
  await expect(mapKey).toContainText('Location only—not territory or flight status');
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
  await expect(page.getByRole('combobox', { name: 'Search this map for a state, manager or airport' })).toBeVisible();
  await expect(page.locator('.fsa-map-heading')).toBeVisible();
  await expect(page.locator('.fsa-map-heading-text')).toHaveCount(0);
  await expectMapProminentAndUsable(true);
  expect(await page.evaluate(() => localStorage.getItem('field-atlas-map-welcome-v1'))).toBe('seen');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.getByRole('button', { name: 'Travel', exact: true }).filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/page=plan/);
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
    const focusMap = page.getByRole('button', { name: 'Focus map', exact: true });
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
  const checkedAt = new Date().toISOString();
  await page.route('**/api/travel/airports/YYZ/brief*', route => route.fulfill({ json: {
    airport: { iata: 'YYZ', icao: 'CYYZ', name: 'Toronto fixture', country: 'CA' }, checkedAt,
    products: [{ data: [{ title: 'Tonight', detail: 'Toronto regional forecast detail.' }], evidence: {
      id: 'advanced-canadian-forecast', provider: 'ECCC City Page Weather', subject: 'Toronto region', sourceUrl: 'https://api.weather.gc.ca/',
      kind: 'forecast', state: 'current', retrievedAt: checkedAt, observedAt: checkedAt, expiresAt: new Date(Date.now() + 300000).toISOString(),
      version: 'fixture', scope: 'Regional forecast.', limitation: 'No exact validity timestamps; trip-window coverage is unknown.',
    } }],
  } }));
  await advanced.getByRole('button', { name: 'Find another airport or enter a code' }).click();
  await advanced.getByPlaceholder('Known IATA code').fill('YYZ');
  await advanced.getByRole('button', { name: 'Use code', exact: true }).click();
  const weather = advanced.locator('.fsa-destination-weather');
  await weather.getByRole('button', { name: 'Check current weather and seven-day outlook' }).click();
  await weather.getByText('Read published regional forecast', { exact: true }).click();
  await expect(weather).toContainText('Toronto regional forecast detail.');
  await expect(weather).toContainText('trip-window coverage is unknown');
  await weather.getByText('Weather source evidence, age and limitations', { exact: true }).click();
  await expect(weather).toContainText('ECCC City Page Weather');
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
  await expect(connections.locator('[data-travel-evidence-id="browser-unavailable-fixture"]').getByText('unavailable', { exact: true })).toBeVisible();
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

test('flight intelligence displays source age and stops using expired station evidence', async ({ page }) => {
  const now = Date.now();
  await page.clock.install({ time: now });
  await page.goto('/?page=plan&tool=radar');
  const evidence = (provider: string, subject: string, id: string) => ({ id, provider, subject, sourceUrl: 'https://aviationweather.gov/', kind: 'observation', state: 'current', retrievedAt: new Date(now).toISOString(), observedAt: new Date(now).toISOString(), expiresAt: new Date(now + 30000).toISOString(), version: 'fixture', scope: 'Fixture station observation', limitation: 'Fixture evidence is not airline status.' });
  await page.route('**/api/travel/disruptions?*', route => route.fulfill({ json: { available: true, checkedAt: new Date(now).toISOString(), airports: [{ code: 'MCO', level: 'critical', headline: 'Fixture ground stop', events: [], evidence: { ...evidence('FAA NAS', 'MCO', 'fixture-faa'), sourceUrl: 'https://nasstatus.faa.gov/' } }] } }));
  await page.route('**/api/travel/airports/*/brief*', route => {
    const code = new URL(route.request().url()).pathname.split('/').at(-2)!;
    return route.fulfill({ json: { airport: { iata: code, icao: 'K' + code }, checkedAt: new Date(now).toISOString(), products: [
      { evidence: evidence('NOAA Aviation Weather', 'K' + code, 'fixture-' + code), data: [{ title: 'IFR', detail: 'METAR fixture', observation: { windKnots: 5, visibility: '3', temperatureC: 20 } }] },
    ] } });
  });
  await page.route('**/api/travel/weather-alerts?*', route => route.fulfill({ json: { available: false, alerts: [], message: 'No validated alert timestamp' } }));
  await page.route('**/api/travel/point-forecast?*', route => route.fulfill({ json: { available: false, periods: [], message: 'No forecast fixture' } }));
  await page.route('**/api/travel/flight-history?*', route => route.fulfill({ json: { available: false, checkedAt: new Date(now).toISOString(), source: 'Fixture', sourceUrl: '', attribution: 'Fixture', license: '', period: null, sources: [], legs: [], alternatePaths: [], alternateArrival: null, selectedMonth: '', monthly: [], notes: [] } }));
  await page.getByRole('combobox', { name: 'Departure IATA airport code' }).fill('MCO');
  await page.getByRole('combobox', { name: 'Arrival IATA airport code' }).fill('ATL');
  await page.getByRole('button', { name: 'Analyze flight', exact: true }).click();
  await page.getByRole('navigation', { name: 'Flight intelligence tools' }).getByRole('button', { name: 'Weather risk', exact: true }).click();
  const operations = page.locator('#atlas-airport-operations');
  await expect(operations.getByText('IFR · 5 kt sustained', { exact: true }).first()).toBeVisible();
  await page.getByText('How this evidence affects your trip', { exact: true }).click();
  await expect(page.getByRole('region', { name: 'Combined flight decision intelligence' }).getByText('FAA restriction at MCO', { exact: true })).toBeVisible();
  const source = operations.locator('.travel-evidence-grid').first();
  await expect(source).toContainText('Under a minute old');
  await page.clock.fastForward(61000);
  await expect(operations.getByText('IFR · 5 kt sustained', { exact: true })).toHaveCount(0);
  await expect(source.locator('.journey-state')).toHaveText(['stale']);
  await page.getByRole('navigation', { name: 'Flight intelligence tools' }).getByRole('button', { name: 'Airport pressure', exact: true }).click();
  await expect(operations.getByText('Fixture ground stop', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Combined flight decision intelligence' }).getByText('FAA restriction at MCO', { exact: true })).toHaveCount(0);
});

test('Canadian weather and official BTS remain usable when independent history fails', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const now = Date.now(), checkedAt = new Date(now).toISOString();
  const evidence = (provider: string, id: string, kind = 'observation') => ({ id, provider, subject: 'YYZ regional fixture', sourceUrl: 'https://api.weather.gc.ca/', kind, state: 'current', retrievedAt: checkedAt, observedAt: checkedAt, expiresAt: new Date(now + 300000).toISOString(), version: 'fixture', scope: 'Regional coverage only.', limitation: 'Regional forecast has no exact validity timestamps; airport and flight impacts are unverified.' });
  await page.route('**/api/travel/airports/*/brief*', route => {
    const code = new URL(route.request().url()).pathname.split('/').at(-2)!;
    return route.fulfill({ json: { airport: { iata: code, country: code === 'YYZ' ? 'CA' : 'US', name: code + ' fixture' }, checkedAt,
      products: code === 'YYZ' ? [
        { evidence: evidence('ECCC GeoMet', 'ca-observation'), data: [{ title: 'Toronto surface station', detail: 'Published surface observation.' }] },
        { evidence: evidence('ECCC City Page Weather', 'ca-forecast', 'forecast'), data: [{ title: 'Tonight', detail: 'Snow showers in the Toronto regional forecast.' }] },
        { evidence: evidence('ECCC Weather Alerts', 'ca-warning'), data: [{ title: 'Snow warning — Toronto', detail: 'Regional snow warning; check the official polygon.', validFrom: checkedAt, validTo: new Date(now + 300000).toISOString() }] },
      ] : [] } });
  });
  await page.route('**/api/travel/disruptions?*', route => route.fulfill({ json: { available: false, checkedAt, airports: [] } }));
  await page.route('**/api/travel/live-aircraft?*', route => route.abort('failed'));
  await page.route('**/api/travel/flight-history?*', route => route.abort('failed'));
  await page.route('**/api/travel/history?*', route => {
    const params = new URL(route.request().url()).searchParams;
    const domestic = params.get('origin') !== 'YYZ' && params.get('destination') !== 'YYZ';
    return route.fulfill({ json: { state: domestic ? 'historical' : 'unavailable', coverage: { state: 'historical', periods: [{ period: '2026-08', sourceUrl: 'https://www.transtats.bts.gov/' }], limitation: 'Fixture U.S. domestic records only.' },
      evidence: { ...evidence('U.S. DOT / BTS', 'official-fixture', 'historical'), state: 'reference', sourceUrl: 'https://www.transtats.bts.gov/', subject: params.get('origin') + ' → ' + params.get('destination'), observedAt: undefined, scope: 'Reporting months: 2026-08', limitation: 'Historical outcomes do not predict this flight.' },
      summary: { origin: params.get('origin'), destination: params.get('destination'), sampleSize: domestic ? 40 : 0, outcomeSampleSize: domestic ? 40 : 0, cancellationSampleSize: domestic ? 40 : 0, onTimeRate: domestic ? .8 : null, cancellationRate: domestic ? .025 : null, p90ArrivalDelayMinutes: domestic ? 42 : null, definition: 'Rates require at least 30 eligible observations.' } } });
  });
  await page.goto('/?page=plan&tool=radar');
  await expect(page).toHaveTitle(/Field Sales Atlas/);
  await page.getByRole('combobox', { name: 'Departure IATA airport code' }).fill('');
  await page.getByRole('combobox', { name: 'Arrival IATA airport code' }).fill('');
  await page.getByRole('button', { name: 'Analyze flight', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Departure IATA airport code' })).toBeFocused();
  await expect(page.getByRole('alert')).toContainText('Enter a three-letter departure and arrival airport code');
  await page.getByRole('combobox', { name: 'Departure IATA airport code' }).fill('YYZ');
  await page.getByRole('combobox', { name: 'Arrival IATA airport code' }).fill('MCO');
  await page.getByRole('button', { name: 'Analyze flight', exact: true }).click();
  await expect(page.locator('.fi-tool-weather')).toContainText('Snow warning — Toronto');
  await page.getByRole('navigation', { name: 'Flight intelligence tools' }).getByRole('button', { name: 'Weather risk', exact: true }).click();
  const regional = page.getByRole('region', { name: 'Canadian regional weather' });
  await expect(page.getByRole('heading', { name: 'YYZ fixture', exact: true })).toBeVisible();
  await expect(regional).toContainText('ECCC Weather Alerts');
  await expect(regional).toContainText('Snow warning — Toronto');
  await regional.getByText('Read published regional forecast', { exact: true }).click();
  await expect(regional).toContainText('Snow showers in the Toronto regional forecast.');
  await expect(regional).toContainText('no exact validity timestamps');
  await regional.screenshot({ path: join(tmpdir(), `field-atlas-${info.project.name}-canadian-weather-detail.png`), scale: 'css' });
  await page.getByRole('navigation', { name: 'Flight intelligence tools' }).getByRole('button', { name: 'Flight DNA', exact: true }).click();
  const official = page.getByRole('region', { name: 'Official BTS route history' });
  await expect(official).toContainText('Insufficient evidence');
  await page.screenshot({ path: join(tmpdir(), `field-atlas-${info.project.name}-canadian-weather.png`), fullPage: true, scale: 'css' });
  await page.getByRole('combobox', { name: 'Departure IATA airport code' }).fill('MCO');
  await page.getByRole('combobox', { name: 'Arrival IATA airport code' }).fill('ATL');
  await page.getByRole('button', { name: 'Analyze flight', exact: true }).click();
  await expect(page.locator('.fi-tool-dna')).toContainText('80% observed on-time · BTS');
  await expect(page.locator('.fi-tool-dna')).toContainText('40 official records');
  await expect(official).toContainText('40 eligible arrival outcomes');
  await expect(official).toContainText('2.5%');
  await expect(official).toContainText('2026-08');
  await official.getByText('Official history source, age and limitations', { exact: true }).click();
  await expect(official).toContainText('Historical outcomes do not predict this flight.');
  const originalViewport = page.viewportSize()!;
  for (const viewport of [originalViewport, { width: 1280, height: 600 }, { width: 844, height: 390 }, { width: 390, height: 664 }]) {
    await page.setViewportSize(viewport);
    for (const selector of ['.fr-page', '#atlas-flight-dna', '.fd-official-history', '.fd-official-history .travel-evidence-grid']) {
      const bounds = await page.locator(selector).boundingBox();
      expect(bounds, selector + ' has visible bounds').not.toBeNull();
      expect(bounds!.x, selector + ' starts within the viewport').toBeGreaterThanOrEqual(-1);
      expect(bounds!.x + bounds!.width, selector + ' fits without clipping at ' + viewport.width).toBeLessThanOrEqual(viewport.width + 1);
    }
  }
  await page.setViewportSize(originalViewport);
  await official.screenshot({ path: join(tmpdir(), `field-atlas-${info.project.name}-official-history-detail.png`), scale: 'css' });
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: join(tmpdir(), `field-atlas-${info.project.name}-data-wiring.png`), fullPage: true, scale: 'css' });
  await page.getByRole('combobox', { name: 'Arrival IATA airport code' }).fill('DFW');
  await expect(official).toHaveCount(0);
});

test('Flight DNA explains required airports instead of disabling Analyze', async ({ page }) => {
  await page.goto('/?page=plan&tool=radar');
  const origin=page.getByRole('combobox',{name:'Departure IATA airport code'});
  const destination=page.getByRole('combobox',{name:'Arrival IATA airport code'});
  const analyze=page.getByRole('button',{name:'Analyze flight',exact:true});

  await expect(origin).toHaveValue('');
  await expect(destination).toHaveValue('');
  await expect(analyze).toBeEnabled();
  await analyze.click();
  await expect(page.getByRole('alert')).toContainText(
    'Enter a three-letter departure and arrival airport code',
  );
  await expect(origin).toBeFocused();

  await origin.fill('MCO');
  await destination.fill('ATL');
  await expect(analyze).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('Flight DNA makes route history, sample size and reporting cutoff visible after analysis', async ({ page }) => {
  const checkedAt = new Date().toISOString();
  await page.goto('/?page=plan&tool=radar');
  await page.route('**/api/travel/disruptions?*', route => route.fulfill({
    json: { available: false, checkedAt, airports: [], message: 'No current FAA entries.' },
  }));
  await page.route('**/api/travel/aviation/*', route => route.fulfill({
    json: { available: false, checkedAt, message: 'No validated station report.', observation: null, forecast: null, evidence: [] },
  }));
  await page.route('**/api/travel/weather-alerts?*', route => route.fulfill({
    json: { available: false, checkedAt, alerts: [], message: 'No active alerts.' },
  }));
  await page.route('**/api/travel/point-forecast?*', route => route.fulfill({
    json: { available: false, checkedAt, periods: [], message: 'Forecast unavailable.' },
  }));
  await page.route('**/api/travel/flight-history?*', route => route.fulfill({
    json: {
      available: true, checkedAt, source: 'Fixture', sourceUrl: '', attribution: 'Fixture',
      license: 'CC BY 4.0', period: null,
      sources: [{ name: 'routes', available: true, records: 314, periodEnd: '2026-08-31' }],
      legs: [{
        origin: 'MCO', destination: 'ATL',
        match: {
          basis: 'route', label: 'MCO → ATL', origin: 'MCO', destination: 'ATL',
          carrier: '', flightNumber: '', flights: 27428, onTimePct: 84.2,
          cancelPct: 0.9, severePct: 4.1, avgArrivalDelay: 6.2,
          medianArrivalDelay: -5, departureOnTimePct: 85.1,
          periodStart: '2023-07-01', periodEnd: '2026-08-31',
        },
        route: null, airportBaseline: null, note: 'Fixture route history.',
      }],
      alternatePaths: [], alternateArrival: null, selectedMonth: '2026-11', monthly: [], notes: [],
    },
  }));
  await page.getByRole('combobox', { name: 'Departure IATA airport code' }).fill('MCO');
  await page.getByRole('combobox', { name: 'Arrival IATA airport code' }).fill('ATL');
  await page.getByRole('button', { name: 'Analyze flight', exact: true }).click();
  const dnaCard=page.locator('.fi-tool-dna');
  await expect(dnaCard).toBeVisible();
  await expect(dnaCard).toContainText('84.2% arrived under 15 min late');
  // The detailed report is visible automatically; no disclosure or card click.
  const report = page.getByRole('region', { name: 'Flight DNA historical intelligence' });
  await expect(report).toContainText('27,428 historical flights');
  await expect(report).toContainText('0.90%');
  await expect(report).toContainText('4.1%');
  await expect(report).toContainText('2023-07-01 to 2026-08-31');
  await expect(page.getByRole('region', { name: 'Flight DNA historical intelligence' })).toBeVisible();
  await expect(page.locator('.fd-results')).toContainText('27,428 historical flights');
});

test('Flight DNA reports independent feed failures beside the visible source results', async ({ page }) => {
  const checkedAt = new Date().toISOString();
  await page.goto('/?page=plan&tool=radar');
  await page.route('**/api/travel/disruptions?*', route => route.fulfill({
    json: { available: false, checkedAt, airports: [] },
  }));
  await page.route('**/api/travel/aviation/*', route => route.fulfill({
    json: { available: false, checkedAt, observation: null, forecast: null, evidence: [] },
  }));
  await page.route('**/api/travel/weather-alerts?*', route => route.fulfill({
    json: { available: false, checkedAt, alerts: [], message: 'No active alerts.' },
  }));
  await page.route('**/api/travel/point-forecast?*', route => route.fulfill({
    json: { available: false, checkedAt, periods: [], message: 'Forecast unavailable.' },
  }));
  await page.route('**/api/travel/flight-history?*', route => route.abort('failed'));
  await page.getByRole('combobox', { name: 'Departure IATA airport code' }).fill('MCO');
  await page.getByRole('combobox', { name: 'Arrival IATA airport code' }).fill('ATL');
  await page.getByRole('button', { name: 'Analyze flight', exact: true }).click();
  const dnaCard=page.locator('.fi-tool-dna');
  await expect(dnaCard).toBeVisible();
  await expect(dnaCard).toContainText('Independent feed unavailable');
  await expect(page.getByRole('region', { name: 'Flight DNA historical intelligence' })).toContainText('Independent historical data could not be loaded');
});

test('live ADS-B observations stay separate from airline flight status', async ({ page }) => {
  await page.goto('/?page=plan&tool=radar');
  let liveRequests = 0;
  const checkedAt = new Date().toISOString();
  await page.route('**/api/travel/disruptions?*', route => route.fulfill({
    json: { available: false, checkedAt, airports: [], message: 'No current FAA entries.' },
  }));
  await page.route('**/api/travel/aviation/*', route => route.fulfill({
    json: { available: false, checkedAt, message: 'Fixture observation unavailable.', observation: null, forecast: null, evidence: [] },
  }));
  await page.route('**/api/travel/weather-alerts?*', route => route.fulfill({
    json: { available: false, checkedAt, alerts: [], message: 'Fixture alerts unavailable.' },
  }));
  await page.route('**/api/travel/point-forecast?*', route => route.fulfill({
    json: { available: false, checkedAt, periods: [], message: 'Fixture forecast unavailable.' },
  }));
  await page.route('**/api/travel/flight-history?*', route => route.fulfill({
    json: { available: true, checkedAt, source: 'Fixture', sourceUrl: '', attribution: 'Fixture', license: '',
      period: { start: '2026-01-01', end: '2026-08-31' }, sources: [], legs: [], alternatePaths: [],
      alternateArrival: null, selectedMonth: '2026-11', monthly: [], notes: [] },
  }));
  await page.route('**/api/travel/live-aircraft?*', route => {
    liveRequests++;
    return route.fulfill({ json: {
      airport: 'MCO', airportName: 'Orlando International Airport', latitude: 28.4294,
      longitude: -81.309, radiusNm: 25, available: true, checkedAt, source: 'adsb.lol',
      sourceUrl: 'https://adsb.lol/docs/open-data/api', license: 'Open Database License (ODbL)',
      attribution: 'Aircraft observations from the adsb.lol community network.',
      message: '', evidence: { state: 'current', retrievedAt: checkedAt, observedAt: checkedAt,
        limitation: 'Observed aircraft positions only.' },
      aircraft: [{ hex: 'A1B2C3', callsign: 'DAL123', registration: 'N123AA',
        aircraftType: 'B738', lat: 28.42, lon: -81.3, altitudeFt: 12000,
        onGround: false, groundSpeedKnots: 250, trackDegrees: 120,
        lastPositionSeconds: 1, distanceNm: 1 }],
    }});
  });
  await page.getByRole('combobox', { name: 'Departure IATA airport code' }).fill('MCO');
  await page.getByRole('combobox', { name: 'Arrival IATA airport code' }).fill('ATL');
  await page.getByRole('button', { name: 'Analyze flight', exact: true }).click();
  expect(liveRequests).toBe(0);
  await page.getByRole('navigation', { name: 'Flight intelligence tools' }).getByRole('button', { name: 'Aircraft nearby', exact: true }).click();
  const panel = page.getByTestId('observed-aircraft-panel');
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId('text-aircraft-disclaimer')).toContainText('cannot confirm a particular flight’s status');
  await expect(panel.getByTestId('status-aircraft-observations')).toHaveText('Observations available');
  await expect(panel.getByTestId('aircraft-evidence-meta')).toContainText('adsb.lol');
  await expect(panel.getByTestId('list-aircraft-observations')).toContainText('DAL123');
  expect(liveRequests).toBe(1);
  await panel.getByTestId('button-fetch-aircraft').click();
  await expect(panel.getByTestId('status-aircraft-observations')).toHaveText('Observations available');
  await expect(panel.getByTestId('aircraft-evidence-meta')).toContainText('adsb.lol');
  await expect(panel.getByTestId('plot-aircraft-observations')).toBeVisible();
  await expect(panel.getByTestId('text-aircraft-attribution')).toContainText('ODbL');
  await page.waitForTimeout(1200);
  expect(liveRequests).toBe(2);
});

test('a failed page module keeps Atlas recovery navigation and saved workspace records available', async ({ page }) => {
  await page.route('**/assets/FlightRadar-*.js', route => route.fulfill({
    contentType: 'application/javascript', body: "throw new Error('Fixture page module failure'); export default function FailedPage() {}"
  }));
  await page.goto('/?page=plan&tool=radar');
  const failure = page.getByRole('alert').filter({ has: page.getByRole('heading', { name: /This page couldn.t be displayed/ }) });
  await expect(failure).toBeVisible();
  await expect(page).toHaveURL(/#workspace=[0-9a-f]{64}/);
  const key = new URL(page.url()).hash.slice('#workspace='.length);
  const before = await (await page.request.get('/api/operations?workspaceKey=' + key)).json();
  await failure.getByRole('button', { name: 'Return to Atlas', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Search this map for a state, manager or airport' })).toBeVisible();
  await expect(failure).toHaveCount(0);
  expect(new URL(page.url()).hash).toBe('#workspace=' + key);
  const after = await (await page.request.get('/api/operations?workspaceKey=' + key)).json();
  expect(after.managers).toEqual(before.managers);
  expect(after.visits).toEqual(before.visits);
  expect(after.trips).toEqual(before.trips);
});

async function flightWorkspaceFixture(page: Page, basis: 'route' | 'airport' = 'route') {
  const checkedAt = new Date().toISOString();
  await page.route('**/api/travel/disruptions?*', route => route.fulfill({ json: { available: false, checkedAt, airports: [], message: 'FAA coverage unknown for these airports.' } }));
  await page.route('**/api/travel/history?*', route => route.fulfill({ json: {
    state: 'unavailable', coverage: { periods: [] }, summary: null,
    evidence: { id: 'official-empty', provider: 'U.S. DOT / BTS', subject: 'Fixture route', sourceUrl: 'https://www.transtats.bts.gov/', kind: 'historical', state: 'unavailable', retrievedAt: '', version: 'fixture', scope: 'No installed records.', limitation: 'No official reliability rate assigned.' },
  } }));
  await page.route('**/api/travel/flight-history?*', route => {
    const params = new URL(route.request().url()).searchParams;
    const origin = params.get('origin')!, destination = params.get('destination')!;
    const metric = { basis, label: basis === 'airport' ? origin + ' airport network' : origin + ' → ' + destination, origin, destination, carrier: '', flightNumber: '', flights: 120,
      onTimePct: 81.5, cancelPct: 1.2, severePct: 5.3, avgArrivalDelay: 7, medianArrivalDelay: -2, departureOnTimePct: 80,
      periodStart: '2026-01-01', periodEnd: '2026-08-31' };
    return route.fulfill({ json: { available: true, checkedAt, source: 'Fixture aggregate', sourceUrl: 'https://flyerintel.com/data/', attribution: 'Fixture', license: 'CC BY 4.0',
      period: { start: '2026-01-01', end: '2026-08-31' }, sources: [{ name: 'routes', available: true, records: 120, periodEnd: '2026-08-31' }],
      legs: [{ origin, destination, match: metric, route: null, airportBaseline: null, note: basis === 'airport' ? 'Airport baseline only; this route is not covered.' : 'Directional route fixture.' }],
      alternatePaths: [{ connection: 'CLT', legs: [{ ...metric, destination: 'CLT' }, { ...metric, origin: 'CLT' }], index: 6.5, description: 'Historical corridor only' }],
      alternateArrival: null, selectedMonth: '2026-11', monthly: [], notes: [] } });
  });
}

test('intelligence toolkit is upfront and every tool opens a distinct usable view', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await flightWorkspaceFixture(page);
  await page.goto('/?page=plan&tool=radar');
  const tools = page.getByRole('navigation', { name: 'Flight intelligence tools' });
  const composer = page.getByRole('region', { name: 'Flight research route and date' });
  await expect(page.getByRole('region', { name: 'Flight DNA historical intelligence' })).toBeVisible();
  await expect(page).toHaveURL(/#workspace=[0-9a-f]{64}/);
  const workspaceHash = new URL(page.url()).hash;
  expect((await tools.boundingBox())!.y).toBeLessThan((await composer.boundingBox())!.y);
  for (const name of ['Flight DNA', 'Airport pressure', 'Weather risk', 'Connection survival', 'Security & airport', 'Alternatives']) {
    const tool = tools.getByRole('button', { name, exact: true });
    await expect(tool).toBeVisible();
    const bounds = (await tool.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  }
  expect(await page.locator('.fi-tool-grid').evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await page.getByRole('combobox', { name: 'Departure IATA airport code' }).fill('MCO');
  await page.getByRole('combobox', { name: 'Arrival IATA airport code' }).fill('ATL');
  await page.getByRole('button', { name: 'Analyze flight', exact: true }).click();
  const dna = page.getByRole('region', { name: 'Flight DNA historical intelligence' });
  await expect(dna).toContainText('120 historical flights');
  await expect(dna).toContainText('81.5%');
  await expect(page.getByText('FAA coverage unknown for these airports.', { exact: true })).toHaveCount(0);
  await expect(page.getByTestId('observed-aircraft-panel')).toHaveCount(0);
  await page.screenshot({ path: join(tmpdir(), `field-atlas-${info.project.name}-intelligence-workspace.png`), fullPage: true });
  await tools.getByRole('button', { name: 'Airport pressure', exact: true }).click();
  await expect(page).toHaveURL(/intel=pressure/);
  await expect(page.getByRole('heading', { name: 'Airport pressure', exact: true })).toBeVisible();
  await expect(page.getByText('FAA coverage unknown for these airports.', { exact: true })).toBeVisible();
  await expect(page.locator('#atlas-airport-operations')).not.toContainText('NOAA station weather');
  await expect(page.getByRole('region', { name: 'Flight intelligence results' })).toBeFocused();
  await tools.getByRole('button', { name: 'Weather risk', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/intel=weather/);
  await expect(page.getByRole('heading', { name: 'Weather risk', exact: true })).toBeVisible();
  await expect(page.locator('#atlas-airport-operations')).not.toContainText('FAA airport events');
  await tools.getByRole('button', { name: 'Alternatives', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Alternative route research' })).toContainText('MCO → CLT → ATL');
  await expect(page.getByRole('region', { name: 'Official BTS route history' })).toBeHidden();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Weather risk', exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('region', { name: 'Alternative route research' })).toBeVisible();
  await tools.getByRole('button', { name: 'Security & airport', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Airport checkpoint intelligence' })).toBeVisible();
  await tools.getByRole('button', { name: 'Route & airport map', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Route & airport map', exact: true })).toBeVisible();
  await tools.getByRole('button', { name: 'Flight DNA', exact: true }).click();
  await expect(dna).toContainText('120 historical flights');
  expect(new URL(page.url()).hash).toBe(workspaceHash);
  await page.getByRole('combobox', { name: 'Arrival IATA airport code' }).fill('BOS');
  await expect(dna.locator('.fd-results')).toHaveCount(0);
  await expect(page.locator('.fi-tool-dna')).not.toContainText('81.5%');
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('connection tool edits the shared route and computes explicit transfer scenarios', async ({ page }) => {
  await flightWorkspaceFixture(page);
  await page.goto('/?page=plan&tool=radar&intel=connection');
  const tools = page.getByRole('navigation', { name: 'Flight intelligence tools' });
  const connection = page.getByRole('region', { name: 'Connection survival scenarios' });
  await expect(connection).toContainText('Atlas will not guess either value');
  await connection.getByRole('button', { name: 'Add connecting airport & layover', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Connecting IATA airport code' })).toBeFocused();
  await page.getByRole('combobox', { name: 'Departure IATA airport code' }).fill('MCO');
  await page.getByRole('combobox', { name: 'Arrival IATA airport code' }).fill('ATL');
  await page.getByRole('combobox', { name: 'Connecting IATA airport code' }).fill('CLT');
  await page.getByRole('spinbutton', { name: 'Connection time in minutes' }).fill('90');
  await expect(connection).toContainText('45 min spare');
  await expect(connection).toContainText('15 min short');
  await connection.getByRole('combobox', { name: 'Gate-transfer allowance' }).selectOption('60');
  await expect(connection).toContainText('30 min short');
  await expect(connection).toContainText('not a missed-connection probability');
  await tools.getByRole('button', { name: 'Alternatives', exact: true }).click();
  await page.getByRole('button', { name: 'Add an alternative arrival airport', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Alternative IATA airport code' })).toBeFocused();
});

test('Flight DNA isolates incomplete API responses and can retry without losing the workspace', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await flightWorkspaceFixture(page);
  await page.route('**/api/travel/history?*', route => route.fulfill({ json: { coverage: { periods: [] }, summary: null, state: 'unavailable' } }));
  await page.route('**/api/travel/flight-history?*', route => route.fulfill({ json: { available: true, legs: null } }));
  await page.goto('/?page=plan&tool=radar');
  await page.getByRole('combobox', { name: 'Departure IATA airport code' }).fill('MCO');
  await page.getByRole('combobox', { name: 'Arrival IATA airport code' }).fill('ATL');
  await page.getByRole('button', { name: 'Analyze flight', exact: true }).click();
  const dna = page.getByRole('region', { name: 'Flight DNA historical intelligence' });
  await expect(dna).toContainText('official-history response is incomplete or incompatible');
  await expect(dna).toContainText('Independent historical data could not be loaded');
  await expect(page.getByRole('heading', { name: 'This page couldn’t be displayed.' })).toHaveCount(0);
  await flightWorkspaceFixture(page);
  await dna.getByRole('button', { name: 'Analyze historical flights', exact: true }).click();
  await expect(dna).toContainText('120 historical flights');
  await expect(dna).not.toContainText('incomplete or incompatible');
  await expect(dna).not.toContainText('Independent historical data could not be loaded');
  expect(errors).toEqual([]);
});

test('security research preserves the actual departure airport and travel date', async ({ page }) => {
  await page.goto('/?page=plan&tool=radar');
  await page.getByRole('combobox', { name: 'Departure IATA airport code' }).fill('YYZ');
  await page.getByRole('combobox', { name: 'Arrival IATA airport code' }).fill('MCO');
  await page.getByLabel('Travel date for planning and historical context').fill('2026-12-03');
  await page.getByRole('navigation', { name: 'Flight intelligence tools' }).getByRole('button', { name: 'Security & airport', exact: true }).click();
  const security = page.getByRole('region', { name: 'Airport checkpoint intelligence' });
  await expect(security.getByRole('combobox', { name: 'Airport', exact: true })).toHaveValue('YYZ');
  await expect(security.getByLabel('Airport local date (selects historical weekday)', { exact: true })).toHaveValue('2026-12-03');
  await expect(security).toContainText("Archive coverage for your route's departure airport YYZ is unverified");
  await security.getByRole('button', { name: 'Analyze checkpoint history', exact: true }).click();
  await expect(security).toContainText('No usable checkpoint history returned for YYZ');
  await expect(security).toContainText('not an estimate of zero minutes');
});

test('Flight DNA labels airport fallback rates without implying matched route history', async ({ page }) => {
  await flightWorkspaceFixture(page, 'airport');
  await page.goto('/?page=plan&tool=radar');
  await page.getByRole('combobox', { name: 'Departure IATA airport code' }).fill('MCO');
  await page.getByRole('combobox', { name: 'Arrival IATA airport code' }).fill('ATL');
  await page.getByRole('button', { name: 'Analyze flight', exact: true }).click();
  const card = page.locator('.fi-tool-dna');
  await expect(card).toContainText('81.5% airport-wide baseline');
  await expect(card.locator('small')).toBeVisible();
  await expect(card).toContainText('airport baseline, not this route');
  const report = page.getByRole('region', { name: 'Flight DNA historical intelligence' });
  await expect(report).toContainText('AIRPORT-LEVEL FALLBACK');
  await expect(report).toContainText('Airport baseline only; this route is not covered.');
});
