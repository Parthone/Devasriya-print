import { Link } from 'react-router-dom';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EstimateStatusBadge } from '@/features/estimates/components/EstimateStatusBadge';
import type { Estimate } from '@/features/estimates/types';
import { formatDate, formatMoney } from '@/lib/format';
import { formatMobile } from '@/lib/phone';

export function EstimateTable({ estimates }: { estimates: Estimate[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Quotation</TableHead>
          <TableHead>Customer</TableHead>
          <TableHead>Job</TableHead>
          <TableHead>Valid until</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {estimates.map((estimate) => (
          <TableRow key={estimate.id}>
            <TableCell>
              <Link
                to={`/estimates/${estimate.id}`}
                className="font-medium underline-offset-2 hover:underline"
              >
                {estimate.estimateNumber}
              </Link>
              <div className="text-xs text-muted-foreground">
                {formatDate(estimate.estimateDate)}
              </div>
            </TableCell>
            <TableCell>
              <div className="text-sm">
                {estimate.customerBusinessName ?? estimate.customerName}
              </div>
              <div className="text-xs text-muted-foreground">
                {formatMobile(estimate.customerMobile)}
              </div>
            </TableCell>
            <TableCell className="max-w-xs">
              <div className="text-sm">{estimate.jobNumber}</div>
              <p className="truncate text-xs text-muted-foreground">{estimate.jobTitle}</p>
            </TableCell>
            <TableCell className="text-sm">{formatDate(estimate.validUntil)}</TableCell>
            <TableCell className="tabular-money text-right text-sm">
              {formatMoney(estimate.total)}
            </TableCell>
            <TableCell>
              <EstimateStatusBadge status={estimate.status} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function EstimateCardList({ estimates }: { estimates: Estimate[] }) {
  return (
    <ul aria-label="Quotation cards" className="space-y-3">
      {estimates.map((estimate) => (
        <li key={estimate.id} className="rounded-lg border p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Link
                to={`/estimates/${estimate.id}`}
                className="font-medium underline-offset-2 hover:underline"
              >
                {estimate.estimateNumber}
              </Link>
              <p className="truncate text-xs text-muted-foreground">
                {estimate.customerBusinessName ?? estimate.customerName}
              </p>
            </div>
            <EstimateStatusBadge status={estimate.status} />
          </div>
          <p className="mt-2 line-clamp-2 text-sm">
            {estimate.jobNumber} - {estimate.jobTitle}
          </p>
          <p className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span>Valid until {formatDate(estimate.validUntil)}</span>
            <span className="tabular-money font-medium">{formatMoney(estimate.total)}</span>
          </p>
        </li>
      ))}
    </ul>
  );
}
