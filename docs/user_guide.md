# User guide

## Canonical players

Player 1 is canonical slot 1 for the complete run. Player 2 is canonical slot 2.

Each pair contains two games with reversed black and white colors. Color reversal does not reverse slot ownership.

Displayed tournament W/L/D, Elo, ERF, time, efficiency, evaluator metrics, and crashes remain attached to canonical slots.

## Players

```text
-1, --p1 <cmd>
-2, --p2 <cmd>
-e, --eval <cmd>
-L
-L1
-L2
```

`-e` enables post-move evaluator analysis for the run.

The run declaration carries an immutable `analysis_enabled` value. It reflects configuration, not whether an evaluator process later remains available.

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

Every opening is validated before games are queued. Arena rejects an opening when:

- A coordinate is outside the board
- A coordinate is repeated
- Any opening move creates a winning line

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

A configured node limit causes Arena to send zero protocol time limits so deterministic node control can take precedence.

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
- `analysis_enabled`
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

System failure takes precedence over signal status. A real termination signal takes precedence over an otherwise recorded player failure.

## Viewer storage

The viewer database persists across ordinary API restarts.

There is no schema migration or legacy schema support. Wipe the viewer database when installing a version with a new schema:

```sh
rm -rf view/data
```

An explicit reset is destructive:

```sh
curl \
  -X DELETE \
  -H 'X-API-KEY: changeme' \
  http://localhost:3001/api/reset
```

Reset rotates the internal viewer generation and clears runs and games.

Arena retains only enough telemetry to recover active work:

- Active run declarations
- Latest active aggregate updates
- In-flight game declarations
- In-flight moves
- Unacknowledged results

Acknowledged completed games are not replayed after reset.

## Viewer shell

The Arena and Play sidebars are fixed at `300px`.

The top bars are `52px` high on desktop and mobile.

Arena keeps player identities on one line:

```text
● `version` Alpha   1 – 0   Beta `version` ○
```

Versions use the regular interface font inside a flat inline-code badge. Versions remain visible before names are truncated.

Play uses a symmetric top bar:

```text
● `You` 1   YOUR TURN   0 `AI` ○
```

The real Play opponent name and version appear in the Analysis heading.

## Tournament cards

Collapsed tournament cards show:

- Bot name and version
- Slot-1 W/L/D badges
- Run status
- Games played
- A right-facing disclosure arrow

The arrow becomes a spinner while initial history is fetched. It rotates downward while the tournament opens and returns right while it closes.

When another tournament is selected, the current tournament remains open while the target fetch completes. The current tournament then closes before the prepared target opens.

A failed history request opens the tournament into its statistics matrix and a centered Retry action.

## Tournament statistics

The matrix uses canonical row labels:

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

CMA and Bln remain present for every analysis-enabled run. Unsampled values display `-`. A sampled zero displays `0.0%`.

If either bot crashes, Crash replaces Time. It does not add another column.

Long aggregate times display as:

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

ID, move count, duration, and result are server-sortable. Initial history, explicit sorting, and pagination are server-side. Complete streamed pair snapshots update and reorder the visible page locally without clearing the rows or refetching the first page.

Within a pair, the game where slot 1 is black appears before the game where slot 1 is white.

## Arena playback

Playback controls are ordered as:

```text
Replay
Play/Pause
Previous
Next
1x
2x
3x
```

Playback delays are:

```text
1x  1000ms
2x   500ms
3x    50ms
```

Replay pauses playback and returns to move zero. All visible stones leave together.

A one-step rewind uses the reverse stone animation. The last-move marker moves only after the departing stone finishes. A visible winning line retracts when leaving the terminal position.

## Play controls

Play uses one segmented Game row:

```text
New game | As ○ | Time 1s
```

The three segments have equal width.

Changing As selects the color for the next game. It does not alter the active game.

Changing Time does not restart the game or cancel an active search. It applies to the next search that starts.

The Analysis card retains every AI search from the current game and scrolls internally.

## Board motion

New live stones animate from reduced scale and zero opacity before their first visible frame.

Fast batched updates animate every appended move, including AI responses that arrive before an intermediate browser paint.

The last-move dot is an independent layer. It does not scale with the stone.

Desktop move previews are available only on devices with a fine pointer and genuine hover support. Touch devices do not render a move preview.

Reduced-motion preferences make board and interface transitions effectively immediate.

## Game routes

Game routes use only the numeric viewer ID:

```text
/1042
```

Viewer generation never appears in the URL.
