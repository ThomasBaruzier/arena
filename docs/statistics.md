# Statistics and metrics

The arena calculates various statistics to evaluate engine performance and match quality.

## Elo rating

Ratings are updated after every pair of games (one leg as black, one as white).

* Base rating: 1000
* K-factor: 32
* Formula: Standard logistic curve

## Sprt (sequential probability ratio test)

Used for early termination of matches when the result is statistically significant.

* Null hypothesis: players are of equal strength.
* Parameters:
  * `alpha` (risk): probability of incorrectly rejecting the null hypothesis.
  * `min_pairs`: minimum sample size before testing begins.
* Logic: a z-test is applied to the score difference. If the probability of the current score occurring by chance is less than `alpha`, the match is terminated.

## Quality metrics

When an evaluator is used, the arena computes objective quality metrics.

### Sw-dqi (sharpness-weighted decision quality index)
A score from 0 to 100 representing move quality, heavily penalizing mistakes in sharp positions.

* `regret`: difference between best move score and played move score.
* `sharpness`: difference between best move score and second best move score.
* `weight`: `1 + 10 * sharpness^2`

### Cma (critical move accuracy)
Percentage of correct moves played in critical positions.

* Critical position: `sharpness > 0.05`
* Success: `regret < 0.02`

### Blunder rate
Percentage of moves that result in a significant loss of win probability.

* Threshold: `regret > 0.20`
