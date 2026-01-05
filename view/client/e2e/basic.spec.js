import { test, expect } from '@playwright/test';

test.describe('Arena Viewer E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('/api/events', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: 'data: {"type":"connected","seq":0}\n\n'
      });
    });
    await page.route('/api/latest-game', async (route) => route.fulfill({ json: { id: 100 } }));
    await page.route('/api/game/100', async (route) => {
      await route.fulfill({
        json: {
          id: 100,
          moves: '10,10,1;11,11,2',
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
            tournamentId: 'run1',
            hero: { id: 1, name: 'BotA', version: '1.0' },
            villain: { id: 2, name: 'BotB', version: '2.0' },
            heroWins: 10,
            villainWins: 5,
            draws: 2,
            total: 17,
            lastActivity: '2024-01-01T12:00:00Z'
          }
        ]
      });
    });
    await page.route('/api/runs', async (route) => route.fulfill({ json: [] }));
    await page.route('/api/games*', async (route) => {
      await route.fulfill({
        json: [
          {
            group_id: 'g1',
            games: [
              { id: 100, winner_color: 0, move_count: 2, timestamp: '2024-01-01T12:00:00Z' }
            ]
          }
        ]
      });
    });
    await page.goto('/');
  });

  test('loads initial layout', async ({ page }) => {
    await expect(page.locator('.logo')).toBeVisible();
    await expect(page.locator('.sidebar')).toBeVisible();
  });

  test('displays match bar', async ({ page }) => {
    await expect(page.locator('.match-bar')).toContainText('BotA');
    await expect(page.locator('.match-bar')).toContainText('BotB');
  });

  test('renders stones in correct positions', async ({ page }) => {
    await expect(page.getByTestId('board-grid')).toBeVisible();
    const stone1 = page.getByTestId('stone-10-10');
    const stone2 = page.getByTestId('stone-11-11');
    await expect(stone1).toBeVisible();
    await expect(stone2).toBeVisible();
    await expect(stone1).toHaveAttribute('style', /left:\s*50%/);
  });

  test('sidebar interaction', async ({ page }) => {
    await page.getByTestId('match-group').click();
    await expect(page.getByTestId('match-row')).toBeVisible();
  });
});
