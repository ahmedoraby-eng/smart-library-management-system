import { ConfirmDialog } from "../../components/ui";

/** ux.md §3.5: deactivating needs a confirmation; reactivating doesn't (it is reversible and harmless). */
export function DeactivateDialog({ name, loading, onConfirm, onCancel }: { name: string; loading?: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <ConfirmDialog
      title={`Deactivate ${name}?`}
      confirmLabel="Deactivate"
      destructive
      loading={loading}
      onConfirm={onConfirm}
      onCancel={onCancel}
      testId="deactivate-dialog"
    >
      <p>They won't be able to borrow until reactivated. Their current loans stay open.</p>
    </ConfirmDialog>
  );
}
