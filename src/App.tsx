import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Caller from './Caller';
import Receiver from './Receiver';

function App() {
  const [cases, setCases] = useState<{ name: string; assignedTo: number }[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/cases.json')
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => setCases(data))
      .catch((err) => {
        console.error('Failed to fetch cases:', err);
        setError('Failed to load case data.');
      });
  }, []);

  if (error) {
    return <div>Error: {error}</div>;
  }

  if (cases === null) {
    return <div>Loading cases...</div>;
  }

  return (
    <Router>
      <Routes>
        <Route path="/" element={<div>Welcome to the Video Call App</div>} />
        {cases.map((_, index) => (
          <Route
            key={`caller-${index}`}
            path={`/call/${index + 1}`}
            element={<Caller cases={cases} />}
          />
        ))}
        {cases.map((caseItem, index) => (
          <Route
            key={`receiver-${index}`}
            path={`/reception/${index + 1}`}
            element={<Receiver id={index + 1} caseItem={caseItem} />}
          />
        ))}
      </Routes>
    </Router>
  );
}

export default App;
