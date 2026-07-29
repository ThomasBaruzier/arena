# Gomoku Arena

High-performance, multithreaded tournament runner for Gomoku engines, featuring statistical analysis, Elo calculation, and a real-time web visualization.

## Key features

- Multithreaded execution with configurable worker pool
- Elo rating and SPRT sequential result checks
- Result significance through ERF
- Aggregate process efficiency measurement
- Optional critical move accuracy and blunder analysis
- Batch processing for large tournaments
- Live web interface through Docker
- NDJSON export for external analysis

## Prerequisites

- C++17 compiler (`g++` recommended)
- Make
- Docker and Docker Compose, optionally, for the web viewer

## Quick start

1. Build the Arena binary:

   ```sh
   make
   ```

2. Build the reference engine, optionally:

   ```sh
   make engine
   ```

3. Run a simple match:

   ```sh
   ./arena \
     -1 ./bots/pbrain-p1 \
     -2 ./bots/pbrain-p2
   ```

4. Configure the web viewer API key:

   ```sh
   cp view/.env.example view/.env
   ```

   Replace `changeme` in `view/.env`.

5. Start the production viewer:

   ```sh
   make view-prod
   ```

   Open <http://localhost:3000>.

> The live viewer is intentionally ephemeral. Its API recreates the SQLite
> database whenever the API process starts, so stored runs and games do not
> survive an API restart. If Arena is still running, it can reannounce only
> its active run state and in-flight games. Completed game history from before
> the restart is intentionally not restored.

## Documentation

- [User guide](docs/user_guide.md): command-line usage, batch modes, openings, output, and viewer operation
- [Bot protocol](docs/bot_protocol.md): protocol details and extensions for engine authors
- [Statistics and metrics](docs/statistics.md): Elo, ERF, SPRT, efficiency, and quality metrics
- [Development guide](docs/development.md): build system, testing, and architecture
