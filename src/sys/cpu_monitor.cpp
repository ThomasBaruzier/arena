#include "cpu_monitor.h"
#include <cstdio>
#include <cstring>
#include <cstdlib>
#include <unistd.h>
#include "../core/constants.h"

namespace Arena::Sys {

    CpuMonitor::Times CpuMonitor::get_times(pid_t pid) {
        if (pid <= 0) return {0, 0};

        char path[Core::Constants::PATH_BUFFER_SIZE];
        snprintf(path, sizeof(path), "/proc/%d/stat", pid);

        FILE* f = fopen(path, "r");
        if (!f) return {0, 0};

        char buf[Core::Constants::PROC_STAT_BUFFER_SIZE];
        if (!fgets(buf, sizeof(buf), f)) {
            fclose(f);
            return {0, 0};
        }
        fclose(f);

        char* p = strrchr(buf, ')');
        if (!p) return {0, 0};
        p++;

        while (*p == ' ') p++;
        if (*p) p++;

        unsigned long utime = 0, stime = 0;
        int field = Core::Constants::PROC_STAT_FIELD_COUNT_MIN;

        while (*p && field <= Core::Constants::PROC_STAT_FIELD_COUNT_MAX) {
            while (*p == ' ') p++;
            if (!*p) break;

            char* next_p;
            unsigned long val = strtoul(p, &next_p, 10);
            if (p == next_p) break;
            p = next_p;

            if (field == Core::Constants::PROC_UTIME_FIELD)
                utime = val;
            else if (field == Core::Constants::PROC_STIME_FIELD)
                stime = val;

            field++;
        }

        static long clk_tck = sysconf(_SC_CLK_TCK);
        if (clk_tck <= 0)
            clk_tck = Core::Constants::DEFAULT_CLK_TCK;

        return {
            (long)(utime * 1000 / clk_tck),
            (long)(stime * 1000 / clk_tck)
        };
    }

    double CpuMonitor::calculate_load(
        const Times& start, const Times& end, long wall_ms)
    {
        if (wall_ms <= 0) return 0.0;
        long cpu_delta = (end.user_ms - start.user_ms) +
            (end.sys_ms - start.sys_ms);
        return (double)cpu_delta * 100.0 / static_cast<double>(wall_ms);
    }
}
