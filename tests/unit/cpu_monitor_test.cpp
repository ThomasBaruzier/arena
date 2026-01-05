#include "../common/test_utils.h"
#include "../src/sys/cpu_monitor.h"

using namespace Arena;

TEST(CpuMonitorTest, BasicUsage) {
    auto times = Sys::CpuMonitor::get_times(getpid());
    EXPECT_GE(times.user_ms, 0);
    EXPECT_GE(times.sys_ms, 0);
}

TEST(CpuMonitorTest, InvalidPid) {
    auto times = Sys::CpuMonitor::get_times(-1);
    EXPECT_EQ(times.user_ms, 0);
    EXPECT_EQ(times.sys_ms, 0);
}

TEST(CpuMonitorTest, ZeroPid) {
    auto times = Sys::CpuMonitor::get_times(0);
    EXPECT_EQ(times.user_ms, 0);
    EXPECT_EQ(times.sys_ms, 0);
}

TEST(CpuMonitorTest, LoadCalculation) {
    Sys::CpuMonitor::Times start{100, 100};
    Sys::CpuMonitor::Times end{150, 150};
    double load = Sys::CpuMonitor::calculate_load(start, end, 200);
    EXPECT_NEAR(load, 50.0, 1.0);
}

TEST(CpuMonitorTest, LoadCalculationZeroWallTime) {
    Sys::CpuMonitor::Times start{100, 100};
    Sys::CpuMonitor::Times end{150, 150};
    double load = Sys::CpuMonitor::calculate_load(start, end, 0);
    EXPECT_DOUBLE_EQ(load, 0.0);
}

TEST(CpuMonitorTest, LoadCalculationNegativeWallTime) {
    Sys::CpuMonitor::Times start{100, 100};
    Sys::CpuMonitor::Times end{150, 150};
    double load = Sys::CpuMonitor::calculate_load(start, end, -10);
    EXPECT_DOUBLE_EQ(load, 0.0);
}

TEST(CpuMonitorTest, HighLoadScenario) {
    Sys::CpuMonitor::Times start{0, 0};
    Sys::CpuMonitor::Times end{200, 200};
    double load = Sys::CpuMonitor::calculate_load(start, end, 100);
    EXPECT_NEAR(load, 400.0, 1.0);
}

TEST(CpuMonitorTest, NonExistentPid) {
    auto times = Sys::CpuMonitor::get_times(999999999);
    EXPECT_EQ(times.user_ms, 0);
    EXPECT_EQ(times.sys_ms, 0);
}
