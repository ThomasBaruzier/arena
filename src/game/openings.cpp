#include "openings.h"
#include <fstream>
#include <stdexcept>

namespace Arena::Game {

    std::vector<std::vector<Core::Point>> Openings::load(
        const std::string& path)
    {
        std::ifstream file(path);
        if (!file.is_open()) {
            throw std::runtime_error("Cannot open openings: " + path);
        }

        std::vector<std::vector<Core::Point>> openings;
        std::string line;

        while (std::getline(file, line)) {
            if (!line.empty() && line.back() == '\r') line.pop_back();
            if (line.empty()) continue;
            openings.push_back(parse_line(line));
        }
        return openings;
    }

    std::vector<Core::Point> Openings::parse_line(const std::string& line) {
        std::vector<Core::Point> moves;
        for (size_t i = 0; i < line.length();) {
            if (!isalpha(line[i])) {
                i++;
                continue;
            }
            int x = tolower(line[i]) - 'a';
            i++;

            std::string num;
            while (i < line.length() && isdigit(line[i])) num += line[i++];
            if (num.empty()) break;

            int y = 0;
            try { y = std::stoi(num) - 1; } catch (...) { break; }
            moves.push_back({x, y});
        }
        return moves;
    }
}
