import { Link } from 'react-router-dom';
import { ChevronLeft } from '@solvera/pace-core/icons';

export interface ComposePageChromeProps {
  organisationName: string;
}

export function ComposePageChrome({ organisationName }: ComposePageChromeProps) {
  return (
    <header className="grid gap-4">
      <nav aria-label="Breadcrumb">
        <Link to="/">Comms log</Link>
        <span> / </span>
        <span>Compose</span>
      </nav>
      <Link to="/" className="grid w-fit grid-flow-col items-center gap-2">
        <ChevronLeft aria-hidden width={16} height={16} />
        Back to comms log
      </Link>
      <h1>Compose</h1>
      <p>Send a message to members of {organisationName}</p>
    </header>
  );
}
