import { IconHelp } from '../icons.js';
import { usePageTitle } from '../store.js';
import { Button, Empty } from '../ui.js';

export function NotFound() {
  usePageTitle('Not found');
  return (
    <div className="sj-page narrow">
      <Empty
        icon={<IconHelp size={30} />}
        title="This page is not here"
        action={
          <Button to="/home" trailing={null}>
            Back to home
          </Button>
        }
      >
        The link may be old, or the page may have moved. Everything you have done is safe.
      </Empty>
    </div>
  );
}
