# User guide

This guide covers command-line usage, batch execution, opening files, result output, process exit status, and the live viewer.

## Command-line arguments

### Players

- `-1`, `--p1 <cmd>`: player 1 executable
- `-2`, `--p2 <cmd>`: player 2 executable
- `-e`, `--eval <cmd>`: evaluator executable
- `-L`: enable lenient output handling for both players
- `-L1`, `-L2`: enable lenient mode for one player

Player 1 is canonical slot 1 for the entire tournament. Player 2 is canonical slot 2. The two games in a pair reverse colors without changing these slot identities.

### Game configuration

- `-s`, `--size <int>`: board size from 5 through 40
- `-o`, `--openings <file>`: opening-position file
- `--shuffle-openings`: randomize opening order
- `-B`, `--force-board`: send the complete board before every move

### Time control

- `-t`, `--timeout-announce <time>`: thinking-time hint sent to both players
- `-T`, `--timeout-cutoff <time>`: hard turn deadline
- `-g`, `--timeout-game <time>`: total game time bank
- Player-specific forms use suffixes `1` and `2`, such as `-t1` and `-g2`
- Supported units are `ms`, `s`, `m`, and `h`
- A value without a unit is interpreted as seconds
- Time values must be finite and non-negative

The hard turn deadline covers the entire response. Debug messages, protocol messages, unknown responses, empty lines, stray `OK` responses, and leniently ignored output do not restart the deadline.

### Resources

- `-j`, `--threads <int>`: concurrent games
- `-l`, `--memory <size>`: memory limit for both players
- `-N`, `--max-nodes <count>`: node limit for both players
- Player-specific forms use suffixes `1` and `2`
- `-Ne`, `--eval-max-nodes <count>`: evaluator node limit
- Memory units are `k`, `m`, and `g`; a value without a unit is interpreted as MiB
- Node suffixes are `k`, `m`, `b`, and `g`
- Resource values must be finite and non-negative

### Match control

- `-m`, `--min-pairs <int>`: minimum pairs before early stopping
- `-M`, `--max-pairs <int>`: maximum pairs
- `-r`, `--risk <float>`: early-stop risk from 0 through 1
- `--repeat <int>`: repeat each generated configuration
- `--seed <list>`: comma-separated random seeds

Thread count, repeat count, and pair counts must be positive. Explicit thread counts cannot exceed detected hardware concurrency when that value is available.

A risk value of zero disables statistical and futility early stopping. The run then continues to its configured pair limit unless it is interrupted or fails.

### API and output

- `--api-url <url>`: live viewer API endpoint
- `--api-key <key>`: matching API key
- `--debounce <time>`: API update interval
- `--cleanup`: clear viewer data before starting
- `--export-results <file>`: write one NDJSON object per finalized configuration

API URL and API key must be provided together.

The current telemetry protocol uses one authoritative run status:

- `live`
- `ended`
- `stopped`

Legacy completion fields are not emitted or accepted.

### Debugging

- `-b`, `--show-board`: print the board after moves
- `-d`, `--debug`: enable verbose logging
- `--exit-on-crash`: stop on a player or evaluator failure
- `-h`, `--help`: show command help

## Batch execution

Comma-separated values create multiple configurations.

A common node list applies the same value to both players:

```sh
./arena \
  -1 ./p1 \
  -2 ./p2 \
  -N 100k,200k \
  -M 20
```

Separate player lists create a Cartesian product:

```sh
./arena \
  -1 ./p1 \
  -2 ./p2 \
  -N1 100k,200k \
  -N2 500k,1m \
  -M 20
```

`--repeat` repeats every generated configuration. Seeds are assigned by repeat index when supplied.

If a selected minimum-pair count exceeds a selected maximum-pair count, that generated run uses the maximum as its minimum.

## Opening files

Each non-empty line contains a sequence of letter-number coordinates:

```text
j10k11i9
```

