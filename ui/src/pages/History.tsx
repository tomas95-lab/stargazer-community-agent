import { useState, useEffect } from 'react';
import { api, type HistoryFile } from '../api';

export default function History() {
  const [files, setFiles] = useState<HistoryFile[]>([]);
  const [selected, setSelected] = useState<{ name: string; content: string } | null>(null);

  useEffect(() => { api.getHistory().then(setFiles); }, []);

  const openFile = async (name: string) => {
    const data = await api.getHistoryFile(name);
    setSelected(data);
  };

  return (
    <div className="space-y-6 px-6">
      <h1 className="text-2xl font-semibold text-foreground">History</h1>

      {files.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">No output files yet.</p>
      ) : (
        <div className="sg-panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="sg-table">
              <thead>
                <tr className="text-left">
                  <th className="px-4 py-3">File</th>
                  <th className="px-4 py-3">Size</th>
                  <th className="px-4 py-3">Modified</th>
                </tr>
              </thead>
              <tbody>
                {files.map((f) => (
                  <tr key={f.name} className="cursor-pointer transition-colors" onClick={() => openFile(f.name)}>
                    <td className="px-4 py-3 font-mono text-primary">{f.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{(f.size / 1024).toFixed(1)} KB</td>
                    <td className="px-4 py-3 text-muted-foreground">{new Date(f.modified).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selected && (
        <div className="sg-panel overflow-hidden">
          <div className="sg-panel-header flex items-center justify-between px-4 py-2">
            <span className="text-xs font-semibold uppercase text-muted-foreground">{selected.name}</span>
            <button onClick={() => setSelected(null)} className="text-xs font-medium text-primary hover:underline">Close</button>
          </div>
          <pre className="max-h-[500px] overflow-auto whitespace-pre-wrap p-5 text-xs text-foreground">{selected.content}</pre>
        </div>
      )}
    </div>
  );
}
