import { expect, test } from '@playwright/test';

test.describe('Arena Viewer E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('/api/events', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: 'data: {"type":"connected","seq":0}\n\n'
      });
    });

    await page.route('/api/latest-game', async (route) => {
      await route.fulfill({
        json: { id: 100 }
      });
    });

    await page.route('/api/game/100', async (route) => {
      await route.fulfill({
        json: {
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
          timestamp: '2024-01-01T12:00:00Z'
        }
      });
    });

    await page.route('/api/matchups*', async (route) => {
      await route.fulfill({
        json: [
          {
            runId: 'run1',
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
      await route.fulfill({
        json: [
          {
            id: 'run1',
            total_games: 20,
            games_played: 17,
            p1_elo: 1024,
            p1_erf: 61.2,
            p1_cma: 83.4,
            p1_blunder: 4.1,
            p1_crashes: 0,
            p2_elo: 976,
            p2_erf: 38.8,
            p2_cma: 79.2,
            p2_blunder: 6.3,
            p2_crashes: 0
          }
        ]
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

  test('shows mapped player metrics without slot labels', async ({ page }) => {
    await expect(page.getByTestId('player-row-1')).toContainText('1024');
    await expect(page.getByTestId('player-row-1')).toContainText('61.2');
    await expect(page.getByTestId('player-row-2')).toContainText('976');
    await expect(page.getByText('S1', { exact: true })).toHaveCount(0);
    await expect(page.getByText('S2', { exact: true })).toHaveCount(0);
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
    await expect(page.getByTestId('stone-10-10')).toHaveAttribute(
      'style',
      /left:\s*50%/
    );
  });

  test('opens the game list with canonical slot identity', async ({ page }) => {
    const requestPromise = page.waitForRequest((request) =>
      request.url().includes('/api/games?')
    );

    await page.getByTestId('match-group').click();

    const request = await requestPromise;
    await expect(page.getByTestId('match-row')).toBeVisible();

    const url = new URL(request.url());
    expect(url.searchParams.get('hero_slot')).toBe('1');
    expect(url.searchParams.get('run_id')).toBe('run1');
  });
});
