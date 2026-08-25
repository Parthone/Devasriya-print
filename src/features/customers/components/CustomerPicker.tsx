import { Check, Search, UserRound } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCustomerDirectory } from '@/features/customers/hooks/use-customers';
import { filterCustomers } from '@/features/customers/services/customer-search';
import type { Customer } from '@/features/customers/types';
import { formatMobile } from '@/lib/phone';

interface CustomerPickerProps {
  value: string;
  /** Receives the chosen customer, or null when the selection is cleared. */
  onSelect: (customer: Customer | null) => void;
  disabled?: boolean;
}

const MAX_SUGGESTIONS = 6;

/**
 * Picks the customer an enquiry or job belongs to.
 *
 * Searches the cached customer directory, so it costs no extra reads and works
 * the same way the customer screens do.
 */
export function CustomerPicker({ value, onSelect, disabled = false }: CustomerPickerProps) {
  const directory = useCustomerDirectory();
  const [term, setTerm] = useState('');

  const customers = useMemo(() => directory.data?.customers ?? [], [directory.data]);
  const selected = customers.find((customer) => customer.id === value) ?? null;

  const suggestions = useMemo(() => {
    if (!term.trim()) return [];
    return filterCustomers(customers, term, 'active').slice(0, MAX_SUGGESTIONS);
  }, [customers, term]);

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {selected.businessName ? `${selected.name} (${selected.businessName})` : selected.name}
          </p>
          <p className="text-xs text-muted-foreground">{formatMobile(selected.mobile)}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => {
            setTerm('');
            onSelect(null);
          }}
        >
          Change
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search
          className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          value={term}
          disabled={disabled}
          onChange={(event) => {
            setTerm(event.target.value);
          }}
          placeholder="Search customer by name, business or mobile"
          aria-label="Search customer"
          className="pl-8"
        />
      </div>

      {directory.isPending ? (
        <p className="text-xs text-muted-foreground">Loading customers...</p>
      ) : term.trim() && suggestions.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No active customer matches. Add the customer first.
        </p>
      ) : (
        <ul className="space-y-1">
          {suggestions.map((customer) => (
            <li key={customer.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent"
                onClick={() => {
                  onSelect(customer);
                  setTerm('');
                }}
              >
                <UserRound className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{customer.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {formatMobile(customer.mobile)}
                    {customer.businessName ? ` - ${customer.businessName}` : ''}
                  </span>
                </span>
                <Check
                  className="size-4 shrink-0 text-muted-foreground opacity-0"
                  aria-hidden="true"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
