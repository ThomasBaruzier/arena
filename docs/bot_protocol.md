# Bot protocol

Arena uses the Gomocup protocol over standard input and output. Each command and response is line-oriented.

## Standard commands

### Initialization

- `START <size>` initializes an empty board. The engine must reply `OK`.
- `INFO <key> <value>` supplies configuration.
- `ABOUT` requests engine metadata.

A valid `ABOUT` response can include:

```text
name="Engine", version="1.0", author="Author"
```

### Gameplay

- `BEGIN` requests the first move on an empty board.
- `TURN <x>,<y>` supplies the opponent's latest move and requests a move.
- `BOARD` supplies the complete current position and requests a move.
- `END` requests process termination.

A move response is:

```text
<x>,<y>
```

Coordinates are zero-based.

## BOARD perspective

`BOARD` is followed by zero or more position lines and a final `DONE` line:

```text
BOARD
<x>,<y>,<stone>
<x>,<y>,<stone>
DONE
```

Stone values are relative to the engine receiving the command:

- `1` is the receiving engine's stone.
- `2` is the opponent's stone.

They are not absolute black and white values.

For example, if the receiving engine is white, an existing black move is sent as `2` and an existing white move is sent as `1`.

Position lines are sent in move order. After `DONE`, the engine must return its move.

## Arena extensions

Arena sends additional `INFO` commands.

### Time control

- `INFO timeout_turn <ms>` supplies the thinking-time hint.
- `INFO timeout_match <ms>` supplies the configured game time bank.
- `INFO time_left <ms>` supplies the remaining game time before a turn.

The hard Arena turn cutoff covers the complete turn-producing response. Empty output, `MESSAGE`, `DEBUG`, `UNKNOWN`, leniently ignored output, and stray `OK` replies do not restart or extend the deadline.

### Resource limits

- `INFO max_memory <bytes>` supplies the memory limit.
- `INFO MAX_NODE <count>` supplies a strict node limit.

When a node limit is active, Arena sends zero time limits so deterministic node control can take precedence.

### General configuration

- `INFO game_type 1`
- `INFO rule 0`
- `INFO THREAD_NUM 1`

Engines may ignore unsupported `INFO` keys.

## Engine output

Arena recognizes these non-move responses while waiting:

- `MESSAGE <text>`
- `DEBUG <text>`
- `UNKNOWN <text>`

They do not count as a move and do not renew the response deadline.

Without lenient mode, other malformed turn output is treated as an invalid move. With lenient mode, malformed output is ignored until a valid response arrives or the original deadline expires.

## Evaluator protocol

An evaluator configured with `-e` must support the following commands.

### State transfer

`YXBOARD` supplies the analysis position:

```text
YXBOARD
<x>,<y>,<color>
<x>,<y>,<color>
DONE
```

Evaluator colors are absolute move-order colors:

- `1` is black.
- `2` is white.

### Analysis

Arena requests analysis with:

```text
ANALYZE_MOVE <x>,<y>
```

The evaluator responds:

```text
EVAL_DATA <p_best> <p_second> <p_played>
```

Each probability must be finite and between zero and one:

- `p_best` is the estimated win probability of the best move.
- `p_second` is the estimated win probability of the second-best move.
- `p_played` is the estimated win probability of the move played.
