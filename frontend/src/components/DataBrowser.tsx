import { useEffect, useState } from 'react';
import { dataBrowse, dataDownloadUrl, dataReadFile, type DataEntry } from '../api';
import { S, mutedText, subheading } from '../theme';

type Props = { phone: string };

export default function DataBrowser({ phone }: Props) {
  const [dataDir, setDataDir] = useState('');
  const [path, setPath] = useState('');
  const [entries, setEntries] = useState<DataEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [fileContent, setFileContent] = useState<unknown>(null);
  const [filePath, setFilePath] = useState('');
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState('');
  const [copied, setCopied] = useState(false);

  const load = async (p: string) => {
    setLoading(true); setError(''); setFileContent(null); setFilePath('');
    try {
      const res = await dataBrowse(phone, p);
      if (!res.success) { setError(res.message || 'Could not browse.'); }
      else {
        setDataDir(res.dataDir);
        setPath(res.currentPath);
        setEntries(res.entries);
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
    setLoading(false);
  };

  useEffect(() => { load(''); }, []);

  const openFile = async (entry: DataEntry) => {
    setFileLoading(true); setFileError(''); setFileContent(null); setFilePath(entry.path); setCopied(false);
    try {
      const res = await dataReadFile(phone, entry.path);
      if (!res.success) setFileError(res.message || 'Could not read file.');
      else setFileContent(res.content);
    } catch (e) { setFileError(e instanceof Error ? e.message : 'Error'); }
    setFileLoading(false);
  };

  const handleCopy = () => {
    const text = typeof fileContent === 'string' ? fileContent : JSON.stringify(fileContent, null, 2);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Build breadcrumb segments from path
  const segments = path ? path.split('/').filter(Boolean) : [];
  const crumbPaths = segments.map((_, i) => segments.slice(0, i + 1).join('/'));

  const formatSize = (bytes: number | null) => {
    if (bytes === null) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      {/* Data dir path banner + download button */}
      <div style={{ background: '#1e293b', borderRadius: '0.75rem', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, whiteSpace: 'nowrap' }}>DATA DIR</span>
        <code style={{ color: '#a3e635', fontSize: '0.85rem', wordBreak: 'break-all', flex: 1 }}>{dataDir || '…'}</code>
        <a
          href={dataDownloadUrl(phone, path)}
          download
          style={{ ...S.smallBtn, textDecoration: 'none', whiteSpace: 'nowrap', fontSize: '0.8rem' }}
        >
          ⬇ Download {path ? 'folder' : 'all'}
        </a>
      </div>

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap', fontSize: '0.88rem', background: '#f8fafc', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', border: '1px solid #e2e8f0' }}>
        <span style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600, marginRight: '0.2rem' }}>📂</span>
        <button style={{ ...S.linkBtn, fontWeight: 700, color: path ? '#f59e0b' : '#92400e' }} onClick={() => load('')}>root</button>
        {segments.map((seg, i) => {
          const isCurrent = i === segments.length - 1;
          return (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <span style={{ color: '#94a3b8' }}>/</span>
              {isCurrent ? (
                <span style={{ fontWeight: 700, color: '#1e293b' }}>{seg}</span>
              ) : (
                <button style={{ ...S.linkBtn, color: '#f59e0b', fontWeight: 500 }} onClick={() => load(crumbPaths[i])}>
                  {seg}
                </button>
              )}
            </span>
          );
        })}
      </div>

      {error && <div style={S.errorBox}>{error}</div>}

      {/* File listing */}
      <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <p style={{ ...mutedText, padding: '1rem' }}>Loading…</p>
        ) : entries.length === 0 ? (
          <p style={{ ...mutedText, padding: '1rem' }}>Empty directory.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
            <thead>
              <tr style={{ background: '#fffbeb', borderBottom: '2px solid #fde68a' }}>
                <th style={{ textAlign: 'left', padding: '0.6rem 1rem', color: '#92400e', fontWeight: 700 }}>Name</th>
                <th style={{ textAlign: 'right', padding: '0.6rem 0.75rem', color: '#92400e', fontWeight: 700, whiteSpace: 'nowrap' }}>Size</th>
                <th style={{ textAlign: 'right', padding: '0.6rem 1rem', color: '#92400e', fontWeight: 700, whiteSpace: 'nowrap' }}>Modified</th>
                <th style={{ padding: '0.6rem 0.75rem' }} />
              </tr>
            </thead>
            <tbody>
              {path && (
                <tr style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }} onClick={() => load(crumbPaths.length > 1 ? crumbPaths[crumbPaths.length - 2] : '')}>
                  <td style={{ padding: '0.55rem 1rem', color: '#f59e0b', fontWeight: 600 }}>📁 ..</td>
                  <td /><td /><td />
                </tr>
              )}
              {entries.map((entry, i) => (
                <tr
                  key={entry.path}
                  style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 === 0 ? '#fff' : '#fffbeb', cursor: 'pointer' }}
                  onClick={() => entry.type === 'dir' ? load(entry.path) : openFile(entry)}
                >
                  <td style={{ padding: '0.55rem 1rem', color: entry.type === 'dir' ? '#2563eb' : '#374151' }}>
                    {entry.type === 'dir' ? '📁 ' : '📄 '}{entry.name}
                  </td>
                  <td style={{ padding: '0.55rem 0.75rem', textAlign: 'right', ...mutedText }}>{formatSize(entry.size)}</td>
                  <td style={{ padding: '0.55rem 1rem', textAlign: 'right', ...mutedText, fontSize: '0.78rem' }}>
                    {new Date(entry.modified).toLocaleString()}
                  </td>
                  <td style={{ padding: '0.55rem 0.5rem', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                    <a
                      href={dataDownloadUrl(phone, entry.path)}
                      download
                      title={entry.type === 'dir' ? 'Download folder as zip' : 'Download file'}
                      style={{ color: '#94a3b8', textDecoration: 'none', fontSize: '0.85rem', padding: '0.1rem 0.3rem', borderRadius: '0.25rem' }}
                      onMouseOver={e => (e.currentTarget.style.color = '#f59e0b')}
                      onMouseOut={e => (e.currentTarget.style.color = '#94a3b8')}
                    >
                      ⬇
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* File viewer */}
      {(filePath || fileLoading) && (
        <div style={{ ...S.card, display: 'grid', gap: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h3 style={{ ...subheading, margin: 0 }}>📄 {filePath.split('/').pop()}</h3>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {fileContent !== null && (
                <button style={S.smallBtn} onClick={handleCopy}>
                  {copied ? '✓ Copied!' : '📋 Copy'}
                </button>
              )}
              <button style={S.smallOutlineBtn} onClick={() => { setFileContent(null); setFilePath(''); }}>✕ Close</button>
            </div>
          </div>
          <code style={{ fontSize: '0.72rem', ...mutedText }}>{filePath}</code>
          {fileLoading && <p style={mutedText}>Loading…</p>}
          {fileError && <div style={S.errorBox}>{fileError}</div>}
          {fileContent !== null && (
            <pre style={{ background: '#0f172a', color: '#a3e635', borderRadius: '0.75rem', padding: '1rem', fontSize: '0.78rem', overflowX: 'auto', maxHeight: 500, overflowY: 'auto', margin: 0, lineHeight: 1.5 }}>
              {typeof fileContent === 'string' ? fileContent : JSON.stringify(fileContent, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
