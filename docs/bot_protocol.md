# Bot protocol

The arena uses a variation of the gomocup protocol. Engines communicate via standard input and output.

## Standard commands

### Initialization
* `START <size>`: initialize board of given size. Engine must reply `OK`.
* `INFO <key> <value>`: configuration parameters.
* `ABOUT`: request engine name and version.

### Gameplay
* `BEGIN`: command to play the first move (black).
* `TURN <x>,<y>`: opponent move. Engine must reply with `<x>,<y>`.
* `BOARD`: set up a board state. Followed by lines of `x,y,color` and terminated by `DONE`.
* `END`: terminate the engine.

## Arena extensions

The arena sends additional `INFO` commands to provide more context.

### Time control
* `INFO timeout_turn <ms>`: soft limit for move generation.
* `INFO timeout_match <ms>`: total time bank remaining.
* `INFO time_left <ms>`: sent before every move if game timeout is active.

### Resource limits
* `INFO max_memory <bytes>`: memory limit in bytes.
* `INFO MAX_NODE <count>`: strict node count limit. If set, time controls are effectively disabled to ensure deterministic behavior.

### Miscellaneous
* `INFO game_type 1`: always 1 (gomoku).
* `INFO rule 0`: always 0 (standard gomoku).
* `INFO THREAD_NUM 1`: engines are forced to single-threaded mode.

## Evaluator protocol

If an evaluator engine is configured (`-e`), it must support specific analysis commands.

### State transfer
* `YXBOARD`: similar to `BOARD` but used specifically for analysis context.
* Format: lines of `x,y,color` (1=black, 2=white), terminated by `DONE`.

### Analysis
* `ANALYZE_MOVE <x>,<y>`: request analysis of a specific move.
* Response: `EVAL_DATA <p_best> <p_second> <p_played>`
  * `p_best`: win probability of the best move found.
  * `p_second`: win probability of the second best move.
  * `p_played`: win probability of the move actually played.
