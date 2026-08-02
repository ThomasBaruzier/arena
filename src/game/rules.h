#pragma once

#include <vector>
#include "../core/constants.h"

namespace Arena::Game {

class Rules {
public:
    static bool check_win(
        const std::vector<int>& board,
        int size,
        int x,
        int y,
        int color
    );

private:
    static int count_line(
        const std::vector<int>& board,
        int size,
        int x,
        int y,
        int color,
        int dx,
        int dy
    );
};

}
