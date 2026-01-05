#pragma once

#include <vector>
#include "../core/constants.h"

namespace Arena::Game {
    class Rules {
    public:
        static bool check_win(
            const std::vector<int>& board, int size, int x, int y, int c
        );
    private:
        static int count_line(
            const std::vector<int>& board, int size,
            int x, int y, int c, int dx, int dy
        );
    };
}
