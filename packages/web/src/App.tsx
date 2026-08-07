import { Routes, Route } from 'react-router-dom';
import { SelectionProvider } from './selection.js';
import { Shell } from './layouts/Shell.js';
import { ModelListPage } from './views/ModelList.js';
import { ModelView } from './views/ModelView.js';
import { OverviewView } from './views/OverviewView.js';
import { InputsView } from './views/InputsView.js';
import { OutputsView } from './views/OutputsView.js';
import { GraphView } from './views/GraphView.js';
import { CompatibilityView } from './views/CompatibilityView.js';
import { ProvenanceView } from './views/ProvenanceView.js';
import { UnderstandSections } from './views/UnderstandSections.js';
import { UnderstandDrivers } from './views/UnderstandDrivers.js';
import { UnderstandFlow } from './views/UnderstandFlow.js';
import { RunPanel } from './views/RunPanel.js';
import { ScenariosView } from './views/ScenariosView.js';
import { SensitivityView } from './views/SensitivityView.js';
import { TestsView } from './views/TestsView.js';
import { ClientsPage } from './views/ClientsPage.js';

export function App() {
  return (
    <SelectionProvider>
      <Routes>
        <Route element={<Shell />}>
          <Route path="/" element={<ModelListPage />} />
          <Route path="/models/:id" element={<ModelView />}>
            <Route index element={<OverviewView />} />
            <Route path="inputs" element={<InputsView />} />
            <Route path="outputs" element={<OutputsView />} />
            <Route path="graph" element={<GraphView />} />
            <Route path="sections" element={<UnderstandSections />} />
            <Route path="drivers" element={<UnderstandDrivers />} />
            <Route path="flow" element={<UnderstandFlow />} />
            <Route path="run" element={<RunPanel />} />
            <Route path="scenarios" element={<ScenariosView />} />
            <Route path="sensitivity" element={<SensitivityView />} />
            <Route path="compatibility" element={<CompatibilityView />} />
            <Route path="tests" element={<TestsView />} />
            <Route path="provenance" element={<ProvenanceView />} />
          </Route>
          <Route path="/clients" element={<ClientsPage />} />
        </Route>
      </Routes>
    </SelectionProvider>
  );
}
