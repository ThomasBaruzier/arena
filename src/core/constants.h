#pragma once

#include <cstdint>
#include <cstddef>

namespace Arena::Core::Constants {
    constexpr int DEFAULT_THREADS = 4;
    constexpr int DEFAULT_CLK_TCK = 100;

    constexpr int EXIT_CODE_SUCCESS = 0;
    constexpr int EXIT_CODE_SYSTEM_FAILURE = 1;
    constexpr int EXIT_CODE_BOT_FAILURE = 2;
    constexpr int EXIT_CODE_CRITICAL_FAILURE = 3;
    constexpr int EXIT_CODE_EXEC_FAILED = 127;

    constexpr int DEFAULT_BOARD_SIZE = 20;
    constexpr int WINNING_LENGTH = 5;

    constexpr int DEFAULT_MIN_PAIRS = 5;
    constexpr int DEFAULT_MAX_PAIRS = 10;
    constexpr double DEFAULT_RISK = 0.0;

    constexpr int DEFAULT_TIMEOUT_TURN_MS = 5000;
    constexpr int MIN_TURN_TIMEOUT_MS = 10;
    constexpr int META_TIMEOUT_MS = 3000;
    constexpr int POLL_TIMEOUT_MS = 100;
    constexpr int WRITE_TIMEOUT_MS = 500;
    constexpr int TERMINATION_GRACE_MS = 100;
    constexpr int WORKER_IDLE_WAIT_MS = 500;
    constexpr int PROGRESS_LOG_INTERVAL_MS = 5000;

    constexpr int ELO_BASE = 1000;
    constexpr double ELO_INITIAL_RATING = 1000.0;
    constexpr int ELO_K_FACTOR = 32;
    constexpr double ELO_DIVISOR = 400.0;

    constexpr int MAX_NAME_LENGTH = 16;
    constexpr int MAX_VERSION_LENGTH = 8;
    constexpr double ENGINE_CUTOFF_FACTOR = 2.0;
    constexpr int ENGINE_CUTOFF_PLUS_MS = 1500;
    constexpr int DEFAULT_MAX_NODE_TIMEOUT = 60000;

    constexpr int PROTOCOL_GAME_TYPE = 1;
    constexpr int PROTOCOL_RULE = 0;
    constexpr int PROTOCOL_THREAD_NUM = 1;

    constexpr uint64_t DEFAULT_EVAL_NODES = 15000000;
    constexpr int DEFAULT_EVAL_CUTOFF_MS = 30000;
    constexpr double METRIC_CRITICAL_SHARPNESS = 0.05;
    constexpr double METRIC_CRITICAL_SUCCESS_REGRET = 0.02;
    constexpr double METRIC_SEVERE_ERROR_REGRET = 0.20;
    constexpr double METRIC_WEIGHT_SHARPNESS_FACTOR = 10.0;
    constexpr double GARBAGE_TIME_PROB_THRESHOLD = 0.05;

    constexpr double PAIR_RESULT_UNSET = -5.0;
    constexpr double PAIR_RESULT_THRESHOLD = -1.5;

    constexpr int API_TIMEOUT_SEC = 10;
    constexpr size_t API_QUEUE_MAX = 5000;
    constexpr int API_BACKOFF_MIN_SEC = 2;
    constexpr int API_BACKOFF_MAX_SEC = 10;
    constexpr int API_SHUTDOWN_MAX_RETRIES = 3;
    constexpr int API_SHUTDOWN_BACKOFF_SEC = 1;

    constexpr uint64_t ZOBRIST_SEED = 12345;
    constexpr long long PROCESS_MEMORY_OVERHEAD = 128 * 1048576;
    constexpr size_t PROCESS_BUFFER_MAX = 262144;
    constexpr size_t CACHE_MAX_SIZE = 1048576;
    constexpr size_t READ_BUFFER_SIZE = 4096;
    constexpr int PATH_BUFFER_SIZE = 64;
    constexpr int PROC_STAT_BUFFER_SIZE = 4096;

    constexpr int EXIT_CHECK_INTERVAL_MS = 2;
    constexpr int EXIT_CHECK_RETRIES = 5;
    constexpr int PROC_STAT_FIELD_COUNT_MIN = 4;
    constexpr int PROC_STAT_FIELD_COUNT_MAX = 15;
    constexpr int PROC_UTIME_FIELD = 14;
    constexpr int PROC_STIME_FIELD = 15;
}
