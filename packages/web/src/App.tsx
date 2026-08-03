import { Routes, Route } from 'react-router-dom';
import { Shell } from './layouts/Shell.js';
import { ModelListPage } from './views/ModelList.js';
import { ModelView } from './views/ModelView.js';
import { RunPanel } from './views/RunPanel.js';

export function App() {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<ModelListPage />} />
        <Route path="/models/:id" element={<ModelView />} />
        <Route path="/models/:id/run" element={<RunPanel />} />
      </Routes>
    </Shell>
  );
}
