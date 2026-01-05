#include "rules.h"

namespace Arena::Game {

    bool Rules::check_win(
        const std::vector<int>& board, int size, int x, int y, int c)
    {
        int directions[4][2] = {{1, 0}, {0, 1}, {1, 1}, {1, -1}};
        for (auto& dir : directions) {
            if (count_line(board, size, x, y, c, dir[0], dir[1])
                >= Core::Constants::WINNING_LENGTH)
                return true;
        }
        return false;
    }

    int Rules::count_line(
        const std::vector<int>& board, int size,
        int x, int y, int c, int dx, int dy
    ) {
        int cnt = 1;
        auto check_dir = [&](int s) {
            for (int i = 1; i < Core::Constants::WINNING_LENGTH; ++i) {
                int nx = x + s * i * dx;
                int ny = y + s * i * dy;
                if (nx < 0 || nx >= size || ny < 0 || ny >= size) break;
                if (board[ny * size + nx] != c) break;
                cnt++;
            }
        };
        check_dir(-1);
        check_dir(1);
        return cnt;
    }
}
