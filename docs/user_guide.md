# User guide

## Canonical players

Player 1 is canonical slot 1 for the complete run. Player 2 is canonical slot 2.

Each pair contains two games with reversed black and white colors. Color reversal does not reverse slot ownership.

Tournament W/L/D, Elo, ERF, time, efficiency, evaluator metrics, and crashes remain attached to canonical slots.

## Players

```text
-1, --p1 <cmd>
-2, --p2 <cmd>
-e, --eval <cmd>
-L
-L1
-L2
```

`-e` enables post-move evaluator analysis.

The run records whether evaluator analysis was configured. Individual moves may still lack a valid evaluator sample.

## Board and openings

```text
-s, --size <int>
-o, --openings <file>
--shuffle-openings
-B, --force-board
```

Supported board sizes are 5 through 40.

Opening lines use compact letter-number coordinates:

```text
j10k11i9
```

Arena rejects an opening when:

- A coordinate is outside the board
- A coordinate is repeated
- A move creates a winning line

## Time controls

```text
-t, --timeout-announce <time>
-T, --timeout-cutoff <time>
-g, --timeout-game <time>
```

Player-specific forms use suffixes `1` and `2`.

Supported units are:

```text
ms
s
m
h
```

A value without a unit is interpreted as seconds.

The hard turn deadline covers the complete response. Messages, debug output, unknown responses, empty output, ignored lenient output, and stray `OK` replies do not renew it.

## Resources

```text
-j, --threads <int>
-l, --memory <size>
-N, --max-nodes <count>
-N1, --p1-max-nodes <count>
-N2, --p2-max-nodes <count>
-Ne, --eval-max-nodes <count>
```

Memory suffixes are `k`, `m`, and `g`.

Node suffixes are `k`, `m`, `b`, and `g`.

When a node limit is configured, Arena sends zero protocol time limits so node control can take precedence.

## Match control

```text
-m, --min-pairs <int>
-M, --max-pairs <int>
-r, --risk <float>
--repeat <int>
--seed <list>
```

Risk zero disables early stopping.

Comma-separated values create batch configurations. Separate player lists form a Cartesian product.

## API and output

```text
--api-url <url>
--api-key <key>
--debounce <time>
--cleanup
--export-results <file>
```

API URL and key must be supplied together.

Run status is one of:

```text
live
ended
stopped
```

`ended` means every scheduled game completed.

`stopped` means the run ended early, failed, was interrupted, or skipped scheduled games.

NDJSON contains:

- Configuration
- Whether evaluator analysis was configured
- Run status
- Slot-1 W/L/D
- Elo and ERF
- Thinking wall time
- Process CPU time
- CPU-sampled thinking wall time
- Derived efficiency
- Crash counts
- Evaluator sample counts
- CMA and blunder values

Unavailable efficiency is `null`.

## Exit status

```text
0    successful completion
1    system failure
2    player or evaluator failure
130  SIGINT
143  SIGTERM
```

System failure takes precedence over signal status. A termination signal takes precedence over an otherwise recorded player failure.

## Viewer storage

The viewer database persists across ordinary API restarts.

The viewer does not migrate older schemas. When installing a version with a new schema, stop the viewer and remove its database:

```sh
rm -rf view/data
```

An authenticated reset deletes all runs and games:

```sh
curl \
  -X DELETE \
  -H 'X-API-KEY: changeme' \
  http://localhost:3001/api/reset
```

Arena retains enough telemetry to restore active work after a reset:

- Active run declarations
- Latest active aggregate updates
- In-flight game declarations
- In-flight moves
- Unacknowledged results

Acknowledged completed games are not replayed after a reset.

## Tournament cards

A collapsed tournament card shows:

- Bot names and versions
- Slot-1 W/L/D
- Run status
- Games played

Expanding a tournament shows its statistics and game history.

If history cannot be loaded, the expanded tournament provides a Retry action.

## Tournament statistics

The matrix uses canonical rows:

```text
P1
P2
```

Without evaluator analysis, the columns are:

```text
Elo
Time
ERF
Eff
```

With evaluator analysis, CMA and Bln are appended:

```text
Elo
Time
ERF
Eff
CMA
Bln
```

CMA and Bln remain visible for an analysis-enabled run. A value without samples displays `-`. A sampled zero displays `0.0%`.

If either bot crashes, Crash replaces Time.

Long durations use compact forms:

```text
59m59s
1h00
1h07
99h59
100h+
```

## Historical games

Historical game columns are:

```text
ID
Side
Mvs
Dur
Res
```

Side is canonical slot 1's color in that game.

ID, move count, duration, and result are sortable.

Within a pair, the game where slot 1 is black appears before the game where slot 1 is white.

Selecting a row opens that game on the board. Game URLs use the numeric viewer ID:

```text
/1042
```

## Arena playback

The controls are:

```text
Replay
Play/Pause
Previous
Next
1x
2x
3x
```

Replay pauses playback and returns to the empty position.

Previous and Next step through individual moves. The speed controls choose the automatic playback rate.

The winning line is shown on the final position when the game ended with five or more stones in a row.

## Play controls

Play uses:

```text
New game
As
Time
```

Changing As selects the Player color for the next game. It does not alter the active game.

Changing Time does not restart the game or cancel a search already in progress. It applies to the next search.

The Analysis card retains the AI search history for the current game.

## Sharing and restoration

The link action in the Analysis heading copies a self-contained URL for the current game.

A shared link preserves:

- The complete position
- Player color
- Think time
- Analysis history
- Bot identity associated with the analysis

An unfinished shared game can be continued.

If the bundled bot has changed, existing analysis keeps its recorded bot identity and future AI moves use the currently bundled bot.

Play saves the current game in the browser. Reloading restores the latest position and analysis when no shared game is present.

The clipboard action copies a sectioned CSV export containing game metadata, chronological moves, and exact analysis values.
