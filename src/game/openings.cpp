#include "openings.h"
#include "rules.h"
#include <fstream>
#include <limits>
#include <stdexcept>

namespace Arena::Game {

std::vector<std::vector<Core::Point>> Openings::load(
    const std::string& path
) {
    std::ifstream file(path);

    if (!file.is_open()) {
        throw std::runtime_error("Cannot open openings: " + path);
    }

    std::vector<std::vector<Core::Point>> openings;
    std::string line;
    size_t line_number = 0;

    while (std::getline(file, line)) {
        ++line_number;

        if (!line.empty() && line.back() == '\r') {
            line.pop_back();
        }

        if (line.empty()) {
            continue;
        }

        try {
            openings.push_back(parse_line(line));
        } catch (const std::exception& error) {
            throw std::runtime_error(
                "Invalid opening at line " +
                std::to_string(line_number) +
                ": " +
                error.what()
            );
        }
    }

    return openings;
}

std::vector<Core::Point> Openings::parse_line(const std::string& line) {
    std::vector<Core::Point> moves;
    size_t position = 0;

    while (position < line.size()) {
        unsigned char column = static_cast<unsigned char>(line[position]);
        bool lowercase = column >= 'a' && column <= 'z';
        bool uppercase = column >= 'A' && column <= 'Z';

        if (!lowercase && !uppercase) {
            throw std::runtime_error("expected column letter");
        }

        int x = lowercase ? column - 'a' : column - 'A';

        ++position;

        size_t row_start = position;

        while (
            position < line.size() &&
            line[position] >= '0' &&
            line[position] <= '9'
        ) {
            ++position;
        }

        if (row_start == position) {
            throw std::runtime_error("expected row number");
        }

        std::string row_text = line.substr(row_start, position - row_start);
        size_t consumed = 0;
        long long row = std::stoll(row_text, &consumed);

        if (
            consumed != row_text.size() ||
            row < 1 ||
            row > static_cast<long long>(std::numeric_limits<int>::max())
        ) {
            throw std::runtime_error("invalid row number");
        }

        moves.push_back({
            x,
            static_cast<int>(row - 1)
        });
    }

    if (moves.empty()) {
        throw std::runtime_error("opening is empty");
    }

    return moves;
}

void Openings::validate(
    const std::vector<Core::Point>& opening,
    int board_size
) {
    if (opening.empty()) {
        throw std::runtime_error("Opening is empty");
    }

    if (board_size <= 0) {
        throw std::runtime_error("Invalid board size");
    }

    std::vector<int> board(
        static_cast<size_t>(board_size) *
            static_cast<size_t>(board_size),
        0
    );

    for (size_t index = 0; index < opening.size(); ++index) {
        const auto& move = opening[index];

        if (
            move.x < 0 ||
            move.x >= board_size ||
            move.y < 0 ||
            move.y >= board_size
        ) {
            throw std::runtime_error(
                "Opening move " +
                std::to_string(index + 1) +
                " is out of bounds"
            );
        }

        size_t cell =
            static_cast<size_t>(move.y) * static_cast<size_t>(board_size) +
            static_cast<size_t>(move.x);

        if (board[cell] != 0) {
            throw std::runtime_error(
                "Opening move " +
                std::to_string(index + 1) +
                " repeats an occupied coordinate"
            );
        }

        int color = static_cast<int>(index % 2) + 1;

        board[cell] = color;

        if (
            Rules::check_win(
                board,
                board_size,
                move.x,
                move.y,
                color
            )
        ) {
            throw std::runtime_error(
                "Opening move " +
                std::to_string(index + 1) +
                " creates a terminal position"
            );
        }
    }
}

}
