import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StockHistory } from '@/features/inventory/components/StockHistory';
import { useJobMaterials } from '@/features/inventory/hooks/use-inventory';
import type { Id } from '@/types/common';

/**
 * What was taken from stock for one job.
 *
 * This is the job-wise material usage: every movement recorded against this
 * job, whichever material it came from.
 */
export function JobMaterialsCard({ jobId, canView }: { jobId: Id; canView: boolean }) {
  const history = useJobMaterials(jobId, { enabled: canView });

  if (!canView) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Material used</CardTitle>
      </CardHeader>
      <CardContent>
        <StockHistory
          transactions={history.data ?? []}
          isPending={history.isPending}
          error={history.isError ? history.error : null}
          emptyMessage="No material recorded against this job yet."
        />
      </CardContent>
    </Card>
  );
}
