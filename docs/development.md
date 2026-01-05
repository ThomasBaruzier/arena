# Development guide

## Build system

The project uses a standard makefile.

* `make`: builds the arena binary.
* `make engine`: builds the reference rapfi engine (requires cmake).
* `make test`: runs unit and integration tests.
* `make cov`: generates code coverage reports (requires lcov).
* `make clean`: removes build artifacts.

## Project structure

* `src/`: core source code.
  * `app/`: application entry point, cli, and worker logic.
  * `core/`: configuration types, constants, and utilities.
  * `game/`: referee logic, player process management, and rules.
  * `analysis/`: evaluator integration and zobrist hashing.
  * `net/`: api client and json serialization.
  * `stats/`: elo, sprt, and metrics tracking.
  * `sys/`: os-specific code (process forking, signals, cpu monitoring).
* `tests/`: google test suite and shell scripts.
* `view/`: web visualization (node.js backend, react frontend).

## Architecture

1. Context: the `RunContext` holds shared state (stats, config) for a batch of games.
2. Workers: a pool of threads (`src/app/worker.cpp`) consumes tasks from global queues.
3. Referee: manages a single game lifecycle, enforcing rules and time limits.
4. Process: wraps `fork` and `exec` to manage engine subprocesses safely.

## Testing

* Unit tests: located in `tests/unit/`. Run via `make test-cpp`.
* Integration tests: shell scripts in `tests/test_arena.sh`. Run via `make test-sh`.
* Mocking: `tests/mocks/` contains mock implementations for curl and processes.
