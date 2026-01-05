#include <gtest/gtest.h>
#include <csignal>

int main(int argc, char **argv) {
    signal(SIGPIPE, SIG_IGN);
    ::testing::InitGoogleTest(&argc, argv);
    return RUN_ALL_TESTS();
}
