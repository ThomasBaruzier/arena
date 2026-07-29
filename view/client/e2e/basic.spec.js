import { expect, test } from '@playwright/test';

const GENERATION = 'viewer-1';

const game = (overrides = {}) => ({
  id: 100,
  run_id: 'run1',
  group_id: 'run1_1',
  board_size: 20,
  moves: '10,10,1;11,11,2',
  black_slot: 1,
  white_slot: 2,
  black_name: 'BotA',
  white_name: 'BotB',
  black_ver: '1.0',
  white_ver: '2.0',
  winner_color: 0,
  timestamp: '2024-01-01T12:00:00Z',
  ...overrides
});

const run = (overrides = {}) => ({
  id: 'run1',
  status: 'live',
  total_games: 20,
  games_played: 17,
  p1_elo: 1024,
  p1_erf: 61.2,
  p1_total_time_ms: 12000,
  p1_eff: 91.5,
  p1_cma: 83.4,
  p1_blunder: 4.1,
  p1_moves_analyzed: 20,
  p1_critical_total: 5,
  p1_crashes: 0,
  p2_elo: 976,
  p2_erf: 38.8,
  p2_total_time_ms: 11000,
  p2_eff: 88.2,
  p2_cma: 79.2,
  p2_blunder: 6.3,
  p2_moves_analyzed: 18,
  p2_critical_total: 4,
  p2_crashes: 0,
  ...overrides
});

const boxesOverlap = (first, second) =>
  first.x < second.x + second.width &&
  first.x + first.width > second.x &&
  first.y < second.y + second.height &&
  first.y + first.height > second.y;

const expectMenuLayout = async (page) => {
  const topbar = page.locator('.topbar');
  const menu = page.getByRole('button', {
    name: 'Toggle tournaments'
  });
  const leftPlayer = page.locator('.match-bar .player-left');
  const score = page.locator('.match-bar .score-center');
  const rightPlayer = page.locator('.match-bar .player-right');

  await expect(topbar).toBeVisible();
  await expect(menu).toBeVisible();

  const [topbarBox, menuBox, leftBox, scoreBox, rightBox] = await Promise.all([
    topbar.boundingBox(),
    menu.boundingBox(),
    leftPlayer.boundingBox(),
    score.boundingBox(),
    rightPlayer.boundingBox()
  ]);

  expect(topbarBox).not.toBeNull();
  expect(menuBox).not.toBeNull();
  expect(leftBox).not.toBeNull();
  expect(scoreBox).not.toBeNull();
  expect(rightBox).not.toBeNull();

  expect(menuBox.x).toBeGreaterThanOrEqual(topbarBox.x - 0.5);
  expect(menuBox.y).toBeGreaterThanOrEqual(topbarBox.y - 0.5);
  expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(topbarBox.x + topbarBox.width + 0.5);
  expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(topbarBox.y + topbarBox.height + 0.5);

  expect(boxesOverlap(menuBox, leftBox)).toBe(false);
  expect(boxesOverlap(menuBox, scoreBox)).toBe(false);
  expect(boxesOverlap(menuBox, rightBox)).toBe(false);
};

