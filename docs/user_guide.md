# User guide

This guide covers command-line usage, batch execution, opening files, and the live viewer.

## Command-line arguments

### Players

* `-1`, `--p1 <cmd>`: player 1 executable
* `-2`, `--p2 <cmd>`: player 2 executable
* `-e`, `--eval <cmd>`: evaluator executable
* `-L`: enable lenient output handling for both players
* `-L1`, `-L2`: enable lenient output handling for one player

### Game configuration

* `-s`, `--size <int>`: board size from 5 through 40
* `-o`, `--openings <file>`: opening positions file
* `--shuffle-openings`: randomize opening order
* `-B`, `--force-board`: send the complete board before every move

### Time control

* `-t`, `--timeout-announce <time>`: thinking-time hint sent to both players
* `-T`, `--timeout-cutoff <time>`: hard turn deadline
* `-g`, `--timeout-game <time>`: total game time bank
* Player-specific forms use suffixes `1` and `2`, such as `-t1` and `-g2`
* Supported units are `ms`, `s`, `m`, and `h`
* A value without a unit is interpreted as seconds
* Time values must be finite and non-negative

### Resources

* `-j`, `--threads <int>`: concurrent games
* `-l`, `--memory <size>`: memory limit for both players
* `-N`, `--max-nodes <count>`: node limit for both players
* Player-specific forms use suffixes `1` and `2`
* `-Ne`, `--eval-max-nodes <count>`: evaluator node limit
* Memory units are `k`, `m`, and `g`; a value without a unit is interpreted as MiB
* Node suffixes are `k`, `m`, `b`, and `g`
* Resource values must be finite and non-negative

### Match control

* `-m`, `--min-pairs <int>`: minimum pairs before early stopping
* `-M`, `--max-pairs <int>`: maximum pairs
* `-r`, `--risk <float>`: early-stop risk from 0 through 1
* `--repeat <int>`: repeat each generated configuration
* `--seed <list>`: comma-separated random seeds

Thread count, repeat count, and pair counts must be positive. Explicit thread counts cannot exceed detected hardware concurrency when that value is available.

### API and output

* `--api-url <url>`: live viewer API endpoint
* `--api-key <key>`: matching API key
* `--debounce <time>`: API update interval
* `--cleanup`: clear viewer data before starting
* `--export-results <file>`: write one NDJSON object per completed configuration

API URL and API key must be provided together.

### Debugging

* `-b`, `--show-board`: print the board after moves
* `-d`, `--debug`: enable verbose logging
* `--exit-on-crash`: stop on a player or evaluator failure
* `-h`, `--help`: show command help

## Batch execution

Comma-separated values create multiple configurations.

A common node list applies the same value to both players:

```sh
./arena -1 ./p1 -2 ./p2 -N 100k,200k -M 20
```

Separate player lists create a Cartesian product:

```sh
./arena -1 ./p1 -2 ./p2 -N1 100k,200k -N2 500k,1m -M 20
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

NDJSON output contains configuration, score, timing, evaluator metrics, and slot-specific statistics. One line is written for each completed batch configuration.

## Web visualization

The `view/` directory contains the live API and frontend.

Start the production viewer with:

```sh
make view-prod
```

Start the development viewer with:

```sh
make view-dev
```

Run arena with the viewer endpoint and matching key:

```sh
./arena \
  -1 ./p1 \
  -2 ./p2 \
  --api-url http://localhost:3001 \
  --api-key changeme
```
