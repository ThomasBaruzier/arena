import { expect, test } from '@playwright/test';

const GENERATION = 'viewer-1';

const run = (id, overrides = {}) => ({
  id,
  status: 'live',
  analysis_enabled: 1,
  total_games: 20,
  games_played: 17,
  wins: 10,
  losses: 5,
  draws: 2,
  p1_elo: 1024,
  p2_elo: 976,
  p1_total_time_ms: 100 * 60 * 60 * 1000,
  p2_total_time_ms: (99 * 60 * 60 + 59 * 60) * 1000,
  p1_erf: 61.2,
  p2_erf: 38.8,
  p1_eff: 94.1,
  p2_eff: 87.6,
  p1_cma: 83.4,
  p2_cma: 79.2,
  p1_blunder: 4.1,
  p2_blunder: 6.3,
  p1_moves_analyzed: 20,
  p2_moves_analyzed: 18,
  p1_critical_total: 5,
  p2_critical_total: 4,
  p1_crashes: 0,
  p2_crashes: 0,
  slot1_name: id === 'run1' ? 'Alpha' : 'Gamma',
  slot1_version: id === 'run1' ? '1.4' : '3.0',
  slot2_name: id === 'run1' ? 'Beta' : 'Delta',
  slot2_version: id === 'run1' ? '2.1' : '4.0',
  ...overrides
});

const matchup = (value) => ({
  runId: value.id,
  status: value.status,
  hero: {
    id: `${value.id}:1`,
    slot: 1,
    name: value.slot1_name,
    version: value.slot1_version
  },
  villain: {
    id: `${value.id}:2`,
    slot: 2,
    name: value.slot2_name,
    version: value.slot2_version
  },
  heroWins: value.wins,
  villainWins: value.losses,
  draws: value.draws,
  total: value.games_played,
  live_count: value.status === 'live' ? 1 : 0,
  run: value
});

const selectedGame = (overrides = {}) => ({
  id: 100,
  run_id: 'run1',
  group_id: 'run1_100',
  board_size: 20,
  moves: '10,10,1;11,11,2;12,10,1',
  black_slot: 1,
  white_slot: 2,
  black_name: 'Alpha',
  white_name: 'Beta',
  black_ver: '2026.11',
  white_ver: '1.4',
  winner_color: 0,
  timestamp: '2026-01-01T12:00:00Z',
  duration: 1234,
  ...overrides
});

const historyGame = (runId, groupId, id, blackSlot, overrides = {}) => ({
  id,
  external_id: `${groupId}_${blackSlot === 1 ? 0 : 1}`,
  group_id: groupId,
  run_id: runId,
  timestamp: '2026-01-01T12:00:00Z',
  winner_color: 1,
  move_count: 1,
  black_slot: blackSlot,
  white_slot: blackSlot === 1 ? 2 : 1,
  board_size: 20,
  opening_len: 0,
  duration: 1000,
  ...overrides
});

const pair = (runId, id, overrides = {}) => {
  const groupId = `${runId}_${id}`;

  const game = historyGame(runId, groupId, id, 1, {
    move_count: 3,
    duration: 1300
  });

  return {
    group_id: groupId,
    pair_size: 1,
    latest_ts: '2026-01-01T12:00:00Z',
    max_id: id,
    min_moves: 3,
    max_moves: 3,
    live_count: 0,
    duration: 1300,
    slot1_wins: 1,
    games: [game],
    ...overrides
  };
};

const terminalGame = () =>
  selectedGame({
    moves: '0,0,1;0,1,2;1,0,1;1,1,2;2,0,1;2,1,2;3,0,1;3,1,2;4,0,1',
    winner_color: 1
  });

const orderPairs = (values, sort, ascending) =>
  [...values].sort((first, second) => {
    let firstValue;
    let secondValue;

    if (sort === 'moves') {
      firstValue = ascending ? first.min_moves : first.max_moves;
      secondValue = ascending ? second.min_moves : second.max_moves;
    } else if (sort === 'duration') {
      firstValue = first.duration;
      secondValue = second.duration;
    } else if (sort === 'result') {
      firstValue = first.live_count;
      secondValue = second.live_count;

      if (firstValue === secondValue) {
        firstValue = first.slot1_wins;
        secondValue = second.slot1_wins;
      }
    } else {
      firstValue = first.max_id;
      secondValue = second.max_id;
    }

    if (firstValue !== secondValue) {
      return ascending ? firstValue - secondValue : secondValue - firstValue;
    }

    return sort === 'id'
      ? first.group_id.localeCompare(second.group_id)
      : second.max_id - first.max_id;
  });

