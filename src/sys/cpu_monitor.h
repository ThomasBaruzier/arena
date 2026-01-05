#pragma once

#include <sys/types.h>

namespace Arena::Sys {

    class CpuMonitor {
    public:
        struct Times { long user_ms; long sys_ms; };
        static Times get_times(pid_t pid);
        static double calculate_load(
            const Times& start, const Times& end, long wall_ms
        );
    };
}
