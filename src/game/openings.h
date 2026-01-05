#pragma once

#include <vector>
#include <string>
#include "../core/types.h"

namespace Arena::Game {
    class Openings {
    public:
        static std::vector<std::vector<Core::Point>> load(const std::string& path);
    private:
        static std::vector<Core::Point> parse_line(const std::string& line);
    };
}
