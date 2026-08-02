#include "rules.h"

namespace Arena::Game {

bool Rules::check_win(
    const std::vector<int>& board,
    int size,
    int x,
    int y,
    int color
) {
    static constexpr int directions[4][2] = {
        {1, 0},
        {0, 1},
        {1, 1},
        {1, -1}
    };

    for (const auto& direction : directions) {
        if (
            count_line(
                board,
                size,
                x,
                y,
                color,
                direction[0],
                direction[1]
            ) >= Core::Constants::WINNING_LENGTH
        ) {
            return true;
        }
    }

    return false;
}

int Rules::count_line(
    const std::vector<int>& board,
    int size,
    int x,
    int y,
    int color,
    int dx,
    int dy
) {
    int count = 1;

    auto check_direction = [&](int sign) {
        for (
            int distance = 1;
            distance < Core::Constants::WINNING_LENGTH;
            ++distance
        ) {
            int next_x = x + sign * distance * dx;
            int next_y = y + sign * distance * dy;

            if (
                next_x < 0 ||
                next_x >= size ||
                next_y < 0 ||
                next_y >= size ||
                board[next_y * size + next_x] != color
            ) {
                break;
            }

            ++count;
        }
    };

    check_direction(-1);
    check_direction(1);

    return count;
}

}
