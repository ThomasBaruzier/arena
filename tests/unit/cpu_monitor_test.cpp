#include "../common/test_utils.h"
#include "../src/sys/cpu_monitor.h"

using namespace Arena;

TEST(CpuMonitorTest, BasicUsage) {
    auto times =
        Sys::CpuMonitor::get_times(
            getpid()
        );

    EXPECT_TRUE(times.valid);
    EXPECT_GE(times.user_ms, 0);
    EXPECT_GE(times.sys_ms, 0);
}

TEST(CpuMonitorTest, InvalidPidsAreExplicitlyInvalid) {
    for (
        pid_t pid :
        {
            static_cast<pid_t>(-1),
            static_cast<pid_t>(0),
            static_cast<pid_t>(
                999999999
            )
        }
    ) {
        auto times =
            Sys::CpuMonitor::
                get_times(pid);

        EXPECT_FALSE(times.valid);
        EXPECT_EQ(times.user_ms, 0);
        EXPECT_EQ(times.sys_ms, 0);
    }
}

TEST(CpuMonitorTest, LoadCalculation) {
    Sys::CpuMonitor::Times start{
        100,
        100,
        true
    };

    Sys::CpuMonitor::Times end{
        150,
        150,
        true
    };

    EXPECT_NEAR(
        Sys::CpuMonitor::
            calculate_load(
                start,
                end,
                200
            ),
        50.0,
        1.0
    );
}

TEST(CpuMonitorTest, InvalidSamplesHaveNoLoad) {
    Sys::CpuMonitor::Times invalid;
    Sys::CpuMonitor::Times valid{
        150,
        150,
        true
    };

    EXPECT_DOUBLE_EQ(
        Sys::CpuMonitor::
            calculate_load(
                invalid,
                valid,
                200
            ),
        0.0
    );

    EXPECT_DOUBLE_EQ(
        Sys::CpuMonitor::
            calculate_load(
                valid,
                invalid,
                200
            ),
        0.0
    );
}

TEST(CpuMonitorTest, NonpositiveWallHasNoLoad) {
    Sys::CpuMonitor::Times start{
        100,
        100,
        true
    };

    Sys::CpuMonitor::Times end{
        150,
        150,
        true
    };

    EXPECT_DOUBLE_EQ(
        Sys::CpuMonitor::
            calculate_load(
                start,
                end,
                0
            ),
        0.0
    );

    EXPECT_DOUBLE_EQ(
        Sys::CpuMonitor::
            calculate_load(
                start,
                end,
                -10
            ),
        0.0
    );
}

TEST(CpuMonitorTest, CounterRegressionHasNoLoad) {
    Sys::CpuMonitor::Times start{
        200,
        200,
        true
    };

    Sys::CpuMonitor::Times end{
        100,
        100,
        true
    };

    EXPECT_DOUBLE_EQ(
        Sys::CpuMonitor::
            calculate_load(
                start,
                end,
                100
            ),
        0.0
    );
}

TEST(CpuMonitorTest, HighLoadScenario) {
    Sys::CpuMonitor::Times start{
        0,
        0,
        true
    };

    Sys::CpuMonitor::Times end{
        200,
        200,
        true
    };

    EXPECT_NEAR(
        Sys::CpuMonitor::
            calculate_load(
                start,
                end,
                100
            ),
        400.0,
        1.0
    );
}
