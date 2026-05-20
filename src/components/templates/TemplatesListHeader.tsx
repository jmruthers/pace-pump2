import {
  Button,
  Input,
  Switch,
  Label,
} from '@solvera/pace-core/components';

export interface TemplatesListHeaderProps {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  showRetired: boolean;
  onShowRetiredChange: (value: boolean) => void;
  canCreate: boolean;
  onCreateClick: () => void;
}

export function TemplatesListHeader({
  searchQuery,
  onSearchQueryChange,
  showRetired,
  onShowRetiredChange,
  canCreate,
  onCreateClick,
}: TemplatesListHeaderProps) {
  return (
    <header className="grid gap-4 py-4 md:grid-cols-[auto_1fr] md:items-center">
      <h1>Templates</h1>
      <section className="grid gap-4 md:grid-cols-[16rem_auto_auto] md:items-center md:justify-end">
        <Input
          className="w-full md:w-64"
          placeholder="Search templates"
          value={searchQuery}
          onChange={onSearchQueryChange}
          aria-label="Search templates"
        />
        <Label htmlFor="show-retired-switch">
          Show retired
          <Switch
            id="show-retired-switch"
            checked={showRetired}
            onChange={onShowRetiredChange}
            aria-label="Show retired templates"
          />
        </Label>
        {canCreate ? (
          <Button
            type="button"
            variant="default"
            onClick={onCreateClick}
            aria-label="Create template"
          >
            Create template
          </Button>
        ) : null}
      </section>
    </header>
  );
}
