import { useState } from 'react';
import { auditData, fixPlayerIds, migrateLeagueIds, type DataIssue } from '../api';
import { S, mutedText, subheading } from '../theme';

type Props = { phone: string };

const severityStyle = (s: string): React.CSSProperties =>
  s === 'error'
    ? { background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' }
    : { background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' };

const fixLabels: Record<string, string> = {
  migrate_league_ids: '🔁 Migrate league IDs',
  fix_player_ids: '👤 Fix player IDs',
};

export default function MaintenanceTab({ phone }: Props) {
  const [issues, setIssues] = useState<DataIssue[] | null>(null);
  const [auditing, setAuditing] = useState(false);
  const [auditError, setAuditError] = useState('');

  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, unknown>>({});
  const [fixError, setFixError] = useState('');

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
      else { setFixError('Unknown fix.'); setRunning(null); return; }
      setResults(prev => ({ ...prev, [fixKey]: res }));
      // Re-run audit to reflect new state
      const audit = await auditData(phone);
      if (audit.success) setIssues(audit.issues);
    } catch (e) { setFixError(e instanceof Error ? e.message : 'Error running fix'); }
    setRunning(null);
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
  return null;
}
