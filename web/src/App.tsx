import { useEffect, useState } from 'react';

// Skeleton page. Block D builds the real UI.
export function App() {
  const [server, setServer] = useState('checking');
  useEffect(() => {
    fetch('/api/health').then((r) => r.json()).then(() => setServer('up'), () => setServer('down'));
  }, []);

  return (
    <main className="p-8">
      <h1 className="inline-block border-[3px] border-[#111] bg-[#ffd23f] px-4 py-2 text-4xl font-black shadow-[4px_4px_0_#111]">
        Nammit
      </h1>
      <p className="mt-4">Server: {server}</p>
    </main>
  );
}
