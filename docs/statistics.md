# Statistics and metrics

Arena calculates tournament results, rating estimates, result significance, process efficiency, reliability counts, and optional evaluator-based move-quality metrics.

All player statistics are attached to canonical tournament slots:

- Player 1 is slot 1.
- Player 2 is slot 2.
- Reversing black and white between pair legs does not reverse statistical ownership.

## Pair results

Each pair contains two games with reversed colors.

Arena converts both black-perspective game results into one slot-1 pair score:

```text
S1 pair score =
  (leg-0 black score + 1 - leg-1 black score) / 2
```

The pair is classified as:

```text
score > 0.5  → slot-1 win
score < 0.5  → slot-1 loss
score = 0.5  → draw
```

Therefore:

- Win plus draw is a slot-1 pair win.
- Loss plus draw is a slot-1 pair loss.
- One win and one loss is a pair draw.
- Two draws are a pair draw.

The same classification drives displayed W/L/D totals, Elo, ERF, and SPRT input.

## Elo rating

Ratings are derived from classified completed pairs.

- Base rating: 1000
- Score: pair wins plus half of pair draws
- Formula: standard logistic Elo conversion
- Ratings are symmetric around the base rating

The displayed rating is an estimate from the accumulated result ratio. It is not an incremental persistent rating carried between runs.

## ERF

ERF is derived from completed pair outcomes and is not evaluator data.

For a player with pair wins `W`, draws `D`, losses `L`, and total pairs `N`:

```text
score = W + 0.5D
z = (score - 0.5N) / (0.5√N)
ERF = Φ(z) × 100
```

`Φ` is the standard normal cumulative distribution function.

Equal results produce approximately 50% for both players. ERF summarizes the direction and magnitude of the current pair-result edge.

ERF:

- Is not evaluator confidence
- Does not use internal engine scores
- Does not use evaluator probabilities
- Is not a calibrated probability that a player is stronger

## SPRT

Arena uses a sequential result check for optional early termination.

- Null hypothesis: players are of equal strength
- `alpha`: accepted early-stop risk
- `min_pairs`: minimum sample size before testing
- Input: classified pair wins, losses, and draws

Testing begins only after `min_pairs` have completed.

A run can stop when:

- The accumulated pair result is sufficiently one-sided.
- The remaining pairs cannot change the tested conclusion.
- The run is interrupted or fails for another reason.

An early-stopped run is reported as `stopped`, not `ended`.

## Efficiency

Efficiency measures how much process CPU time a bot received during its measured thinking time.

```text
Eff = total bot process CPU time / total bot thinking wall time × 100
```

Arena computes the ratio from aggregate totals:

```text
Eff = Σ valid CPU milliseconds / Σ corresponding sampled thinking-wall milliseconds × 100
```

A thinking interval contributes to efficiency only when Arena obtains valid process CPU samples at both the start and end of that interval and the counters do not regress. The separate `Time` statistic still includes every measured thinking interval, including intervals where CPU sampling was unavailable.

It does not average per-move percentages. This ensures that long searches contribute proportionally more than short searches and prevents a failed CPU read from being interpreted as real zero CPU usage.

A measured thinking interval starts immediately before Arena dispatches the turn-producing command:

- `BEGIN`
- `TURN`
- `BOARD`

The interval ends when the bot responds or the turn fails.

Therefore:

- Successful moves contribute wall and CPU time.
- Timed-out turns contribute measured wall time.
- Invalid or illegal move responses contribute measured wall and CPU time.
- Process failures contribute CPU and sampled wall time when both CPU samples remain readable.
- Intervals with unavailable CPU samples contribute to `Time` but not to the efficiency numerator or denominator.
- Initialization is excluded.
- Evaluator work is excluded.
- The opponent's turns are excluded.
- General game-management time is excluded.

The wall and CPU totals are assigned to canonical slots after accounting for the current leg's color reversal.

Interpretation:

- A value near 100% means the process used approximately one full CPU during its thinking windows.
- A value below 100% can reflect scheduler contention, sleeping, waiting, I/O, synchronization, or timing granularity.
- A value above 100% is retained and can indicate multi-core process activity.
- Efficiency is unavailable until positive CPU-sampled thinking wall time has been recorded.

The UI displays unavailable efficiency as `—`, while NDJSON uses `null`.

Efficiency is not clamped to 100%.

Although `100 - Eff` can be a useful approximation of lost CPU availability for a single-threaded, CPU-bound engine, it should not be interpreted as a pure measure of CPU theft. Engine waiting and scheduler behavior also affect it.

## Quality metrics

Quality metrics are available only when an evaluator engine is configured and returns valid analysis data.

The evaluator sample counts are exported explicitly so that the UI can distinguish:

- A real value of zero
- A metric that was never computed

### CMA

Critical move accuracy is the percentage of successful moves in critical positions.

- Critical position: `sharpness > 0.05`
- Successful move: `regret < 0.02`
- Sharpness: `p_best - p_second`
- Regret: `max(0, p_best - p_played)`

```text
CMA = critical successes / critical positions × 100
```

CMA is unavailable when no critical positions have been analyzed.

The viewer hides the CMA row when neither player has critical samples. If only one player has critical samples, the other side displays `—`.

### Blunder rate

Blunder rate is the percentage of analyzed moves with substantial regret.

- Blunder: `regret > 0.20`
- Denominator: all accepted analyzed moves

```text
Blunder = severe errors / analyzed moves × 100
```

Blunder rate is unavailable when no moves have been analyzed.

The viewer hides the Blunder row when neither player has analyzed samples. If only one player has analyzed samples, the other side displays `—`.

### Garbage-time filtering

Evaluator results with:

```text
p_best < 0.05
```

are excluded from quality metrics.

Excluded evaluator responses do not increment the accepted analyzed-move or critical-position sample counts.

## Crashes

Crash counts are tracked independently for the two canonical slots.

The viewer hides the Crashes row when both values are zero.

When `--exit-on-crash` is disabled, an adjudicated player crash can count as a game loss while the tournament continues. If every scheduled game is still completed, the run may finish as `ended`.

When strict crash handling interrupts the run, the run finishes as `stopped`.