const phase = async (group) =>
  group.evaluate((element) =>
    ['closed', 'preparing', 'opening', 'open', 'closing'].find((value) =>
      element.classList.contains(value)
    )
  );

const expectPhase = async (group, value) => {
  await expect.poll(() => phase(group)).toBe(value);
};

const openGroup = async (group) => {
  await group.locator('.group-header').click();
  await expectPhase(group, 'open');
};

test.describe('Arena viewer', () => {
  let firstRun;
  let secondRun;
  let histories;
  let historyRequests;
  let holdRun2;
  let releaseRun2;
  let failRun2;

  test.beforeEach(async ({ page }) => {
    firstRun = run('run1');

    secondRun = run('run2', {
      games_played: 4,
      wins: 2,
      losses: 1,
      draws: 1,
      p2_crashes: 2
    });

    histories = {
      run1: [
        pair('run1', 100),
        pair('run1', 90, {
          min_moves: 8,
          max_moves: 8,
          duration: 900,
          games: [
            historyGame('run1', 'run1_90', 90, 2, {
              move_count: 8,
              duration: 900,
              winner_color: 2
            })
          ]
        })
      ],
      run2: [pair('run2', 200)]
    };

    historyRequests = [];
    holdRun2 = false;
    releaseRun2 = null;
    failRun2 = false;

    await page.addInitScript(
      ({ generation }) => {
        const sources = [];

        class ArenaEventSource {
          constructor() {
            this.onopen = null;
            this.onmessage = null;
            this.onerror = null;
            this.closed = false;

            sources.push(this);

            queueMicrotask(() => {
              if (this.closed) {
                return;
              }

              this.onopen?.();

              this.onmessage?.({
                data: JSON.stringify({
                  type: 'connected',
                  seq: 0,
                  generation
                })
              });
            });
          }

          close() {
            this.closed = true;
          }
        }

        window.EventSource = ArenaEventSource;

        window.__arenaEmit = (message) => {
          for (const source of sources) {
            if (source.closed) {
              continue;
            }

            source.onmessage?.({
              data: JSON.stringify({
                ...message,
                generation
              })
            });
          }
        };
      },
      {
        generation: GENERATION
      }
    );

    await page.route('**/api/latest-game', async (route) => {
      await route.fulfill({
        headers: {
          'x-arena-generation': GENERATION
        },
        json: {
          id: 100
        }
      });
    });

    await page.route('**/api/game/100', async (route) => {
      await route.fulfill({
        headers: {
          'x-arena-generation': GENERATION
        },
        json: selectedGame()
      });
    });

    await page.route('**/api/runs', async (route) => {
      await route.fulfill({
        json: [firstRun, secondRun]
      });
    });

    await page.route('**/api/matchups*', async (route) => {
      await route.fulfill({
        json: [matchup(firstRun), matchup(secondRun)]
      });
    });

    await page.route('**/api/games*', async (route) => {
      const url = new URL(route.request().url());
      const runId = url.searchParams.get('run_id');

      historyRequests.push(url.href);

      if (runId === 'run2' && holdRun2) {
        await new Promise((resolve) => {
          releaseRun2 = resolve;
        });
      }

      if (runId === 'run2' && failRun2) {
        await route.fulfill({
          status: 500,
          json: {
            error: 'failed'
          }
        });

        return;
      }

      const sort = url.searchParams.get('sort') || 'id';
      const ascending = url.searchParams.get('order') === 'asc';

      await route.fulfill({
        json: orderPairs(histories[runId] || [], sort, ascending)
      });
    });

    await page.goto('/');
  });

  test('uses the fixed shell and clean route', async ({ page }) => {
    await expect(page).toHaveURL('http://127.0.0.1:4173/100');

    expect(new URL(page.url()).search).toBe('');

    await expect(page.locator('#tournament-sidebar')).toHaveCSS('width', '300px');
    await expect(page.locator('.topbar')).toHaveCSS('height', '52px');
  });

  test('uses equal desktop version and name typography', async ({ page }) => {
    const version = page.locator('.match-bar .p-ver').first();
    const name = page.locator('.match-bar .p-name').first();

    await expect(version).toBeVisible();
    await expect(name).toBeVisible();

    const typography = await page.evaluate(
      ({ version, name }) => {
        const versionStyle = getComputedStyle(version);
        const nameStyle = getComputedStyle(name);

        return {
          versionFamily: versionStyle.fontFamily,
          nameFamily: nameStyle.fontFamily,
          versionSize: versionStyle.fontSize,
          nameSize: nameStyle.fontSize,
          versionLine: versionStyle.lineHeight,
          nameLine: nameStyle.lineHeight
        };
      },
      {
        version: await version.elementHandle(),
        name: await name.elementHandle()
      }
    );

    expect(typography.versionFamily).toBe(typography.nameFamily);
    expect(typography.versionSize).toBe(typography.nameSize);
    expect(typography.versionLine).toBe(typography.nameLine);
  });

  test('keeps the Arena top bar balanced at 350px', async ({ page }) => {
    await page.setViewportSize({
      width: 350,
      height: 700
    });

    await page.reload();

    const topbar = page.locator('.topbar');
    const bar = page.locator('.match-bar');

    await expect(topbar).toHaveCSS('height', '52px');
    await expect(bar.locator('.p-ver')).toHaveCount(2);
    await expect(bar.locator('.p-name')).toHaveCount(2);
    await expect(bar.locator('.p-color')).toHaveCount(2);

    const geometry = await page.evaluate(() => {
      const topbar = document.querySelector('.topbar').getBoundingClientRect();
      const bar = document.querySelector('.match-bar').getBoundingClientRect();
      const center = document.querySelector('.score-center').getBoundingClientRect();
      const name = getComputedStyle(document.querySelector('.match-bar .p-name'));
      const version = getComputedStyle(document.querySelector('.match-bar .p-ver'));

      return {
        contained: bar.left >= topbar.left && bar.right <= topbar.right,
        centered: Math.abs(center.left + center.width / 2 - (topbar.left + topbar.width / 2)) < 0.6,
        nameSize: name.fontSize,
        versionSize: version.fontSize,
        nameLine: name.lineHeight,
        versionLine: version.lineHeight
      };
    });

    expect(geometry.contained).toBe(true);
    expect(geometry.centered).toBe(true);
    expect(geometry.nameSize).toBe(geometry.versionSize);
    expect(geometry.nameLine).toBe(geometry.versionLine);
  });

  test('keeps one arrow node through preparation and opening', async ({ page }) => {
    const first = page.getByTestId('match-group').first();
    const arrow = first.locator('.group-arrow');

    await arrow.evaluate((element) => {
      element.dataset.probe = 'persistent';
    });

    await first.locator('.group-header').click();
    await expectPhase(first, 'opening');
    await expect(arrow).toHaveCSS('animation-name', 'group-arrow-open');
    await expectPhase(first, 'open');
    await expect(arrow).toHaveAttribute('data-probe', 'persistent');
  });

  test('waits for target data before closing the current tournament', async ({ page }) => {
    const groups = page.getByTestId('match-group');
    const first = groups.nth(0);
    const second = groups.nth(1);

    await openGroup(first);

    await page.addStyleTag({
      content: '.group-list { transition-duration: 700ms !important; }'
    });

    holdRun2 = true;

    await second.locator('.group-header').click();

    await expectPhase(first, 'open');
    await expectPhase(second, 'preparing');
    await expect.poll(() => typeof releaseRun2).toBe('function');

    releaseRun2();
    holdRun2 = false;

    await expectPhase(first, 'closing');
    await expectPhase(first, 'closed');
    await expectPhase(second, 'opening');
    await expectPhase(second, 'open');
    await expect(page.locator('.group-item.open')).toHaveCount(1);
  });

  test('opens failed data into matrix and Retry', async ({ page }) => {
    failRun2 = true;

    const second = page.getByTestId('match-group').nth(1);

    await second.locator('.group-header').click();
    await expectPhase(second, 'open');

    await expect(
      second.getByRole('table', {
        name: 'Player statistics comparison'
      })
    ).toBeVisible();

    const retry = second.getByRole('alert', {
      name: 'Could not load game history'
    });

    await expect(retry).toBeVisible();

    failRun2 = false;

    await retry
      .getByRole('button', {
        name: 'Retry'
      })
      .click();

    await expect(retry).toHaveCount(0);
  });

  test('fits the analyzed matrix and formats long time', async ({ page }) => {
    const first = page.getByTestId('match-group').first();

    await openGroup(first);

    const table = first.getByRole('table', {
      name: 'Player statistics comparison'
    });

    await expect(table).toContainText('100h+');
    await expect(table).toContainText('99h59');

    const clipped = await table
      .locator('[role="columnheader"], [role="rowheader"], [role="cell"]')
      .evaluateAll((elements) =>
        elements
          .filter((element) => element.scrollWidth > element.clientWidth)
          .map((element) => element.textContent)
      );

    expect(clipped).toEqual([]);

    expect(
      await table.evaluate((element) => {
        const body = element.closest('.group-list-inner');
        const tableBox = element.getBoundingClientRect();
        const bodyBox = body.getBoundingClientRect();

        return (
          tableBox.left >= bodyBox.left - 0.5 &&
          tableBox.right <= bodyBox.right + 0.5 &&
          body.scrollWidth <= body.clientWidth
        );
      })
    ).toBe(true);
  });

  test('aligns history headers and values exactly', async ({ page }) => {
    const first = page.getByTestId('match-group').first();

    await openGroup(first);

    const row = first.getByTestId('match-row').first();

    for (const column of [
      ['id', 'row-id'],
      ['side', 'row-side'],
      ['moves', 'row-moves'],
      ['duration', 'row-duration'],
      ['result', 'row-status']
    ]) {
      const headerBox = await first.locator(`.history-head-cell.${column[0]}`).boundingBox();
      const valueBox = await row.locator(`.${column[1]}`).boundingBox();

      expect(Math.abs(headerBox.x - valueBox.x)).toBeLessThan(0.6);
      expect(Math.abs(headerBox.width - valueBox.width)).toBeLessThan(0.6);
    }
  });

  test('uses lean snapshots and locally reorders streamed data', async ({ page }) => {
    const first = page.getByTestId('match-group').first();

    await openGroup(first);

    await first
      .getByRole('button', {
        name: /Sort by move count/
      })
      .click();

    await expect.poll(() => historyRequests.length).toBe(2);

    const updated = pair('run1', 100, {
      min_moves: 12,
      max_moves: 12,
      games: [
        historyGame('run1', 'run1_100', 100, 1, {
          move_count: 12,
          duration: 1300
        })
      ]
    });

    await page.evaluate((event) => window.__arenaEmit(event), {
      type: 'game_move',
      run_id: 'run1',
      moves: '10,10,1;11,11,2',
      pair: updated
    });

    await expect(first.getByTestId('match-row').first().locator('.row-id')).toHaveText('#100');

    expect(historyRequests).toHaveLength(2);
  });

  test('completes the full Replay exit batch', async ({ page }) => {
    await page.unroute('**/api/game/100');

    await page.route('**/api/game/100', async (route) => {
      await route.fulfill({
        headers: {
          'x-arena-generation': GENERATION
        },
        json: terminalGame()
      });
    });

    await page.reload();

    await page
      .getByRole('button', {
        name: 'Replay from start'
      })
      .click();

    const exiting = page.locator('.stone-layer.exiting');

    await expect(exiting).toHaveCount(9);

    const exitingStones = await exiting.all();

    for (const stone of exitingStones) {
      await stone.dispatchEvent('animationend', {
        animationName: 'arena-stone-exit'
      });
    }

    const marker = page.locator('.move-marker.exiting');

    if (await marker.count()) {
      await marker.dispatchEvent('animationend', {
        animationName: 'arena-marker-exit'
      });
    }

    const line = page.locator('.win-line-svg.exiting');

    if (await line.count()) {
      await line.dispatchEvent('animationend', {
        animationName: 'arena-line-exit'
      });
    }

    await expect(page.locator('.stone-layer')).toHaveCount(0);
    await expect(page.locator('.move-marker')).toHaveCount(0);
    await expect(page.locator('.win-line-svg')).toHaveCount(0);
  });
});
