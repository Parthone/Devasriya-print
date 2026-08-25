import { APP_CONFIG } from '@/config/app.config';
import { EstimateStatusBadge } from '@/features/estimates/components/EstimateStatusBadge';
import type { Estimate } from '@/features/estimates/types';
import { formatDate, formatMoney } from '@/lib/format';
import { formatMobile } from '@/lib/phone';
import { describeLineCalculation } from '@/lib/pricing';

/**
 * The quotation as the customer sees it.
 *
 * Used on screen and for printing - the print stylesheet in index.css hides the
 * application shell, so a browser print gives a clean single document without
 * needing a PDF library.
 */
export function QuotationView({ estimate }: { estimate: Estimate }) {
  return (
    <article className="space-y-6 rounded-lg border bg-card p-6 text-card-foreground print:border-0 print:p-0">
      <header className="flex flex-col gap-4 border-b pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{APP_CONFIG.name}</h2>
          <p className="text-sm text-muted-foreground">{APP_CONFIG.tagline}</p>
        </div>
        <div className="sm:text-right">
          <p className="text-lg font-semibold">Quotation</p>
          <p className="text-sm">{estimate.estimateNumber}</p>
          <p className="text-sm text-muted-foreground">Date {formatDate(estimate.estimateDate)}</p>
          <p className="text-sm text-muted-foreground">
            Valid until {formatDate(estimate.validUntil)}
          </p>
          <div className="mt-2 print:hidden">
            <EstimateStatusBadge status={estimate.status} />
          </div>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs tracking-wide text-muted-foreground uppercase">Quotation for</p>
          <p className="font-medium">{estimate.customerBusinessName ?? estimate.customerName}</p>
          {estimate.customerBusinessName ? (
            <p className="text-sm">{estimate.customerName}</p>
          ) : null}
          <p className="text-sm text-muted-foreground">{formatMobile(estimate.customerMobile)}</p>
          {estimate.customerAddress ? (
            <p className="text-sm text-muted-foreground">{estimate.customerAddress}</p>
          ) : null}
          {estimate.customerGstin ? (
            <p className="text-sm text-muted-foreground">GSTIN {estimate.customerGstin}</p>
          ) : null}
        </div>
        <div className="sm:text-right">
          <p className="text-xs tracking-wide text-muted-foreground uppercase">Job</p>
          <p className="font-medium">{estimate.jobNumber}</p>
          <p className="text-sm text-muted-foreground">{estimate.jobTitle}</p>
        </div>
      </section>

      <section>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2 font-medium">Item</th>
              <th className="py-2 font-medium">Details</th>
              <th className="py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {estimate.lines.map((line) => (
              <tr key={line.id} className="border-b align-top">
                <td className="py-2">
                  <div className="font-medium">{line.productName}</div>
                  {line.notes ? (
                    <div className="text-xs text-muted-foreground">{line.notes}</div>
                  ) : null}
                </td>
                <td className="py-2 text-muted-foreground">
                  {describeLineCalculation(line, formatMoney)}
                </td>
                <td className="tabular-money py-2 text-right">{formatMoney(line.lineAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="flex justify-end">
        <dl className="w-full max-w-xs space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="tabular-money">{formatMoney(estimate.subtotal)}</dd>
          </div>
          {estimate.adjustment ? (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{estimate.adjustment.reason}</dt>
              <dd className="tabular-money">{formatMoney(estimate.adjustment.amount)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between border-t pt-1 text-base font-semibold">
            <dt>Total</dt>
            <dd className="tabular-money">{formatMoney(estimate.total)}</dd>
          </div>
        </dl>
      </section>

      {estimate.notes ? (
        <section>
          <p className="text-xs tracking-wide text-muted-foreground uppercase">Notes</p>
          <p className="text-sm whitespace-pre-wrap">{estimate.notes}</p>
        </section>
      ) : null}

      {estimate.terms ? (
        <section>
          <p className="text-xs tracking-wide text-muted-foreground uppercase">Terms</p>
          <p className="text-sm whitespace-pre-wrap">{estimate.terms}</p>
        </section>
      ) : null}

      <footer className="border-t pt-4 text-xs text-muted-foreground">
        This is a quotation, not an invoice. Prices are in Indian rupees.
      </footer>
    </article>
  );
}
