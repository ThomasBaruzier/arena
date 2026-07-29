#include "signals.h"

namespace Arena::Sys {

volatile sig_atomic_t g_stop_flag = 0;
volatile sig_atomic_t g_termination_signal = 0;

void signal_handler(int signal_number) {
    if (g_termination_signal == 0) {
        g_termination_signal = signal_number;
    }

    g_stop_flag = 1;
}

bool install_termination_handlers() {
    struct sigaction action {};
    action.sa_handler = signal_handler;
    sigemptyset(&action.sa_mask);
    action.sa_flags = 0;

    return
        sigaction(
            SIGINT,
            &action,
            nullptr
        ) == 0 &&
        sigaction(
            SIGTERM,
            &action,
            nullptr
        ) == 0;
}

}
