# Statistics

All statistics are owned by canonical tournament slots.

- Player 1 is slot 1.
- Player 2 is slot 2.
- Pair legs reverse colors without reversing statistic ownership.

## Pair result

For a pair with black-perspective leg scores `first` and `second`:

```text
slot-1 pair score =
  (first + 1 - second) / 2
```

Classification is:

```text
score > 0.5  win
score < 0.5  loss
score = 0.5  draw
```

The same classification drives displayed W/L/D, Elo, ERF, and early-stop input.

## Game result reasons

The referee assigns every game one terminal reason:

```text
line
draw
adjudication
void
```

`line` means the final move created the declared winner's first winning line.

`draw` means the board filled without a winner.

`adjudication` means a player won because the opponent timed out, crashed, returned invalid output, or made an illegal move.

`void` means the game ended without a valid player result, such as interruption or invalid opening state.

The API transport serializes this reason directly and does not infer it from scores or moves.

## Elo

Arena converts the accumulated pair score ratio through the standard logistic Elo formula.

Ratings are symmetric around 1000.

They are estimates for the current run and are not persistent ratings carried between runs.

## ERF

For pair wins `W`, draws `D`, losses `L`, and completed pairs `N`:

```text
score = W + 0.5D
z = (score - 0.5N) / (0.5√N)
ERF = Φ(z) × 100
```

ERF is based only on completed pair results.

It is not evaluator confidence, does not use engine scores, and is not a calibrated probability that a bot is stronger.

## Early stopping

Early stopping is disabled when risk is zero.

When enabled, testing starts after `min_pairs`.

A run can stop when the current result is sufficiently one-sided or when the remaining pairs cannot reach the tested midpoint.

An early-stopped run has status `stopped`.

## Time

Time is aggregate bot thinking-wall time.

A measured interval starts immediately before Arena sends the turn-producing command and ends when the bot responds or the turn fails.

It includes:

- Successful moves
- Timeouts
- Invalid responses
- Illegal moves
- Process failures when measurable

It excludes:

- Initialization
- Opponent turns
- Evaluator work
- General game-management time

## Efficiency

Efficiency is:

```text
Eff =
  total valid bot process CPU time
  /
  corresponding CPU-sampled thinking-wall time
  × 100
```

Arena uses aggregate totals:

```text
Eff =
  Σ valid CPU milliseconds
  /
  Σ wall milliseconds for those same valid samples
  × 100
```

It does not average per-move percentages.

A timing interval contributes to the efficiency ratio only when both process CPU samples are valid and counters do not regress.

The general Time statistic still includes intervals where CPU sampling is unavailable.

Efficiency:

- Is unavailable before positive sampled wall time exists
- Is not clamped to 100%
- Can exceed 100% for multi-core process activity
- Can be below 100% because of scheduling, waiting, sleeping, I/O, synchronization, or timing granularity

`100 - Eff` is not a pure stolen-CPU measurement.

NDJSON exports unavailable efficiency as `null`. The viewer displays `-`.

## Evaluator metrics

`analysis_enabled` is immutable run configuration.

When false, CMA and Bln are omitted from the viewer matrix.

When true, CMA and Bln remain present for the entire run. A metric without samples displays `-`. A sampled zero displays `0.0%`.

Evaluator results with `p_best < 0.05` are excluded.

### CMA

```text
sharpness =
  max(0, p_best - p_second)

regret =
  max(0, p_best - p_played)
```

A position is critical when:

```text
sharpness > 0.05
```

A critical move is successful when:

```text
regret < 0.02
```

Critical move accuracy is:

```text
CMA =
  critical successes
  /
  critical positions
  × 100
```

CMA is unavailable without critical samples.

### Blunder rate

A move is a blunder when:

```text
regret > 0.20
```

Blunder rate is:

```text
Bln =
  blunders
  /
  accepted analyzed moves
  × 100
```

Bln is unavailable without accepted analyzed moves.

## Crashes

Crash counts are attached to canonical slots.

When either bot has crashed, the compact viewer matrix replaces Time with Crash. It does not add a seventh metric column.

A non-strict crash can be adjudicated as a loss while the run continues. Such a run can still end normally with status `ended`.

A strict crash interrupts the run and produces status `stopped`.
