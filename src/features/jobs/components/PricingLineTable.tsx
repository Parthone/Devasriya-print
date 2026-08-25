import { PencilLine, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatMoney } from '@/lib/format';
import { describeLineCalculation, type PricingLine } from '@/lib/pricing';

interface PricingLineTableProps {
  lines: PricingLine[];
  canEdit: boolean;
  isSaving: boolean;
  onEdit: (line: PricingLine) => void;
  onRemove: (id: string) => void;
}

/** Priced items: a table on wide screens, cards on phones. */
export function PricingLineTable({
  lines,
  canEdit,
  isSaving,
  onEdit,
  onRemove,
}: PricingLineTableProps) {
  return (
    <>
      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Calculation</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              {canEdit ? <TableHead className="text-right">Actions</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line) => (
              <TableRow key={line.id}>
                <TableCell>
                  <div className="font-medium">{line.productName}</div>
                  {line.notes ? (
                    <div className="text-xs text-muted-foreground">{line.notes}</div>
                  ) : null}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {describeLineCalculation(line, formatMoney)}
                </TableCell>
                <TableCell className="tabular-money text-right text-sm font-medium">
                  {formatMoney(line.lineAmount)}
                </TableCell>
                {canEdit ? (
                  <TableCell className="text-right whitespace-nowrap">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${line.productName}`}
                      disabled={isSaving}
                      onClick={() => {
                        onEdit(line);
                      }}
                    >
                      <PencilLine className="size-4" aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${line.productName}`}
                      disabled={isSaving}
                      onClick={() => {
                        onRemove(line.id);
                      }}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul aria-label="Priced item cards" className="space-y-3 sm:hidden">
        {lines.map((line) => (
          <li key={line.id} className="rounded-md border p-3">
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium">{line.productName}</span>
              <span className="tabular-money font-medium">{formatMoney(line.lineAmount)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {describeLineCalculation(line, formatMoney)}
            </p>
            {canEdit ? (
              <div className="mt-2 flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isSaving}
                  onClick={() => {
                    onEdit(line);
                  }}
                >
                  <PencilLine className="size-4" aria-hidden="true" /> Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isSaving}
                  onClick={() => {
                    onRemove(line.id);
                  }}
                >
                  <Trash2 className="size-4" aria-hidden="true" /> Remove
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}
