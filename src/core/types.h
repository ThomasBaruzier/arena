#pragma once

#include <stdexcept>
#include <string>

namespace Arena::Core {
    enum class PlayerColor { NONE = 0, BLACK = 1, WHITE = 2 };
    enum class Winner { NONE = 0, P1 = 1, P2 = 2, DRAW = 3 };

    struct Point {
        int x;
        int y;
    };

    struct MatchTerminated : public std::runtime_error {
        MatchTerminated() : std::runtime_error("Match terminated by signal") {}
    };

    struct PlayerError : std::runtime_error {
        PlayerError(const std::string& m) : std::runtime_error(m) {}
    };
}
