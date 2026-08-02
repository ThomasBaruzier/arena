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
  moves: '0,0,1;0,1,2;1,0,1;1,1,2;2,0,1;2,1,2;3,0,1;3,1,2;4,0,1',
  black_slot: 1,
  white_slot: 2,
  black_name: 'Alpha',
  white_name: 'Beta',
  black_ver: '2026.11',
  white_ver: '1.4',
  winner_color: 1,
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

const phase = (group) =>
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

const elementGaps = (element) => {
  const boxes = [...element.children].map((child) => child.getBoundingClientRect());

  return boxes.slice(0, -1).map((box, index) => boxes[index + 1].left - box.right);
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
      wins: 1,
      losses: 2,
      draws: 1,
      p2_crashes: 2
    });

    histories = {
      run1: [
        pair('run1', 1000001, {
          duration: 100 * 60 * 60 * 1000,
          games: [
            historyGame('run1', 'run1_1000001', 1000001, 1, {
              move_count: 400,
              duration: 100 * 60 * 60 * 1000
            })
          ]
        }),
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
              if (this.closed) return;

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
            if (source.closed) continue;

            source.onmessage?.({
              data: JSON.stringify({
                ...message,
                generation
              })
            });
          }
        };
      },
      { generation: GENERATION }
    );

    await page.route('**/api/latest-game', async (route) => {
      await route.fulfill({
        headers: { 'x-arena-generation': GENERATION },
        json: { id: 100 }
      });
    });

    await page.route('**/api/game/100', async (route) => {
      await route.fulfill({
        headers: { 'x-arena-generation': GENERATION },
        json: selectedGame()
      });
    });

    await page.route('**/api/runs', async (route) => {
      await route.fulfill({ json: [firstRun, secondRun] });
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
          json: { error: 'failed' }
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

  test('centers the matchup in post-menu space with unified typography', async ({
    page
  }) => {
    await page.setViewportSize({ width: 350, height: 700 });
    await page.reload();

    await expect(page.locator('.match-bar')).toBeVisible();
    await expect(page.locator('.final-score')).toBeVisible();

    const geometry = await page.evaluate(() => {
      const topbar = document.querySelector('.topbar').getBoundingClientRect();
      const match = document.querySelector('.match-bar').getBoundingClientRect();
      const style = getComputedStyle(document.querySelector('.topbar'));
      const left = topbar.left + Number.parseFloat(style.paddingLeft) + 30;
      const right = topbar.right - Number.parseFloat(style.paddingRight);
      const elements = ['.p-name', '.p-ver', '.final-score'].map((selector) =>
        getComputedStyle(document.querySelector(selector))
      );

      return {
        offset: Math.abs(match.left + match.width / 2 - (left + right) / 2),
        sizes: elements.map((value) => value.fontSize),
        lines: elements.map((value) => value.lineHeight)
      };
    });

    expect(geometry.offset).toBeLessThan(0.7);
    expect(new Set(geometry.sizes).size).toBe(1);
    expect(new Set(geometry.lines).size).toBe(1);
  });

  test('uses neutral names and closed-card result tinting', async ({ page }) => {
    const groups = page.getByTestId('match-group');
    const first = groups.nth(0);
    const second = groups.nth(1);

    await expect(first).toHaveClass(/slot1-ahead/);
    await expect(second).toHaveClass(/slot1-behind/);
    await expect(first.locator('.p-name-text')).toHaveCount(2);
    await expect(first.locator('.p-name-text.gold-text')).toHaveCount(0);

    const typography = await first.evaluate((element) => {
      const name = getComputedStyle(element.querySelector('.p-name-text'));
      const version = getComputedStyle(element.querySelector('.ver-tag'));

      return {
        nameSize: name.fontSize,
        versionSize: version.fontSize,
        nameLine: name.lineHeight,
        versionLine: version.lineHeight
      };
    });

    expect(typography.nameSize).toBe(typography.versionSize);
    expect(typography.nameLine).toBe(typography.versionLine);

    await expect(first.getByText('W 10')).toHaveClass(/(^|\s)badge(\s|$)/);
    await expect(first.getByText('W 10')).toHaveClass(/(^|\s)win(\s|$)/);
    await expect(first.getByText('LIVE')).toHaveClass(/(^|\s)badge(\s|$)/);
    await expect(first.getByText('LIVE')).toHaveClass(/(^|\s)run-status(\s|$)/);
    await expect(first.getByText('LIVE')).toHaveClass(/(^|\s)live(\s|$)/);
  });

  test('waits for target data before closing the current tournament', async ({
    page
  }) => {
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

  test('opens failed history into matrix and Retry', async ({ page }) => {
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
    await retry.getByRole('button', { name: 'Retry' }).click();

    await expect(retry).toHaveCount(0);
  });

  test('fits statistics and caps visible history values', async ({ page }) => {
    const first = page.getByTestId('match-group').first();

    await openGroup(first);

    const table = first.getByRole('table', {
      name: 'Player statistics comparison'
    });

    await expect(table).toContainText('100h+');
    await expect(table).toContainText('99h59');

    expect(
      await table.evaluate((element) => element.scrollWidth <= element.clientWidth)
    ).toBe(true);

    const firstRow = first.getByTestId('match-row').first();

    await expect(firstRow.locator('.row-id')).toHaveText('#999999+');
    await expect(firstRow.locator('.row-duration')).toHaveText('100h+');
    await expect(firstRow.locator('.row-id')).toHaveAttribute('title', 'Game 1000001');
  });

  test('aligns history cells and distributes column gaps evenly', async ({ page }) => {
    const first = page.getByTestId('match-group').first();

    await openGroup(first);

    const row = first.getByTestId('match-row').first();

    for (const [header, value] of [
      ['id', 'row-id'],
      ['side', 'row-side'],
      ['moves', 'row-moves'],
      ['duration', 'row-duration'],
      ['result', 'row-status']
    ]) {
      const headerBox = await first
        .locator(`.history-head-cell.${header}`)
        .boundingBox();
      const valueBox = await row.locator(`.${value}`).boundingBox();

      expect(Math.abs(headerBox.x - valueBox.x)).toBeLessThan(0.6);
      expect(Math.abs(headerBox.width - valueBox.width)).toBeLessThan(0.6);
    }

    const headerGaps = await first.locator('.match-header-row').evaluate(elementGaps);
    const rowGaps = await row.evaluate(elementGaps);

    for (const gaps of [headerGaps, rowGaps]) {
      expect(gaps).toHaveLength(4);
      expect(Math.min(...gaps)).toBeGreaterThan(0);
      expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThan(1.1);
    }

    headerGaps.forEach((gap, index) => {
      expect(Math.abs(gap - rowGaps[index])).toBeLessThan(0.6);
    });
  });

  test('reorders a streamed pair locally without refetching its row', async ({
    page
  }) => {
    const first = page.getByTestId('match-group').first();

    await openGroup(first);
    await first.getByRole('button', { name: /Sort by move count/ }).click();

    await expect.poll(() => historyRequests.length).toBe(2);

    await expect(first.getByTestId('match-row').first().locator('.row-id')).toHaveText(
      '#999999+'
    );

    await first.locator('.pair-container').evaluateAll((elements) => {
      const target = elements.find(
        (element) => element.querySelector('.row-id')?.textContent === '#90'
      );

      if (!target) throw new Error('Expected streamed pair');

      target.dataset.streamIdentity = 'run1-90';
    });

    const updated = pair('run1', 90, {
      min_moves: 500,
      max_moves: 500,
      duration: 900,
      games: [
        historyGame('run1', 'run1_90', 90, 2, {
          move_count: 500,
          duration: 900,
          winner_color: 2
        })
      ]
    });

    await page.evaluate((event) => window.__arenaEmit(event), {
      type: 'game_move',
      run_id: 'run1',
      moves: '10,10,1;11,11,2',
      pair: updated
    });

    const firstPair = first.locator('.pair-container').first();

    await expect(firstPair).toHaveAttribute('data-stream-identity', 'run1-90');
    await expect(firstPair.getByTestId('match-row').locator('.row-id')).toHaveText(
      '#90'
    );
    await expect(first.locator('.group-list')).toHaveAttribute('aria-busy', 'false');

    expect(historyRequests).toHaveLength(2);
  });

  test('keeps playback usable while Replay transitions reverse', async ({ page }) => {
    await page.addStyleTag({
      content:
        '.stone-layer,.move-marker,.win-line-svg {' +
        'transition-duration: 1s !important;}'
    });

    const replay = page.getByRole('button', { name: 'Replay from start' });

    await replay.click();

    await expect(page.getByText('Move 0/9')).toBeVisible();
    await expect(page.locator('.stone-layer.exiting')).toHaveCount(9);

    const previous = page.getByRole('button', { name: 'Previous move' });
    const next = page.getByRole('button', { name: 'Next move' });

    await expect(previous).toBeDisabled();
    await expect(next).toBeEnabled();

    await next.click();
    await expect(page.getByText('Move 1/9')).toBeVisible();

    const firstStone = page.getByTestId('stone-0-0');

    await expect(firstStone).toBeVisible();

    await firstStone.evaluate((element) => {
      element.dataset.motionIdentity = 'first-stone';
    });

    await replay.click();

    await expect(page.getByText('Move 0/9')).toBeVisible();
    await expect(firstStone).toHaveAttribute('data-motion-identity', 'first-stone');

    await next.click();

    await expect(page.getByText('Move 1/9')).toBeVisible();
    await expect(firstStone).toHaveAttribute('data-motion-identity', 'first-stone');
    await expect(previous).toBeEnabled();
  });

  test('runs 3x playback independently from long visual transitions', async ({
    page
  }) => {
    await page.addStyleTag({
      content:
        '.stone-layer,.move-marker,.win-line-svg {' +
        'transition-duration: 2s !important;}'
    });

    await page.getByRole('button', { name: 'Replay from start' }).click();
    await page.getByRole('button', { name: '3x' }).click();

    const started = Date.now();

    await page.getByRole('button', { name: 'Play playback' }).click();
    await expect(page.getByText('Move 9/9')).toBeVisible();

    expect(Date.now() - started).toBeLessThan(1500);

    await expect(page.locator('.stone-layer')).toHaveCount(9);
    await expect(page.getByTestId('stone-4-0')).toBeVisible();

    const delays = await page
      .locator('.stone-layer')
      .evaluateAll((elements) =>
        elements.map(
          (element) =>
            Number.parseFloat(element.style.getPropertyValue('--stone-delay')) || 0
        )
      );

    expect(Math.max(0, ...delays)).toBeLessThanOrEqual(40);

    await expect(page.getByRole('button', { name: 'Previous move' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Next move' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Play playback' })).toBeDisabled();
  });

  test('starts the departing stone and marker together on rewind', async ({ page }) => {
    await page.addStyleTag({
      content:
        '.stone-layer,.move-marker,.win-line-svg {' +
        'transition-duration: 1s !important;}'
    });

    await page.getByRole('button', { name: 'Previous move' }).click();

    await expect(page.getByText('Move 8/9')).toBeVisible();

    const stone = page.getByTestId('stone-4-0');
    const marker = page.locator('.move-marker.exiting');

    await expect(stone).toHaveClass(/exiting/);
    await expect(marker).toHaveCount(1);

    const timing = await page.evaluate(() => {
      const stone = document.querySelector('[data-testid="stone-4-0"]');
      const marker = document.querySelector('.move-marker.exiting');

      return {
        stoneDelay: stone.style.getPropertyValue('--stone-delay'),
        markerDelay: marker.style.getPropertyValue('--marker-delay'),
        stoneDuration: stone.style.getPropertyValue('--stone-duration'),
        markerDuration: marker.style.getPropertyValue('--marker-duration')
      };
    });

    expect(timing.stoneDelay).toBe('0ms');
    expect(timing.markerDelay).toBe('0ms');
    expect(timing.markerDuration).toBe(timing.stoneDuration);
  });
});