test.describe('Arena Viewer E2E', () => {
  let runRequests;
  let matchupRequests;

  test.beforeEach(async ({ page }) => {
    runRequests = 0;
    matchupRequests = 0;

    await page.route('/api/events', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: `data: ${JSON.stringify({
          type: 'connected',
          seq: 0,
          generation: GENERATION
        })}\n\n`
      });
    });

    await page.route('/api/latest-game', async (route) => {
      await route.fulfill({
        headers: {
          'x-arena-generation': GENERATION
        },
        json: {
          id: 100
        }
      });
    });

    await page.route('**/api/game/100*', async (route) => {
      await route.fulfill({
        headers: {
          'x-arena-generation': GENERATION
        },
        json: game()
      });
    });

    await page.route('/api/matchups*', async (route) => {
      matchupRequests += 1;

      await route.fulfill({
        json: [
          {
            runId: 'run1',
            status: 'live',
            hero: {
              id: 'run1:1',
              slot: 1,
              name: 'BotA',
              version: '1.0'
            },
            villain: {
              id: 'run1:2',
              slot: 2,
              name: 'BotB',
              version: '2.0'
            },
            heroWins: 10,
            villainWins: 5,
            draws: 2,
            total: 17,
            live_count: 1,
            lastActivity: '2024-01-01T12:00:00Z'
          }
        ]
      });
    });

    await page.route('/api/runs', async (route) => {
      runRequests += 1;

      await route.fulfill({
        json: [run()]
      });
    });

    await page.route('/api/games*', async (route) => {
      await route.fulfill({
        json: [
          {
            group_id: 'run1_1',
            games: [
              {
                id: 100,
                external_id: 'run1_1_0',
                run_id: 'run1',
                black_slot: 1,
                white_slot: 2,
                winner_color: 0,
                move_count: 2,
                timestamp: '2024-01-01T12:00:00Z'
              }
            ]
          }
        ]
      });
    });

    await page.goto('/');
  });

  test('loads the initial layout', async ({ page }) => {
    await expect(page.locator('.logo')).toBeVisible();
    await expect(page.locator('.sidebar')).toBeVisible();
    await expect(page.getByTestId('player-row-1')).toContainText('BotA');
    await expect(page.getByTestId('player-row-2')).toContainText('BotB');
  });

  test('keeps the desktop menu inside the top bar without overlap', async ({ page }) => {
    await expect(page.locator('.match-bar')).toContainText('BotA');
    await expectMenuLayout(page);
  });

  test('fetches initial collections only once', async ({ page }) => {
    await expect(page.getByTestId('player-row-1')).toContainText('BotA');

    expect(runRequests).toBe(1);
    expect(matchupRequests).toBe(1);
  });

  test('refreshes collections once after a real reconnect', async ({ page }) => {
    await expect(page.getByTestId('player-row-1')).toContainText('BotA');

    await expect
      .poll(() => runRequests, {
        timeout: 5000
      })
      .toBe(2);

    await expect
      .poll(() => matchupRequests, {
        timeout: 5000
      })
      .toBe(2);
  });

  test('scopes selected game URLs to the viewer generation', async ({ page }) => {
    await expect(page).toHaveURL(new RegExp(`/100\\?g=${GENERATION}$`));

    const requests = [];

    page.on('request', (request) => {
      if (request.url().includes('/api/game/100')) {
        requests.push(request.url());
      }
    });

    await page.reload();

    await expect(page.getByTestId('board-grid')).toBeVisible();

    expect(requests.some((url) => url.includes(`g=${GENERATION}`))).toBe(true);
  });

  test('rejects a late latest-game response from an old generation', async ({ page }) => {
    await page.unroute('/api/events');
    await page.unroute('/api/latest-game');
    await page.unroute('**/api/game/100*');

    const currentGeneration = 'viewer-current';
    const oldGeneration = 'viewer-old';
    let staleGameRequests = 0;

    await page.route('/api/events', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: `data: ${JSON.stringify({
          type: 'connected',
          seq: 0,
          generation: currentGeneration
        })}\n\n`
      });
    });

    await page.route('/api/latest-game', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 50));

      await route.fulfill({
        headers: {
          'x-arena-generation': oldGeneration
        },
        json: {
          id: 41
        }
      });
    });

    await page.route('**/api/game/41*', async (route) => {
      staleGameRequests += 1;

      await route.fulfill({
        status: 500,
        json: {
          error: 'must not load'
        }
      });
    });

    await page.goto('/');

    await expect(page.getByText('Select a match')).toBeVisible();
    await expect(page).toHaveURL('http://127.0.0.1:4173/');

    expect(staleGameRequests).toBe(0);
  });

  test('shows one canonical tournament summary', async ({ page }) => {
    await expect(page.getByLabel('10 wins, 5 losses, 2 draws')).toBeVisible();
    await expect(page.getByText('17/20')).toBeVisible();
    await expect(page.locator('.run-status.live')).toBeVisible();

    await expect(
      page.getByText('S1', {
        exact: true
      })
    ).toHaveCount(0);

    await expect(
      page.getByText('S2', {
        exact: true
      })
    ).toHaveCount(0);
  });

  test('keeps the tournament record neutral and the leader distinct', async ({ page }) => {
    const record = page.locator('.tournament-record');
    const values = record.locator('span');
    const leader = page.getByTestId('player-row-1');
    const other = page.getByTestId('player-row-2');

    await expect(values).toHaveCount(3);

    const colors = await values.evaluateAll((elements) =>
      elements.map((element) => getComputedStyle(element).color)
    );

    expect(new Set(colors).size).toBe(1);

    const accent = await page
      .locator('.run-status.live')
      .evaluate((element) => getComputedStyle(element).color);

    await expect(leader.locator('.p-name-text')).toHaveCSS('color', accent);
    await expect(leader.locator('.ver-tag')).not.toHaveCSS('color', accent);
    await expect(other.locator('.p-name-text')).not.toHaveCSS('color', accent);
    await expect(page.locator('.player-identity .gold-text')).toHaveCount(1);
  });

  test('displays the current game bar', async ({ page }) => {
    await expect(page.locator('.match-bar')).toContainText('BotA');
    await expect(page.locator('.match-bar')).toContainText('BotB');
    await expect(page.locator('.match-bar')).toContainText('LIVE');
  });

  test('renders stones in correct positions', async ({ page }) => {
    await expect(page.getByTestId('board-grid')).toBeVisible();
    await expect(page.getByTestId('stone-10-10')).toBeVisible();
    await expect(page.getByTestId('stone-11-11')).toBeVisible();
    await expect(page.getByTestId('stone-10-10')).toHaveAttribute('style', /left:\s*50%/);
  });

  test('opens statistics and games with canonical identity', async ({ page }) => {
    const requestPromise = page.waitForRequest((request) => request.url().includes('/api/games?'));

    await page.getByTestId('match-group').locator('.group-header').click();

    const request = await requestPromise;

    await expect(
      page.getByRole('region', {
        name: 'Tournament statistics'
      })
    ).toBeVisible();

    await expect(page.getByText('Eff')).toBeVisible();
    await expect(page.getByTestId('match-row')).toBeVisible();

    const url = new URL(request.url());

    expect(url.searchParams.get('hero_slot')).toBe('1');
    expect(url.searchParams.get('run_id')).toBe('run1');
  });

  test('contains expanded statistics within the tournament sidebar', async ({ page }) => {
    const group = page.getByTestId('match-group');

    await group.locator('.group-header').click();

    const stats = page.getByRole('region', {
      name: 'Tournament statistics'
    });

    await expect(stats).toBeVisible();

    const contained = await stats.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const groupRect = element.closest('.group-item').getBoundingClientRect();
      const sidebarRect = element.closest('.sidebar').getBoundingClientRect();

      return (
        rect.left >= groupRect.left - 0.5 &&
        rect.right <= groupRect.right + 0.5 &&
        rect.left >= sidebarRect.left - 0.5 &&
        rect.right <= sidebarRect.right + 0.5 &&
        element.scrollWidth <= element.clientWidth
      );
    });

    expect(contained).toBe(true);
  });

  test('does not retry failed history until Retry is pressed', async ({ page }) => {
    await page.unroute('/api/games*');

    let requests = 0;

    await page.route('/api/games*', async (route) => {
      requests += 1;

      if (requests === 1) {
        await route.fulfill({
          status: 500,
          json: {
            error: 'unavailable'
          }
        });
        return;
      }

      await route.fulfill({
        json: []
      });
    });

    await page.getByTestId('match-group').locator('.group-header').click();

    await expect(page.getByRole('alert')).toContainText('Could not load game history.');

    await page.waitForTimeout(100);

    expect(requests).toBe(1);

    await page
      .getByRole('button', {
        name: 'Retry'
      })
      .click();

    await expect.poll(() => requests).toBe(2);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('keeps long mobile names separated from the result', async ({ page }) => {
    await page.setViewportSize({
      width: 390,
      height: 844
    });

    await page.unroute('**/api/game/100*');

    await page.route('**/api/game/100*', async (route) => {
      await route.fulfill({
        headers: {
          'x-arena-generation': GENERATION
        },
        json: game({
          black_name: 'AlphaLongBotName',
          white_name: 'BetaLongBotNameX',
          black_ver: '123.45',
          white_ver: '987.65',
          winner_color: 1
        })
      });
    });

    await page.goto('/');

    const bar = page.locator('.match-bar');
    const left = bar.locator('.player-left');
    const right = bar.locator('.player-right');
    const leftName = left.locator('.p-name');
    const rightName = right.locator('.p-name');
    const score = bar.locator('.score-center');
    const versions = bar.locator('.p-ver');
    const stones = bar.locator('.p-color');

    await expect(leftName).toHaveText('AlphaLongBotName');
    await expect(rightName).toHaveText('BetaLongBotNameX');
    await expect(bar.getByText('1 – 0')).toBeVisible();
    await expect(stones).toHaveCount(2);

    for (let index = 0; index < 2; index += 1) {
      await expect(stones.nth(index)).toBeVisible();
      await expect(versions.nth(index)).toHaveCSS('display', 'none');
    }

    const [leftBox, rightBox, leftNameBox, rightNameBox, scoreBox, barBox] = await Promise.all([
      left.boundingBox(),
      right.boundingBox(),
      leftName.boundingBox(),
      rightName.boundingBox(),
      score.boundingBox(),
      bar.boundingBox()
    ]);

    expect(leftBox).not.toBeNull();
    expect(rightBox).not.toBeNull();
    expect(leftNameBox).not.toBeNull();
    expect(rightNameBox).not.toBeNull();
    expect(scoreBox).not.toBeNull();
    expect(barBox).not.toBeNull();

    expect(leftBox.width).toBeGreaterThan(20);
    expect(rightBox.width).toBeGreaterThan(20);
    expect(leftNameBox.width).toBeGreaterThan(8);
    expect(rightNameBox.width).toBeGreaterThan(8);
    expect(leftBox.x + leftBox.width).toBeLessThanOrEqual(scoreBox.x + 0.5);
    expect(scoreBox.x + scoreBox.width).toBeLessThanOrEqual(rightBox.x + 0.5);
    expect(barBox.x).toBeGreaterThanOrEqual(-0.5);
    expect(barBox.x + barBox.width).toBeLessThanOrEqual(390.5);

    const noOverflow = await bar.evaluate((element) => element.scrollWidth <= element.clientWidth);

    expect(noOverflow).toBe(true);
    await expectMenuLayout(page);
  });

  test('closes the mobile sidebar inertly and restores menu focus', async ({ page }) => {
    await page.setViewportSize({
      width: 390,
      height: 844
    });

    const sidebar = page.locator('#tournament-sidebar');

    const close = page.getByRole('button', {
      name: 'Close tournaments'
    });

    const menu = page.getByRole('button', {
      name: 'Toggle tournaments'
    });

    await expect(sidebar).toHaveAttribute('aria-hidden', 'false');

    await close.click();

    await expect(sidebar).toHaveAttribute('aria-hidden', 'true');
    await expect(sidebar).toHaveAttribute('inert', '');
    await expect(menu).toBeFocused();
  });

  test('renders an expanded tournament with complete statistics', async ({ page }) => {
    await page.unroute('/api/runs');

    await page.route('/api/runs', async (route) => {
      await route.fulfill({
        json: [
          run({
            p2_crashes: 2
          })
        ]
      });
    });

    await page.goto('/');

    const group = page.getByTestId('match-group');

    await group.locator('.group-header').click();

    await expect(page.getByText('CMA')).toBeVisible();
    await expect(page.getByText('Blunder')).toBeVisible();
    await expect(page.getByText('Crashes')).toBeVisible();
    await expect(page.getByText('Crashes').locator('..')).toContainText('2');
    await expect(page.getByTestId('match-row')).toBeVisible();
  });

  test('renders an expanded tournament with only core statistics', async ({ page }) => {
    await page.unroute('/api/runs');

    await page.route('/api/runs', async (route) => {
      await route.fulfill({
        json: [
          run({
            p1_eff: null,
            p2_eff: null,
            p1_cma: 0,
            p2_cma: 0,
            p1_blunder: 0,
            p2_blunder: 0,
            p1_moves_analyzed: 0,
            p2_moves_analyzed: 0,
            p1_critical_total: 0,
            p2_critical_total: 0,
            p1_crashes: 0,
            p2_crashes: 0
          })
        ]
      });
    });

    await page.goto('/');

    const group = page.getByTestId('match-group');

    await group.locator('.group-header').click();

    await expect(page.getByText('Eff')).toBeVisible();
    await expect(page.getByText('CMA')).toHaveCount(0);
    await expect(page.getByText('Blunder')).toHaveCount(0);
    await expect(page.getByText('Crashes')).toHaveCount(0);
    await expect(page.getByTestId('match-row')).toBeVisible();
  });

  test('renders a terminal board with persistent result markers', async ({ page }) => {
    await page.unroute('**/api/game/100*');

    await page.route('**/api/game/100*', async (route) => {
      await route.fulfill({
        headers: {
          'x-arena-generation': GENERATION
        },
        json: game({
          moves: '0,0,1;0,1,2;1,0,1;1,1,2;2,0,1;2,1,2;3,0,1;3,1,2;4,0,1',
          winner_color: 1
        })
      });
    });

    await page.goto('/');

    await expect(page.getByTestId('win-line')).toBeAttached();
    await expect(page.getByTestId('win-line')).toHaveCSS('stroke', 'rgb(239, 68, 68)');
    await expect(page.getByTestId('stone-4-0')).toHaveClass(/last/);
    await expect(page.locator('.match-bar')).toContainText('1 – 0');
  });
});
