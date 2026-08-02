import { formatDuration } from '../formatters';

export { formatDuration as tournamentTimeValue } from '../formatters';

const missing = (value) => value == null || value === '';

const numberValue = (value, digits = 0) => {
  if (missing(value)) return '-';

  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(digits) : '-';
};

const percentValue = (value) => {
  if (missing(value)) return '-';

  const number = Number(value);

  if (!Number.isFinite(number)) return '-';

  return `${Math.abs(number) >= 100 ? number.toFixed(0) : number.toFixed(1)}%`;
};

const availablePercent = (samples, value) =>
  Number(samples) > 0 ? percentValue(value) : '-';

const valuesFor = (run, side, crashed, analyzed) => {
  const values = [
    numberValue(run[`${side}_elo`]),
    crashed
      ? numberValue(run[`${side}_crashes`])
      : formatDuration(run[`${side}_total_time_ms`]),
    percentValue(run[`${side}_erf`]),
    percentValue(run[`${side}_eff`])
  ];

  if (analyzed) {
    values.push(
      availablePercent(run[`${side}_critical_total`], run[`${side}_cma`]),
      availablePercent(run[`${side}_moves_analyzed`], run[`${side}_blunder`])
    );
  }

  return values;
};

const PlayerRow = ({ label, values }) => (
  <div className="stats-row" role="row">
    <span className="stats-player" role="rowheader">
      {label}
    </span>

    {values.map((value, index) => (
      <span key={index} role="cell" title={value}>
        {value}
      </span>
    ))}
  </div>
);

export default function TournamentStats({ run }) {
  if (!run) return null;

  const analyzed = Boolean(run.analysis_enabled);
  const crashed = Number(run.p1_crashes) > 0 || Number(run.p2_crashes) > 0;
  const headings = ['Elo', crashed ? 'Crash' : 'Time', 'ERF', 'Eff'];

  if (analyzed) headings.push('CMA', 'Bln');

  return (
    <section className="tournament-stats" aria-label="Tournament statistics">
      <div
        className={`stats-table ${analyzed ? 'analyzed' : 'core'}`}
        role="table"
        aria-label="Player statistics comparison"
      >
        <div className="stats-row stats-head" role="row">
          <span role="columnheader" aria-label="Player" />

          {headings.map((heading) => (
            <span key={heading} role="columnheader">
              {heading}
            </span>
          ))}
        </div>

        <PlayerRow label="P1" values={valuesFor(run, 'p1', crashed, analyzed)} />
        <PlayerRow label="P2" values={valuesFor(run, 'p2', crashed, analyzed)} />
      </div>
    </section>
  );
}
