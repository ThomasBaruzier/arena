#pragma once

#include <csignal>

namespace Arena::Sys {

extern volatile sig_atomic_t g_stop_flag;
extern volatile sig_atomic_t g_termination_signal;

void signal_handler(int signal_number);
bool install_termination_handlers();

}
