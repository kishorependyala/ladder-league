import { useState } from 'react';
import { auditData, fixPlayerIds, fixUpsetBonus, migrateLeagueIds, purgeStaleVotes, recalculateAllStandings, syncPlayerNames, type DataIssue } from '../api';
import { S, mutedText, subheading } from '../theme';

type Props = { phone: string };

const severityStyle = (s: string): React.CSSProperties =>
  s === 'error'
    ? { background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' }
    : { background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' };

const fixLabels: Record<string, string> = {
  migrate_league_ids: '🔁 Migrate league IDs',
  fix_player_ids: '👤 Fix player IDs',
  purge_stale_votes: '🗳️ Stale votes from removed players',
};

export default function MaintenanceTab({ phone }: Props) {
  const [issues, setIssues] = useState<DataIssue[] | null>(null);
  const [auditing, setAuditing] = useState(false);
  const [auditError, setAuditError] = useState('');

  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, unknown>>({});
  const [fixError, setFixError] = useState('');

  const [syncBusy, setSyncBusy] = useState(false);
  const [syncResult, setSyncResult] = useState<{ leaguesUpdated: number; usersProcessed: number } | null>(null);
  const [syncError, setSyncError] = useState('');

  const [upsetBusy, setUpsetBusy] = useState(false);
  const [upsetResult, setUpsetResult] = useState<{ leagueId: string; leagueName: string; matchesFixed: number; initialRankingSaved: boolean }[] | null>(null);
  const [upsetError, setUpsetError] = useState('');

  const [recalcBusy, setRecalcBusy] = useState(false);
  const [recalcResult, setRecalcResult] = useState<{ leagueId: string; leagueName: string }[] | null>(null);
  const [recalcError, setRecalcError] = useState('');

  const runAudit = async () => {
    setAuditing(true); setAuditError(''); setIssues(null); setResults({});
    try {
      const res = await auditData(phone);
      if (!res.success) setAuditError(res.message || 'Audit failed.');
      else setIssues(res.issues);
    } catch (e) { setAuditError(e instanceof Error ? e.message : 'Error'); }
    setAuditing(false);
  };

  const runFix = async (fixKey: string) => {
    setRunning(fixKey); setFixError('');
    try {
      let res: unknown;
      if (fixKey === 'migrate_league_ids') res = await migrateLeagueIds(phone);
      else if (fixKey === 'fix_player_ids') res = await fixPlayerIds(phone);
      else if (fixKey === 'purge_stale_votes') res = await purgeStaleVotes(phone);
      else { setFixError('Unknown fix.'); setRunning(null); return; }
      setResults(prev => ({ ...prev, [fixKey]: res }));
      // Re-run audit to reflect new state
      const audit = await auditData(phone);
      if (audit.success) setIssues(audit.issues);
    } catch (e) { setFixError(e instanceof Error ? e.message : 'Error running fix'); }
    setRunning(null);
  };

  const runSyncNames = async () => {
    setSyncBusy(true); setSyncError(''); setSyncResult(null);
    try {
      const res = await syncPlayerNames(phone);
      if (res.success) setSyncResult({ leaguesUpdated: res.leaguesUpdated, usersProcessed: res.usersProcessed });
      else setSyncError(res.message || 'Sync failed.');
    } catch (e) { setSyncError(e instanceof Error ? e.message : 'Error'); }
    setSyncBusy(false);
  };

  const runFixUpsetBonus = async () => {
    setUpsetBusy(true); setUpsetError(''); setUpsetResult(null);
    try {
      const res = await fixUpsetBonus(phone);
      if (res.success) setUpsetResult(res.fixedLeagues);
      else setUpsetError(res.message || 'Fix failed.');
    } catch (e) { setUpsetError(e instanceof Error ? e.message : 'Error'); }
    setUpsetBusy(false);
  };

  const runRecalcAll = async () => {
    setRecalcBusy(true); setRecalcError(''); setRecalcResult(null);
    try {
      const res = await recalculateAllStandings(phone);
      if (res.success) setRecalcResult(res.updated);
      else setRecalcError(res.message || 'Recalculate failed.');
    } catch (e) { setRecalcError(e instanceof Error ? e.message : 'Error'); }
    setRecalcBusy(false);
  };

  // Group issues by fix type
  const byFix = (issues ?? []).reduce<Record<string, DataIssue[]>>((acc, issue) => {
    const key = issue.fix ?? '__none__';
    (acc[key] ??= []).push(issue);
    return acc;
  }, {});

  const fixKeys = Object.keys(byFix).filter(k => k !== '__none__');
  const unfixable = byFix['__none__'] ?? [];

  return (
    <div style={{ display: 'grid', gap: '1.25rem' }}>
      {/* Header */}
      <div style={{ ...S.card, display: 'grid', gap: '0.75rem' }}>
        <h3 style={{ ...subheading, margin: 0 }}>🔧 Data Maintenance</h3>
        <p style={mutedText}>Scan the data directory for known issues, then apply available fixes.</p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button style={S.primaryBtn} disabled={auditing} onClick={runAudit}>
            {auditing ? '⏳ Scanning…' : '🔍 Run audit'}
          </button>
        </div>
        {auditError && <div style={S.errorBox}>{auditError}</div>}
        {issues !== null && issues.length === 0 && (
          <div style={S.successBox}>✅ No issues found — data looks clean!</div>
        )}
      </div>

      {/* Sync player names card */}
      <div style={{ ...S.card, display: 'grid', gap: '0.75rem' }}>
        <div>
          <h3 style={{ ...subheading, margin: 0 }}>👤 Sync player names in leagues</h3>
          <p style={{ ...mutedText, marginTop: '0.3rem', fontSize: '0.83rem' }}>
            League JSON files store a copy of each player's name. Run this if names were updated and old copies remain stale.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button style={S.smallBtn} disabled={syncBusy} onClick={runSyncNames}>
            {syncBusy ? '⏳ Syncing…' : '🔄 Sync player names'}
          </button>
        </div>
        {syncError && <div style={S.errorBox}>{syncError}</div>}
        {syncResult && (
          <div style={S.successBox}>
            ✅ Done — checked <strong>{syncResult.usersProcessed}</strong> users,
            updated names in <strong>{syncResult.leaguesUpdated}</strong> league{syncResult.leaguesUpdated !== 1 ? 's' : ''}.
            {syncResult.leaguesUpdated === 0 && ' All names were already in sync.'}
          </div>
        )}
      </div>

      {/* Recalculate all standings card */}
      <div style={{ ...S.card, display: 'grid', gap: '0.75rem' }}>
        <div>
          <h3 style={{ ...subheading, margin: 0 }}>🔄 Recalculate all standings</h3>
          <p style={{ ...mutedText, marginTop: '0.3rem', fontSize: '0.83rem' }}>
            Recomputes rankings for every active/playoffs league using the latest ranking criteria
            (points → wins → win% → sets won → sets win% → games won → games win%).
            Run this after deploying a ranking logic update.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button style={S.primaryBtn} disabled={recalcBusy} onClick={runRecalcAll}>
            {recalcBusy ? '⏳ Recalculating…' : '🔄 Recalculate all standings'}
          </button>
        </div>
        {recalcError && <div style={S.errorBox}>{recalcError}</div>}
        {recalcResult !== null && (
          recalcResult.length === 0
            ? <div style={S.successBox}>✅ No active leagues found.</div>
            : <div style={S.successBox}>
                ✅ Recalculated standings for {recalcResult.length} league{recalcResult.length !== 1 ? 's' : ''}:
                {recalcResult.map(r => (
                  <div key={r.leagueId} style={{ fontSize: '0.78rem', marginTop: '0.2rem' }}>
                    <em>{r.leagueName}</em>
                  </div>
                ))}
              </div>
        )}
      </div>

      {/* Fix upset bonus card */}
      <div style={{ ...S.card, display: 'grid', gap: '0.75rem' }}>
        <div>
          <h3 style={{ ...subheading, margin: 0 }}>⚡ Fix upset bonus points (existing data)</h3>
          <p style={{ ...mutedText, marginTop: '0.3rem', fontSize: '0.83rem' }}>
            Stamps the correct upset bonus on matches that were accepted before this fix was in place.
            Uses each league's initial seed ranking as the reference. Matches that already have a stored
            bonus are skipped. After running, standings will reflect accurate upset bonuses.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button style={S.smallBtn} disabled={upsetBusy} onClick={runFixUpsetBonus}>
            {upsetBusy ? '⏳ Fixing…' : '⚡ Fix upset bonuses'}
          </button>
        </div>
        {upsetError && <div style={S.errorBox}>{upsetError}</div>}
        {upsetResult !== null && (
          upsetResult.length === 0
            ? <div style={S.successBox}>✅ All leagues already up to date — nothing to fix.</div>
            : <div style={S.successBox}>
                ✅ Fixed {upsetResult.length} league{upsetResult.length !== 1 ? 's' : ''}:
                {upsetResult.map(r => (
                  <div key={r.leagueId} style={{ fontSize: '0.78rem', marginTop: '0.2rem' }}>
                    <em>{r.leagueName}</em>:
                    {r.initialRankingSaved && ' ✓ initial ranking snapshot saved'}
                    {r.initialRankingSaved && r.matchesFixed > 0 && ','}
                    {r.matchesFixed > 0 && ` ✓ ${r.matchesFixed} match${r.matchesFixed !== 1 ? 'es' : ''} upset bonus updated`}
                  </div>
                ))}
              </div>
        )}
      </div>

      {/* Issues by fix group */}
      {fixKeys.map(fixKey => (
        <div key={fixKey} style={{ ...S.card, display: 'grid', gap: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h3 style={{ ...subheading, margin: 0 }}>
              {fixLabels[fixKey] ?? fixKey}{' '}
              <span style={{ fontSize: '0.78rem', fontWeight: 400, color: '#92400e' }}>
                ({byFix[fixKey].length} issue{byFix[fixKey].length !== 1 ? 's' : ''})
              </span>
            </h3>
            <button
              style={S.smallBtn}
              disabled={running === fixKey}
              onClick={() => runFix(fixKey)}
            >
              {running === fixKey ? '⏳ Fixing…' : `⚡ Apply fix`}
            </button>
          </div>

          {/* Fix result */}
          {results[fixKey] != null && (
            <FixResult fixKey={fixKey} result={results[fixKey] as Record<string, unknown>} />
          )}

          {/* Issue list */}
          <div style={{ display: 'grid', gap: '0.4rem' }}>
            {byFix[fixKey].map((issue, i) => (
              <div key={i} style={{ ...severityStyle(issue.severity), borderRadius: '0.6rem', padding: '0.6rem 0.8rem', fontSize: '0.83rem' }}>
                <span style={{ fontWeight: 600, textTransform: 'uppercase', fontSize: '0.7rem', opacity: 0.7 }}>{issue.type} · {issue.severity}</span>
                <div>{issue.description}</div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Unfixable issues */}
      {unfixable.length > 0 && (
        <div style={{ ...S.card, display: 'grid', gap: '0.75rem' }}>
          <h3 style={{ ...subheading, margin: 0 }}>⚠️ Manual attention required ({unfixable.length})</h3>
          <div style={{ display: 'grid', gap: '0.4rem' }}>
            {unfixable.map((issue, i) => (
              <div key={i} style={{ ...severityStyle(issue.severity), borderRadius: '0.6rem', padding: '0.6rem 0.8rem', fontSize: '0.83rem' }}>
                <span style={{ fontWeight: 600, textTransform: 'uppercase', fontSize: '0.7rem', opacity: 0.7 }}>{issue.type} · {issue.severity}</span>
                <div>{issue.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {fixError && <div style={S.errorBox}>{fixError}</div>}
    </div>
  );
}

function FixResult({ fixKey, result }: { fixKey: string; result: unknown }) {
  const r = result as Record<string, unknown>;
  if (fixKey === 'migrate_league_ids') {
    const migrated = (r.migrated as { old: string; new: string; sport: string }[]) ?? [];
    return migrated.length === 0
      ? <div style={S.successBox}>✅ Nothing to migrate.</div>
      : (
        <div style={S.successBox}>
          ✅ Migrated {migrated.length} league{migrated.length !== 1 ? 's' : ''}:
          {migrated.map(m => (
            <div key={m.old} style={{ fontSize: '0.78rem', marginTop: '0.2rem' }}>
              <code>{m.old}</code> → <code>{m.new}</code> ({m.sport})
            </div>
          ))}
        </div>
      );
  }
  if (fixKey === 'fix_player_ids') {
    const fixed = (r.fixed as { leagueId: string; leagueName: string; oldId: string; newId: string }[]) ?? [];
    return fixed.length === 0
      ? <div style={S.successBox}>✅ Nothing to fix.</div>
      : (
        <div style={S.successBox}>
          ✅ Fixed {fixed.length} player record{fixed.length !== 1 ? 's' : ''}:
          {fixed.map((f, i) => (
            <div key={i} style={{ fontSize: '0.78rem', marginTop: '0.2rem' }}>
              In <em>{f.leagueName}</em>: <code>{f.oldId}</code> → <code>{f.newId}</code>
            </div>
          ))}
        </div>
      );
  }
  if (fixKey === 'purge_stale_votes') {
    const purged = (r.purged as { leagueId: string; leagueName: string; staleVoterIds: string[]; staleFinalRankingIds: string[] }[]) ?? [];
    return purged.length === 0
      ? <div style={S.successBox}>✅ No stale votes or ranking entries found.</div>
      : (
        <div style={S.successBox}>
          ✅ Cleaned up {purged.length} league{purged.length !== 1 ? 's' : ''}:
          {purged.map((p, i) => (
            <div key={i} style={{ fontSize: '0.78rem', marginTop: '0.2rem' }}>
              <em>{p.leagueName}</em>: removed {p.staleVoterIds.length} stale vote(s)
              {p.staleFinalRankingIds.length > 0 && `, ${p.staleFinalRankingIds.length} stale finalRanking entry(ies)`}
            </div>
          ))}
        </div>
      );
  }
  return null;
}
