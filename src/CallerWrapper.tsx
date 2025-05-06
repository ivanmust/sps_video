import { useParams } from 'react-router-dom';
import Caller from './Caller';

const CallerWrapper = ({ cases }: { cases: { name: string; assignedTo: number }[] }) => {
  const { id, type } = useParams();

  const kioskId = Number(id);
  const filteredCases = cases.filter(c => c.name.toLowerCase() === type?.toLowerCase());

  return (
    <Caller
      kioskId={kioskId}
      cases={filteredCases.length > 0 ? filteredCases : cases}
    />
  );
};

export default CallerWrapper;
