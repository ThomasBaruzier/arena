#pragma once

#include <string>
#include <vector>
#include "../core/types.h"

namespace Arena::Game {

class Openings {
public:
    static std::vector<
        std::vector<Core::Point>
    > load(
        const std::string& path
    );

    static void validate(
        const std::vector<Core::Point>& opening,
        int board_size
    );

private:
    static std::vector<Core::Point>
    parse_line(
        const std::string& line
    );
};

}
