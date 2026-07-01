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
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">History</h1>

      {files.length === 0 ? (
        <p className="text-gray-500 text-center py-12">No output files yet.</p>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left text-xs uppercase text-gray-500">
                <th className="px-4 py-3">File</th>
                <th className="px-4 py-3">Size</th>
                <th className="px-4 py-3">Modified</th>
              </tr>
            </thead>
            <tbody>
              {files.map((f) => (
                <tr key={f.name} className="border-b border-gray-800/50 hover:bg-gray-800/40 cursor-pointer transition-colors" onClick={() => openFile(f.name)}>
                  <td className="px-4 py-3 font-mono text-indigo-400">{f.name}</td>
                  <td className="px-4 py-3 text-gray-400">{(f.size / 1024).toFixed(1)} KB</td>
                  <td className="px-4 py-3 text-gray-500">{new Date(f.modified).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{selected.name}</span>
            <button onClick={() => setSelected(null)} className="text-gray-500 hover:text-white text-xs">Close</button>
          </div>
          <pre className="p-5 text-xs text-gray-300 overflow-auto max-h-[500px] whitespace-pre-wrap">{selected.content}</pre>
        </div>
      )}
    </div>
  );
}
