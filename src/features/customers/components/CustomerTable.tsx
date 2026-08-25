import { Archive, ArchiveRestore, MoreHorizontal, PencilLine, Eye } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  CustomerLanguageBadge,
  CustomerStatusBadge,
} from '@/features/customers/components/CustomerStatusBadge';
import { CUSTOMER_TYPE_LABELS, type Customer } from '@/features/customers/types';
import { formatMobile } from '@/lib/phone';

interface CustomerTableProps {
  customers: Customer[];
  canEdit: boolean;
  onEdit: (customer: Customer) => void;
  onToggleArchived: (customer: Customer) => void;
}

/** Desktop view of the directory. The card list is used on small screens. */
export function CustomerTable({
  customers,
  canEdit,
  onEdit,
  onToggleArchived,
}: CustomerTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Customer</TableHead>
          <TableHead>Contact</TableHead>
          <TableHead>Location</TableHead>
          <TableHead>Language</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {customers.map((customer) => (
          <TableRow key={customer.id}>
            <TableCell>
              <Link
                to={`/customers/${customer.id}`}
                className="font-medium underline-offset-2 hover:underline"
              >
                {customer.name}
              </Link>
              <div className="text-xs text-muted-foreground">
                {customer.businessName
                  ? customer.businessName
                  : CUSTOMER_TYPE_LABELS[customer.type]}
              </div>
            </TableCell>
            <TableCell>
              <div className="text-sm">{formatMobile(customer.mobile)}</div>
              {customer.email ? (
                <div className="text-xs text-muted-foreground">{customer.email}</div>
              ) : null}
            </TableCell>
            <TableCell className="text-sm">
              {customer.city}
              <div className="text-xs text-muted-foreground">{customer.state}</div>
            </TableCell>
            <TableCell>
              <CustomerLanguageBadge customer={customer} />
            </TableCell>
            <TableCell>
              <CustomerStatusBadge customer={customer} />
            </TableCell>
            <TableCell className="text-right">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label={`Actions for ${customer.name}`}>
                    <MoreHorizontal className="size-4" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link to={`/customers/${customer.id}`}>
                      <Eye className="size-4" aria-hidden="true" /> View details
                    </Link>
                  </DropdownMenuItem>
                  {canEdit ? (
                    <>
                      <DropdownMenuItem
                        onSelect={() => {
                          onEdit(customer);
                        }}
                      >
                        <PencilLine className="size-4" aria-hidden="true" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={() => {
                          onToggleArchived(customer);
                        }}
                      >
                        {customer.isArchived ? (
                          <>
                            <ArchiveRestore className="size-4" aria-hidden="true" /> Restore
                          </>
                        ) : (
                          <>
                            <Archive className="size-4" aria-hidden="true" /> Archive
                          </>
                        )}
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
