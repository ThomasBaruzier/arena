# User guide

This guide covers the command line interface, batch execution modes, and visualization setup.

## Command line arguments

### Players
* `-1`, `--p1 <cmd>`: executable for player 1
* `-2`, `--p2 <cmd>`: executable for player 2
* `-e`, `--eval <cmd>`: executable for the evaluator engine (optional)

### Match configuration
* `-s`, `--size <int>`: board size (5-40, default: 20)
* `-M`, `--max-pairs <int>`: total pairs to play per configuration
* `-m`, `--min-pairs <int>`: minimum pairs before early termination checks
* `-o`, `--openings <file>`: path to file containing opening moves
* `--shuffle-openings`: randomize the order of openings
* `--repeat <int>`: number of times to repeat the entire configuration
* `--seed <list>`: comma-separated list of random seeds

### Time control
* `-t`, `--timeout-announce <time>`: thinking time hint sent to bots (default: 5s)
* `-T`, `--timeout-cutoff <time>`: hard limit for turn duration
* `-g`, `--timeout-game <time>`: total time bank for the game
* Note: suffixes `1` or `2` (e.g., `-t1`, `-g2`) apply settings to specific players.

### Resources
* `-j`, `--threads <int>`: number of concurrent games
* `-l`, `--memory <size>`: memory limit per bot (e.g., 512m, 1g)
* `-N`, `--max-nodes <count>`: limit search nodes for deterministic play

### Api and output
* `--api-url <url>`: endpoint for live updates
* `--api-key <key>`: authentication key for the api
* `--export-results <file>`: path to write ndjson results
* `-d`, `--debug`: enable verbose logging
* `-b`, `--show-board`: print ascii board after moves

## Batch execution

The arena supports running multiple configurations in sequence. Arguments taking lists (comma-separated) trigger batch mode.

### Diagonal expansion
If `-N` (common nodes) is provided with multiple values, both players use the same settings for each run.
Example: `-N 100k,200k` creates 2 runs:
1.  p1=100k, p2=100k
2.  p1=200k, p2=200k

### Cross product expansion
If `-N1` and `-N2` are provided separately, the arena generates every combination.
Example: `-N1 10k,20k -N2 100k` creates 2 runs:
1.  p1=10k, p2=100k
2.  p1=20k, p2=100k

## Web visualization

The `view/` directory contains a full-stack application for monitoring tournaments.

### Setup
1.  Navigate to `view/`
2.  Copy `.env.example` to `.env`
3.  Adjust ports if necessary

### Running
* Production: `make view-prod` (builds and runs optimized containers)
* Development: `make view-dev` (enables hot-reloading)

Once running, ensure the arena is started with `--api-url http://localhost:3001` (or your configured port) and the matching `--api-key`.
