# Gomoku Arena

High-performance, multithreaded tournament runner for gomoku engines, featuring statistical analysis, elo calculation, and a real-time web visualization.

## Key features

* Multithreaded execution with configurable worker pool
* Elo rating and SPRT (sequential probability ratio test)
* Detailed quality metrics (critical move accuracy, blunder rate)
* Batch processing for massive tournaments
* Live web interface via docker
* Ndjson export for external analysis

## Prerequisites

* C++17 compiler (g++ recommended)
* Make
* Docker and docker compose (optional, for web view)

## Quick start

1. Build the arena binary
   `make`

2. Build the reference engine (optional)
   `make engine`

3. Run a simple match
   `./arena -1 ./bots/pbrain-p1 -2 ./bots/pbrain-p2`

4. Configure the web viewer API key
   `cp view/.env.example view/.env`
   Replace `changeme` in `view/.env`.

5. Start the web viewer
   `make view-prod`
   Access the interface at http://localhost:3000

## Documentation

* [User guide](docs/user_guide.md) - command line usage, batch modes, and configuration
* [Bot protocol](docs/bot_protocol.md) - protocol details and extensions for engine authors
* [Statistics and metrics](docs/statistics.md) - math behind elo, sprt, and quality metrics
* [Development guide](docs/development.md) - build system, testing, and architecture
