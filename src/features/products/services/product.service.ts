import { isDemoMode } from '@/config/demo';
import { addDemoProduct, demoProducts, updateDemoProduct } from '@/features/demo/demo-store';
import {
  parseProduct,
  type Product,
  type ProductCategory,
  type ProductInput,
} from '@/features/products/types';
import type { PricingMethod, RateUnit } from '@/lib/pricing';
import { getSupabase } from '@/lib/supabase/client';
import { toAppError, unwrap } from '@/lib/supabase/errors';
import { toAudit, toMoney, toOptional, type AuditRow } from '@/lib/supabase/rows';
import { TABLES } from '@/services/base/tables';
import type { Id } from '@/types/common';

interface ProductRow extends AuditRow {
  id: string;
  name: string;
  category: ProductCategory;
  pricing_method: PricingMethod;
  default_rate_paise: number | string;
  default_rate_unit: RateUnit;
  description: string | null;
  is_active: boolean;
}

const COLUMNS =
  'id, name, category, pricing_method, default_rate_paise, default_rate_unit, description,' +
  ' is_active, created_at, created_by, updated_at, updated_by';

function toProduct(row: ProductRow): Product {
  return parseProduct(
    {
      id: row.id,
      name: row.name,
      category: row.category,
      pricingMethod: row.pricing_method,
      defaultRate: toMoney(row.default_rate_paise),
      defaultRateUnit: row.default_rate_unit,
      description: toOptional(row.description),
      isActive: row.is_active,
      ...toAudit(row),
    },
    row.id,
  );
}

function toRow(input: ProductInput, actorId: Id) {
  return {
    name: input.name,
    category: input.category,
    pricing_method: input.pricingMethod,
    default_rate_paise: input.defaultRate.paise,
    default_rate_unit: input.defaultRateUnit,
    description: input.description ?? null,
    is_active: input.isActive,
    updated_by: actorId,
  };
}

/** The rate card. Readable by any active staff member who prices work. */
export async function listProducts(): Promise<Product[]> {
  if (isDemoMode()) return demoProducts();

  const rows = unwrap(
    await getSupabase()
      .from(TABLES.products)
      .select(COLUMNS)
      .order('name', { ascending: true })
      .limit(200)
      .returns<ProductRow[]>(),
  );
  return rows.map(toProduct);
}

export async function createProduct(input: ProductInput, actorId: Id): Promise<Product> {
  if (isDemoMode()) return addDemoProduct(input, actorId);

  try {
    const row = unwrap(
      await getSupabase()
        .from(TABLES.products)
        .insert({ ...toRow(input, actorId), created_by: actorId })
        .select(COLUMNS)
        .single<ProductRow>(),
    );
    return toProduct(row);
  } catch (error) {
    throw toAppError(error);
  }
}

/**
 * Edits a rate card entry.
 *
 * This changes what new pricing lines start from. Lines already saved on a job
 * keep the rate they were priced with - the line stores the rate itself, not a
 * reference to this row.
 */
export async function updateProduct(id: Id, input: ProductInput, actorId: Id): Promise<void> {
  if (isDemoMode()) {
    updateDemoProduct(id, input, actorId);
    return;
  }

  try {
    const { error } = await getSupabase()
      .from(TABLES.products)
      .update(toRow(input, actorId))
      .eq('id', id);
    if (error) throw error;
  } catch (error) {
    throw toAppError(error);
  }
}

/** Products are deactivated, never deleted: old jobs still name them. */
export async function setProductActive(id: Id, isActive: boolean, actorId: Id): Promise<void> {
  if (isDemoMode()) {
    updateDemoProduct(id, { isActive }, actorId);
    return;
  }

  try {
    const { error } = await getSupabase()
      .from(TABLES.products)
      .update({ is_active: isActive, updated_by: actorId })
      .eq('id', id);
    if (error) throw error;
  } catch (error) {
    throw toAppError(error);
  }
}
