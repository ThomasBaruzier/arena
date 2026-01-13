import { formatFloat, formatTime } from '../utils';

export default function MatchStats({ run, showCrashes }) {
  const statsGridStyle = {
    gridTemplateColumns: showCrashes
      ? '22px 1fr 1fr 1fr 1fr 1.5fr 1fr'
      : '22px 1fr 1fr 1fr 1fr 1.5fr'
  };

  return (
    <div className="run-stats-table">
      <div className="stats-header" style={statsGridStyle}>
        <span></span>
        <span>Elo</span>
        <span>ERF</span>
        <span>CMA</span>
        <span>Bln</span>
        <span>Time</span>
        {showCrashes && <span>Crash</span>}
      </div>
      {[
        { l: 'P1', p: 'p1' },
        { l: 'P2', p: 'p2' }
      ].map(({ l, p }) => (
        <div key={p} className={`stats-row ${p}`} style={statsGridStyle}>
          <span className="player-label">{l}</span>
          <span>{formatFloat(run[`${p}_elo`])}</span>
          <span>{formatFloat(run[`${p}_erf`])}%</span>
          <span>{formatFloat(run[`${p}_cma`])}%</span>
          <span>{formatFloat(run[`${p}_blunder`])}%</span>
          <span>{formatTime(run[`${p}_total_time_ms`])}</span>
          {showCrashes && (
            <span className={run[`${p}_crashes`] > 0 ? 'crash' : ''}>
              {run[`${p}_crashes`] || '-'}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
