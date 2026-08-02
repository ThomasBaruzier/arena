#include "cpu_monitor.h"
#include "../core/constants.h"
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <unistd.h>

namespace Arena::Sys {

CpuMonitor::Times CpuMonitor::get_times(pid_t pid) {
    if (pid <= 0) {
        return {};
    }

    char path[Core::Constants::PATH_BUFFER_SIZE];

    std::snprintf(path, sizeof(path), "/proc/%d/stat", pid);

    FILE* file = std::fopen(path, "r");

    if (!file) {
        return {};
    }

    char buffer[Core::Constants::PROC_STAT_BUFFER_SIZE];

    if (!std::fgets(buffer, sizeof(buffer), file)) {
        std::fclose(file);
        return {};
    }

    std::fclose(file);

    char* cursor = std::strrchr(buffer, ')');

    if (!cursor) {
        return {};
    }

    ++cursor;

    while (*cursor == ' ') {
        ++cursor;
    }

    if (!*cursor) {
        return {};
    }

    ++cursor;

    unsigned long user_ticks = 0;
    unsigned long system_ticks = 0;
    bool have_user = false;
    bool have_system = false;
    int field = Core::Constants::PROC_STAT_FIELD_COUNT_MIN;

    while (
        *cursor &&
        field <= Core::Constants::PROC_STAT_FIELD_COUNT_MAX
    ) {
        while (*cursor == ' ') {
            ++cursor;
        }

        if (!*cursor) {
            break;
        }

        char* next = nullptr;
        long long value = std::strtoll(cursor, &next, 10);

        if (next == cursor) {
            break;
        }

        cursor = next;

        if (field == Core::Constants::PROC_UTIME_FIELD) {
            if (value < 0) {
                return {};
            }

            user_ticks = static_cast<unsigned long>(value);
            have_user = true;
        } else if (field == Core::Constants::PROC_STIME_FIELD) {
            if (value < 0) {
                return {};
            }

            system_ticks = static_cast<unsigned long>(value);
            have_system = true;
        }

        ++field;
    }

    if (!have_user || !have_system) {
        return {};
    }

    static long clock_ticks = sysconf(_SC_CLK_TCK);

    if (clock_ticks <= 0) {
        clock_ticks = Core::Constants::DEFAULT_CLK_TCK;
    }

    return {
        static_cast<long>(user_ticks * 1000 / clock_ticks),
        static_cast<long>(system_ticks * 1000 / clock_ticks),
        true
    };
}

double CpuMonitor::calculate_load(
    const Times& start,
    const Times& end,
    long wall_ms
) {
    if (!start.valid || !end.valid || wall_ms <= 0) {
        return 0.0;
    }

    long cpu_delta = end.total_ms() - start.total_ms();

    if (cpu_delta < 0) {
        return 0.0;
    }

    return
        static_cast<double>(cpu_delta) *
        100.0 /
        static_cast<double>(wall_ms);
}

}
