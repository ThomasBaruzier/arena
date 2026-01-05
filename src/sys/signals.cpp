#include "signals.h"

namespace Arena::Sys {
    volatile sig_atomic_t g_stop_flag = 0;
    void signal_handler(int) { g_stop_flag = 1; }
}
