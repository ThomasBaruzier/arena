# Development guide

## Build system

The project uses a standard makefile.

- `make`: builds the Arena binary.
- `make engine`: builds the reference Rapfi engine.
- `make test`: runs unit and integration tests.
- `make cov`: generates a line-coverage report using `gcov`.
- `make clean`: removes build artifacts.

## Project structure

- `src/app/`: application entry point, CLI, run state, and worker scheduling.
- `src/core/`: configuration types, constants, logging, and utilities.
- `src/game/`: referee, bot process protocol, openings, and rules.
- `src/analysis/`: evaluator integration and position cache.
- `src/net/`: strict API delivery and JSON serialization.
- `src/stats/`: Elo, ERF, SPRT, timing, and evaluator metrics.
- `src/sys/`: process, signal, and CPU monitoring.
- `tests/`: native, shell, and Python tests.
- `view/`: Node.js viewer API and React client.

## Runtime architecture

1. `RunContext` owns canonical run state and statistics.
2. Worker threads interleave game turns and evaluator jobs.
3. `Referee` owns game termination semantics and emits explicit result reasons.
4. `ApiManager` batches strict lossless game telemetry and replaceable aggregate updates.
5. The viewer validates and commits complete batches atomically.

## Result contract

Every result has one explicit reason:

- `line`: the final move creates the declared winner's first winning line.
- `draw`: the board is full and no earlier winner exists.
- `adjudication`: a player wins because the opponent failed.
- `void`: the game ended without a valid board result.

The transport serializes the reason supplied by the referee. It does not infer terminal semantics from the move string.

## Telemetry delivery

Live aggregate updates may be coalesced or dropped at the soft queue limit.

A terminal run update supersedes queued live aggregate updates for the same run. Updates belonging to other runs remain queued.

These events are lossless:

- Run declarations
- Game declarations
- Moves
- Results
- Terminal run updates

Lossless events may exceed the soft queue limit. A separate hard limit bounds memory. Reaching it permanently fails telemetry.

Delivery failures are classified as:

- Delivered
- Retryable
- Permanent

Transport failures, rate limits, request timeouts, and server failures are retryable. Other client errors, malformed successful responses, and missing viewer generation headers are permanent.

A successful viewer response must include the viewer generation header and, apart from optional leading or trailing whitespace, the exact acknowledgement:

```json
{"success":true}
```

When API output is configured, permanent telemetry failure marks every active run failed, stops further task scheduling, wakes waiting workers, and produces a system-failure process exit.

## Testing

- Native tests: `make test-cpp`
- Shell integration: `make test-sh`
- Opening-script tests: `make test-py`
- Viewer server: `cd view/server && npm test`
- Viewer client: `cd view/client && npm test`
