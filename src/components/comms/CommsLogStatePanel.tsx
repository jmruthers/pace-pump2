import { Button } from '@solvera/pace-core/components';

export function CommsLogStatePanel({
  message,
  actionLabel,
  onAction,
  showCompose,
  onCompose,
}: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  showCompose?: boolean;
  onCompose?: () => void;
}) {
  return (
    <section className="grid min-h-[240px] place-items-center">
      <>
        <p>{message}</p>
        {actionLabel != null && onAction != null ? (
          <Button type="button" variant="outline" onClick={onAction}>
            {actionLabel}
          </Button>
        ) : null}
        {showCompose === true && onCompose != null ? (
          <Button type="button" variant="default" onClick={onCompose}>
            Compose
          </Button>
        ) : null}
      </>
    </section>
  );
}
