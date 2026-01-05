#pragma once

#include <vector>
#include <cstdint>
#include <random>
#include "../core/constants.h"
#include "../core/types.h"

namespace Arena::Analysis {
    class Zobrist {
    public:
        static void init(int size) {
            if (!keys_.empty()) return;
            std::mt19937_64 rng(Core::Constants::ZOBRIST_SEED);
            keys_.resize(size * size * 3);
            for (auto& k : keys_) k = rng();
        }

        static uint64_t hash(const std::vector<Core::Point>& moves, int sz) {
            if (keys_.empty()) return 0;
            uint64_t h = 0;
            for (size_t i = 0; i < moves.size(); ++i) {
                int color = (i % 2) ? 1 : 2;
                int idx = color * sz * sz + (moves[i].y * sz + moves[i].x);
                if (idx >= 0 && idx < (int)keys_.size()) h ^= keys_[idx];
            }
            return h;
        }

    private:
        static std::vector<uint64_t> keys_;
    };
}
