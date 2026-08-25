import { IndianRupee } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PAYMENT_MODE_LABELS, type Payment } from '@/features/billing/types';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import { AppError } from '@/types/common';

interface PaymentHistoryProps {
  payments: Payment[];
  isPending: boolean;
  error: unknown;
}

/**
 * Every receipt against one bill.
 *
 * This is a ledger, not a list of editable rows: there is no update or delete
 * path to the payments table anywhere in the system.
 */
export function PaymentHistory({ payments, isPending, error }: PaymentHistoryProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment history</CardTitle>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : error ? (
          <p role="alert" className="text-sm text-destructive">
            {error instanceof AppError ? error.message : 'Could not load the payment history.'}
          </p>
        ) : payments.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center text-muted-foreground">
            <IndianRupee className="size-5" aria-hidden="true" />
            <p className="text-sm">Nothing received against this invoice yet.</p>
          </div>
        ) : (
          <ol className="divide-y">
            {payments.map((payment) => (
              <li key={payment.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {formatMoney(payment.amount)}
                    <span className="ml-2 font-normal text-muted-foreground">
                      {PAYMENT_MODE_LABELS[payment.mode]}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Received {formatDate(payment.paidAt)} by {payment.recordedBy}
                  </p>
                  {payment.reference ? (
                    <p className="text-xs text-muted-foreground">Ref {payment.reference}</p>
                  ) : null}
                  {payment.note ? <p className="mt-1 text-sm">{payment.note}</p> : null}
                </div>
                <span className="text-xs whitespace-nowrap text-muted-foreground">
                  {formatDateTime(payment.paidAt)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
