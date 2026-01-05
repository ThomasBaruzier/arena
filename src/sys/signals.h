#pragma once

#include <csignal>

namespace Arena::Sys {
    extern volatile sig_atomic_t g_stop_flag;
    void signal_handler(int);
}
