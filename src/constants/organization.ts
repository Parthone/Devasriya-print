/**
 * Organisation vocabulary: departments and designations.
 *
 * These are fixed lists for now. They live behind `getDepartments()` /
 * `getDesignations()` so the Settings module can later serve them from
 * Firestore without any form or validation code changing shape.
 */
export const DEPARTMENTS = [
  'management',
  'sales',
  'design',
  'printing',
  'finishing',
  'installation',
  'accounts',
  'stores',
] as const;

export type Department = (typeof DEPARTMENTS)[number];

export const DEPARTMENT_LABELS: Record<Department, string> = {
  management: 'Management',
  sales: 'Sales & Front Desk',
  design: 'Design Studio',
  printing: 'Printing',
  finishing: 'Finishing',
  installation: 'Installation',
  accounts: 'Accounts',
  stores: 'Stores & Inventory',
};

export const DESIGNATIONS = [
  'owner',
  'manager',
  'supervisor',
  'sales-executive',
  'graphic-designer',
  'machine-operator',
  'finishing-staff',
  'installer',
  'accountant',
  'store-keeper',
  'helper',
] as const;

export type Designation = (typeof DESIGNATIONS)[number];

export const DESIGNATION_LABELS: Record<Designation, string> = {
  owner: 'Owner',
  manager: 'Manager',
  supervisor: 'Supervisor',
  'sales-executive': 'Sales Executive',
  'graphic-designer': 'Graphic Designer',
  'machine-operator': 'Machine Operator',
  'finishing-staff': 'Finishing Staff',
  installer: 'Installer',
  accountant: 'Accountant',
  'store-keeper': 'Store Keeper',
  helper: 'Helper',
};

export interface LabelledOption<T extends string> {
  value: T;
  label: string;
}

export function getDepartments(): LabelledOption<Department>[] {
  return DEPARTMENTS.map((value) => ({ value, label: DEPARTMENT_LABELS[value] }));
}

export function getDesignations(): LabelledOption<Designation>[] {
  return DESIGNATIONS.map((value) => ({ value, label: DESIGNATION_LABELS[value] }));
}
