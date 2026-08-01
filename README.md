# Gomoku Arena

Gomoku Arena is a multithreaded tournament runner with paired color reversal, result statistics, optional evaluator analysis, process-efficiency measurement, NDJSON output, and a live web viewer.

## Features

- Concurrent paired games
- Canonical slot-1 and slot-2 ownership across color reversal
- Elo and ERF result summaries
- Optional sequential early stopping
- Aggregate process CPU efficiency
- Optional critical move accuracy and blunder rate
- Crash tracking
- Strict time and resource controls
- NDJSON export
- Live Arena viewer

## Requirements

- C++17 compiler
- Make
- libcurl
- Docker and Docker Compose for the viewer
- Python 3 for the opening-script tests

## Build

```sh
make
```

Build the bundled reference engine:

```sh
make engine
```

Run all Arena tests:

```sh
make test
```

## Run

```sh
./arena \
  -1 ./bots/pbrain-alpha \
  -2 ./bots/pbrain-beta
```

A typical configured tournament is:

```sh
./arena \
  -1 ./bots/pbrain-alpha \
  -2 ./bots/pbrain-beta \
  -o misc/openings.txt \
  -t 5s \
  -T 12s \
  -M 100 \
  --export-results results.ndjson
```

Enable evaluator analysis:

```sh
./arena \
  -1 ./bots/pbrain-alpha \
  -2 ./bots/pbrain-beta \
  -e ./pbrain-rapfi \
  -Ne 2m
```

## Viewer

Create the viewer environment file:

```sh
cp view/.env.example view/.env
```

Set `API_KEY`, then start the production viewer:

```sh
make view-prod
```

Open <http://localhost:3000>.

Connect Arena to the API:

```sh
./arena \
  -1 ./bots/pbrain-alpha \
  -2 ./bots/pbrain-beta \
  --api-url http://localhost:3001 \
  --api-key changeme
```

The telemetry protocol is strict. Game results carry one explicit reason:

```text
line
draw
adjudication
void
```

The viewer accepts batches atomically. A permanent protocol rejection, malformed success response, missing generation header, hard telemetry queue exhaustion, or failed final delivery makes an API-enabled Arena run exit with a system failure.

The viewer database persists across ordinary API restarts.

The viewer uses one strict schema and has no migration path. When the schema changes, stop the viewer and wipe `view/data/` once before starting the new version.

An explicit authenticated reset deletes all viewer runs and games and rotates the internal viewer generation. Arena can replay active run declarations and in-flight game state after a reset. Acknowledged completed game history is not retained by Arena for replay.

Viewer generation is internal. Game URLs remain clean numeric routes:

```text
https://example.com/1042
```

## Documentation

- [User guide](docs/user_guide.md)
- [Bot protocol](docs/bot_protocol.md)
- [Statistics](docs/statistics.md)
- [Development guide](docs/development.md)
