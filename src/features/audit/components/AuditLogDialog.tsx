import { History } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { AUDIT_ACTION_LABELS } from '@/features/audit/types';
import { useUserAuditLog } from '@/features/users/hooks/use-users';
import { formatDateTime } from '@/lib/format';
import { AppError, type Id } from '@/types/common';

interface AuditLogDialogProps {
  /** Null closes the dialog and stops the query. */
  userId: Id | null;
  userName: string;
  onClose: () => void;
}

/** Read-only history of role and status changes for one employee. */
export function AuditLogDialog({ userId, userName, onClose }: AuditLogDialogProps) {
  const auditQuery = useUserAuditLog(userId);

  return (
    <Dialog
      open={userId !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Account history</DialogTitle>
          <DialogDescription>
            Role and status changes recorded for {userName}. Entries cannot be edited or deleted.
          </DialogDescription>
        </DialogHeader>

        {auditQuery.isPending ? (
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : auditQuery.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {auditQuery.error instanceof AppError
              ? auditQuery.error.message
              : 'Could not load the history.'}
          </p>
        ) : auditQuery.data.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
            <History className="size-5" aria-hidden="true" />
            <p className="text-sm">No changes recorded yet.</p>
          </div>
        ) : (
          <ol className="divide-y">
            {auditQuery.data.map((entry) => (
              <li key={entry.id} className="py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{AUDIT_ACTION_LABELS[entry.action]}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(entry.createdAt)}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {entry.before ? `${entry.before} to ${entry.after}` : entry.after}
                </p>
                <p className="text-xs text-muted-foreground">by {entry.actorName}</p>
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}
