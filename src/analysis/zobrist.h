#pragma once

#include <cstdint>
#include <vector>
#include "../core/types.h"

namespace Arena::Analysis {

class Zobrist {
public:
    static uint64_t hash(
        const std::vector<Core::Point>& moves,
        int board_size
    );

private:
    static uint64_t mix(uint64_t value);
};

}
