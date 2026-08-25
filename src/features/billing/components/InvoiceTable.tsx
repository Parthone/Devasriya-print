import { Link } from 'react-router-dom';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { InvoiceStatusBadge } from '@/features/billing/components/InvoiceStatusBadge';
import { outstandingOf, type Invoice } from '@/features/billing/types';
import { formatDate, formatMoney } from '@/lib/format';
import { formatMobile } from '@/lib/phone';

export function InvoiceTable({ invoices }: { invoices: Invoice[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Invoice</TableHead>
          <TableHead>Customer</TableHead>
          <TableHead>Job</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead className="text-right">Outstanding</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invoices.map((invoice) => (
          <TableRow key={invoice.id}>
            <TableCell>
              <Link
                to={`/billing/${invoice.id}`}
                className="font-medium underline-offset-2 hover:underline"
              >
                {invoice.invoiceNumber}
              </Link>
              <div className="text-xs text-muted-foreground">{formatDate(invoice.invoiceDate)}</div>
            </TableCell>
            <TableCell>
              <div className="text-sm">{invoice.customerBusinessName ?? invoice.customerName}</div>
              <div className="text-xs text-muted-foreground">
                {formatMobile(invoice.customerMobile)}
              </div>
            </TableCell>
            <TableCell className="max-w-xs">
              <div className="text-sm">{invoice.jobNumber}</div>
              <p className="truncate text-xs text-muted-foreground">{invoice.jobTitle}</p>
            </TableCell>
            <TableCell className="tabular-money text-right text-sm">
              {formatMoney(invoice.total)}
            </TableCell>
            <TableCell className="tabular-money text-right text-sm font-medium">
              {formatMoney(outstandingOf(invoice))}
            </TableCell>
            <TableCell>
              <InvoiceStatusBadge status={invoice.status} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function InvoiceCardList({ invoices }: { invoices: Invoice[] }) {
  return (
    <ul aria-label="Invoice cards" className="space-y-3">
      {invoices.map((invoice) => (
        <li key={invoice.id} className="rounded-lg border p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Link
                to={`/billing/${invoice.id}`}
                className="font-medium underline-offset-2 hover:underline"
              >
                {invoice.invoiceNumber}
              </Link>
              <p className="truncate text-xs text-muted-foreground">
                {invoice.customerBusinessName ?? invoice.customerName}
              </p>
            </div>
            <InvoiceStatusBadge status={invoice.status} />
          </div>
          <p className="mt-2 line-clamp-2 text-sm">
            {invoice.jobNumber} - {invoice.jobTitle}
          </p>
          <p className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span>Outstanding {formatMoney(outstandingOf(invoice))}</span>
            <span className="tabular-money font-medium">{formatMoney(invoice.total)}</span>
          </p>
        </li>
      ))}
    </ul>
  );
}
