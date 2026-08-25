import { Link } from 'react-router-dom';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EnquiryStatusBadge } from '@/features/enquiries/components/EnquiryStatusBadge';
import { ENQUIRY_SOURCE_LABELS, type Enquiry } from '@/features/enquiries/types';
import { formatDate } from '@/lib/format';
import { formatMobile } from '@/lib/phone';

export function EnquiryTable({ enquiries }: { enquiries: Enquiry[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Enquiry</TableHead>
          <TableHead>Customer</TableHead>
          <TableHead>Requirement</TableHead>
          <TableHead>Follow-up</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {enquiries.map((enquiry) => (
          <TableRow key={enquiry.id}>
            <TableCell>
              <Link
                to={`/enquiries/${enquiry.id}`}
                className="font-medium underline-offset-2 hover:underline"
              >
                {enquiry.enquiryNumber}
              </Link>
              <div className="text-xs text-muted-foreground">
                {formatDate(enquiry.enquiryDate)} - {ENQUIRY_SOURCE_LABELS[enquiry.source]}
              </div>
            </TableCell>
            <TableCell>
              <div className="text-sm">{enquiry.customerName}</div>
              <div className="text-xs text-muted-foreground">
                {formatMobile(enquiry.customerMobile)}
              </div>
            </TableCell>
            <TableCell className="max-w-xs">
              <p className="truncate text-sm">{enquiry.requirementText}</p>
              {enquiry.requirementAudio ? (
                <span className="text-xs text-muted-foreground">Voice note attached</span>
              ) : null}
            </TableCell>
            <TableCell className="text-sm">
              {enquiry.nextFollowUpAt ? formatDate(enquiry.nextFollowUpAt) : '-'}
            </TableCell>
            <TableCell>
              <EnquiryStatusBadge status={enquiry.status} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function EnquiryCardList({ enquiries }: { enquiries: Enquiry[] }) {
  return (
    <ul aria-label="Enquiry cards" className="space-y-3">
      {enquiries.map((enquiry) => (
        <li key={enquiry.id} className="rounded-lg border p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Link
                to={`/enquiries/${enquiry.id}`}
                className="font-medium underline-offset-2 hover:underline"
              >
                {enquiry.enquiryNumber}
              </Link>
              <p className="truncate text-xs text-muted-foreground">
                {enquiry.customerName} - {formatMobile(enquiry.customerMobile)}
              </p>
            </div>
            <EnquiryStatusBadge status={enquiry.status} />
          </div>
          <p className="mt-2 line-clamp-2 text-sm">{enquiry.requirementText}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {formatDate(enquiry.enquiryDate)}
            {enquiry.nextFollowUpAt ? ` - follow up ${formatDate(enquiry.nextFollowUpAt)}` : ''}
          </p>
        </li>
      ))}
    </ul>
  );
}