Columns are letters and rows start at one. Opening syntax is strict. Whitespace, separators, missing rows, row zero, and unrelated characters are rejected.

Before games are queued, every opening is checked against the selected board size. Out-of-bounds moves and repeated coordinates are rejected.

## Results

NDJSON output contains:

- Configuration
- Canonical slot-1 W/L/D score
- Run status
- Player Elo and ERF
- Player thinking wall time
- Player process CPU time
- Thinking wall time covered by valid CPU samples
- Derived efficiency
- Crash counts
- Evaluator sample counts
- Optional CMA and blunder statistics

One line is written for each finalized batch configuration.

Efficiency is exported as `null` until positive CPU-sampled thinking wall time exists. Intervals with failed CPU samples remain part of the general thinking-time statistic but are excluded from both sides of the efficiency ratio. Efficiency is not clamped to 100%.

## Process exit status

Arena returns:

- `0` when all work completes without a recorded player, evaluator, or system failure
- `1` for an internal or system failure
- `2` when a player or evaluator failure was recorded
- `130` when interrupted by `SIGINT`
- `143` when terminated by `SIGTERM`

Internal or system failure takes precedence over interruption. A real termination signal takes precedence over an otherwise recorded player or evaluator failure.

An externally interrupted run is finalized before exit. Its NDJSON and viewer status is `stopped`.

Strict player and evaluator failures set the internal stop flag but do not set the recorded termination signal. They therefore retain the player/evaluator failure exit code instead of being reported as user interruption.

A non-strict player crash can be adjudicated as a game loss while all scheduled games continue. The run can have status `ended`, while the Arena process still returns the player-failure code because a crash occurred.

## Web visualization

The `view/` directory contains the live API and frontend.

Configure the viewer API key before starting production:

```sh
cp view/.env.example view/.env
```

Replace `changeme` in `view/.env`, then start the production viewer:

```sh
make view-prod
```

Start the development viewer with:

```sh
make view-dev
```

Run Arena with the viewer endpoint and matching key:

```sh
./arena \
  -1 ./p1 \
  -2 ./p2 \
  --api-url http://localhost:3001 \
  --api-key changeme
```

The authenticated reset endpoint remains available through `--cleanup` or a direct `DELETE /api/reset` request.

### Viewer lifecycle

Viewer storage is intentionally session-local.

Starting or restarting the API:

1. Closes any previously opened database handle.
2. Removes the SQLite database.
3. Removes its WAL and shared-memory sidecars.
4. Creates the current schema from scratch.
5. Starts with no stored runs or games.

The Docker data directory is writable runtime storage only. Its volume does not make tournament history persistent across API starts.

There is no schema migration or backward-compatible database path.

Each API database instance has a generation identifier. If that identifier changes while Arena is still running, Arena pauses ordinary telemetry and reannounces the minimum state needed to continue displaying active work:

- Active run declarations
- The latest aggregate update for each active run
- In-flight game declarations
- In-flight game moves
- Results that had not yet been acknowledged

Arena does not retain acknowledged completed games for recovery. Completed game history from before the reset or restart remains gone. Acknowledged terminal runs are also removed from recovery memory.

If replay is interrupted by a network failure, Arena keeps recovery pending and retries before resuming ordinary telemetry.

Resetting the viewer while Arena is running can therefore make the currently active tournament reappear. Stop Arena before resetting if the viewer should remain empty.

### Run status

The viewer displays one authoritative status supplied by Arena:

- `live`: games or evaluator jobs are still being processed
- `ended`: every scheduled game completed normally
- `stopped`: the run ended early, was interrupted, failed, or skipped remaining games

Progress does not determine status. A run at `20/20` can still be `stopped` if some scheduled games were skipped rather than completed.

A player crash that is adjudicated as a loss while `--exit-on-crash` is disabled does not by itself stop the tournament. Such a run can still be `ended`, with the crash reported in player statistics.

Strict-mode crashes, evaluator failures, interrupted runs, opening failures, and incomplete runs are `stopped`.
