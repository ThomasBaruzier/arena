#include "zobrist.h"
#include "../core/constants.h"

namespace Arena::Analysis {

uint64_t Zobrist::mix(uint64_t value) {
    value += 0x9e3779b97f4a7c15ULL;
    value = (value ^ (value >> 30)) *
        0xbf58476d1ce4e5b9ULL;
    value = (value ^ (value >> 27)) *
        0x94d049bb133111ebULL;
    return value ^ (value >> 31);
}

uint64_t Zobrist::hash(
    const std::vector<Core::Point>& moves,
    int board_size
) {
    uint64_t hash = mix(
        Core::Constants::ZOBRIST_SEED ^
        static_cast<uint32_t>(board_size)
    );

    for (size_t i = 0; i < moves.size(); ++i) {
        uint64_t token =
            static_cast<uint32_t>(moves[i].x);
        token |=
            static_cast<uint64_t>(
                static_cast<uint32_t>(moves[i].y)
            ) << 16;
        token |=
            static_cast<uint64_t>((i % 2) + 1) << 32;
        token |=
            static_cast<uint64_t>(i) << 40;

        hash = mix(hash ^ mix(token));
    }

    return hash;
}

}
