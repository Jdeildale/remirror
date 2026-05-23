import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const root = createRoot(document.getElementById('root')!);
root.render(
  <div className="flex items-center justify-center h-full">
    <span className="text-muted">Remirror renderer loading…</span>
  </div>
);
