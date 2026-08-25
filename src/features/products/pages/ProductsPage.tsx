import { Calculator, PencilLine, Plus, PowerOff, Power } from 'lucide-react';
import { useState } from 'react';

import { PageHeader } from '@/components/common/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuthenticatedUser } from '@/features/auth/hooks/use-auth';
import { ProductFormDialog } from '@/features/products/components/ProductFormDialog';
import {
  useCreateProduct,
  useProducts,
  useSetProductActive,
  useUpdateProduct,
} from '@/features/products/hooks/use-products';
import {
  PRODUCT_CATEGORY_LABELS,
  type Product,
  type ProductInput,
} from '@/features/products/types';
import { formatMoney } from '@/lib/format';
import { PRICING_METHOD_LABELS, RATE_UNIT_LABELS } from '@/lib/pricing';
import { AppError } from '@/types/common';

/** The rate card. Owner only, through settings:manage. */
export function ProductsPage() {
  const currentUser = useAuthenticatedUser();
  const productsQuery = useProducts();
  const createProduct = useCreateProduct(currentUser.uid);
  const updateProduct = useUpdateProduct(currentUser.uid);
  const setActive = useSetProductActive(currentUser.uid);

  const [isFormOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | undefined>(undefined);

  const handleSubmit = async (input: ProductInput): Promise<void> => {
    if (editing) {
      await updateProduct.mutateAsync({ id: editing.id, input });
    } else {
      await createProduct.mutateAsync(input);
    }
    setFormOpen(false);
    setEditing(undefined);
  };

  const products = productsQuery.data ?? [];

  return (
    <>
      <PageHeader
        title="Products & rates"
        description="Default rates for pricing work. Jobs keep the rate they were priced with."
        actions={
          <Button
            onClick={() => {
              setEditing(undefined);
              setFormOpen(true);
            }}
          >
            <Plus className="size-4" aria-hidden="true" /> Add item
          </Button>
        }
      />

      <Card>
        <CardContent>
          {productsQuery.isPending ? (
            <div className="space-y-2" aria-busy="true">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : productsQuery.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {productsQuery.error instanceof AppError
                ? productsQuery.error.message
                : 'Could not load the rate card.'}
            </p>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
              <Calculator className="size-6" aria-hidden="true" />
              <p className="text-sm">
                No rates yet. Add the items you sell so jobs can be priced quickly.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Priced</TableHead>
                  <TableHead className="text-right">Default rate</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell>
                      <div className="font-medium">{product.name}</div>
                      {product.description ? (
                        <div className="text-xs text-muted-foreground">{product.description}</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm">
                      {PRODUCT_CATEGORY_LABELS[product.category]}
                    </TableCell>
                    <TableCell className="text-sm">
                      {PRICING_METHOD_LABELS[product.pricingMethod]}
                    </TableCell>
                    <TableCell className="tabular-money text-right text-sm">
                      {formatMoney(product.defaultRate)}
                      <span className="text-muted-foreground">
                        /{RATE_UNIT_LABELS[product.defaultRateUnit]}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={product.isActive ? 'success' : 'secondary'}>
                        {product.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit ${product.name}`}
                        onClick={() => {
                          setEditing(product);
                          setFormOpen(true);
                        }}
                      >
                        <PencilLine className="size-4" aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={
                          product.isActive
                            ? `Deactivate ${product.name}`
                            : `Reactivate ${product.name}`
                        }
                        disabled={setActive.isPending}
                        onClick={() => {
                          setActive.mutate({ id: product.id, isActive: !product.isActive });
                        }}
                      >
                        {product.isActive ? (
                          <PowerOff className="size-4" aria-hidden="true" />
                        ) : (
                          <Power className="size-4" aria-hidden="true" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ProductFormDialog
        open={isFormOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(undefined);
        }}
        product={editing}
        isSaving={createProduct.isPending || updateProduct.isPending}
        onSubmit={handleSubmit}
      />
    </>
  );
}
