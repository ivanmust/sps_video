import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Caller from './Caller';
import Receiver from './Receiver';
import { useEffect, useState } from 'react';

function App() {

  const [cases, setCases] = useState<{
    name: string,
    assignedTo: number
  }[]>([])

  useEffect(() => {

    fetch('/cases.json')
      .then(res => res.json())
      .then(res => {
        setCases(res)
      }).catch(err => console.error(err))

  }, [])
  return (
    <Router>
      <Routes>
        <Route path="/" element={
          <div>
            {Array(2).fill(1).map((_, index) => (
              <div key={index}></div>
            ))}
            {cases.map((_, index) => (
              <div key={index}></div>
            ))}
          </div>
        } />
        {Array(2).fill(1).map((_, index) => (
          <Route path={`/call/${index + 1}`} element={<Caller cases={cases} />} />
        ))}

        {cases.map((item, index) => (
          <Route key={index} path={`/reception/${index + 1}`} element={<Receiver id={index + 1} caseItem={item} />} />
        ))}
      </Routes>
    </Router>
  );
}

export default App;
