const missing = (value) => value == null || value === '';

const formatNumber = (value, digits = 1) => {
  if (missing(value)) return '—';

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return '—';
  }

  return number.toLocaleString(undefined, {
    maximumFractionDigits: digits
  });
};

const formatPercent = (value) => {
  if (missing(value)) return '—';

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return '—';
  }

  return `${number.toFixed(1)}%`;
};

const formatTime = (value) => {
  if (missing(value)) return '—';

  const milliseconds = Number(value);

  if (!Number.isFinite(milliseconds) || milliseconds < 0) {
    return '—';
  }

  if (milliseconds < 1000) {
    return `${Math.round(milliseconds)}ms`;
  }

  const seconds = Math.floor(milliseconds / 1000);

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;

  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
};

const Row = ({ label, first, second }) => (
  <div className="stats-row" role="row">
    <span className="stats-label" role="rowheader">
      {label}
    </span>
    <span role="cell">{first}</span>
    <span role="cell">{second}</span>
  </div>
);

export default function TournamentStats({ group, run }) {
  if (!run) return null;

  const showBlunder = run.p1_moves_analyzed > 0 || run.p2_moves_analyzed > 0;
  const showCma = run.p1_critical_total > 0 || run.p2_critical_total > 0;
  const showCrashes = run.p1_crashes > 0 || run.p2_crashes > 0;

  return (
    <section className="tournament-stats" aria-label="Tournament statistics">
      <div className="stats-table" role="table" aria-label="Player statistics comparison">
        <div role="rowgroup">
          <div className="stats-row stats-head" role="row">
            <span aria-hidden="true" />
            <span role="columnheader" title={group.hero.name}>
              {group.hero.name}
            </span>
            <span role="columnheader" title={group.villain.name}>
              {group.villain.name}
            </span>
          </div>
        </div>

        <div role="rowgroup">
          <Row
            label="Elo"
            first={formatNumber(run.p1_elo, 0)}
            second={formatNumber(run.p2_elo, 0)}
          />
          <Row
            label="Time"
            first={formatTime(run.p1_total_time_ms)}
            second={formatTime(run.p2_total_time_ms)}
          />
          <Row label="ERF" first={formatPercent(run.p1_erf)} second={formatPercent(run.p2_erf)} />
          <Row label="Eff" first={formatPercent(run.p1_eff)} second={formatPercent(run.p2_eff)} />

          {showCma && (
            <Row
              label="CMA"
              first={run.p1_critical_total > 0 ? formatPercent(run.p1_cma) : '—'}
              second={run.p2_critical_total > 0 ? formatPercent(run.p2_cma) : '—'}
            />
          )}

          {showBlunder && (
            <Row
              label="Blunder"
              first={run.p1_moves_analyzed > 0 ? formatPercent(run.p1_blunder) : '—'}
              second={run.p2_moves_analyzed > 0 ? formatPercent(run.p2_blunder) : '—'}
            />
          )}

          {showCrashes && (
            <Row
              label="Crashes"
              first={formatNumber(run.p1_crashes, 0)}
              second={formatNumber(run.p2_crashes, 0)}
            />
          )}
        </div>
      </div>
    </section>
  );
}
