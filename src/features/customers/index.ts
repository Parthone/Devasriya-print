export { CustomersPage } from './pages/CustomersPage';
export { CustomerDetailPage } from './pages/CustomerDetailPage';
export {
  useCustomerDirectory,
  useCustomer,
  useCreateCustomer,
  useUpdateCustomer,
  useSetCustomerArchived,
} from './hooks/use-customers';
export {
  listCustomers,
  getCustomer,
  findCustomer,
  createCustomer,
  updateCustomer,
  setCustomerArchived,
  CUSTOMER_FETCH_CAP,
} from './services/customer.service';
export { queryCustomers, filterCustomers, findDuplicateMobile } from './services/customer-search';
export {
  customerFormSchema,
  normaliseCustomerValues,
  toCustomerFormValues,
  customerTitle,
  CUSTOMER_TYPES,
  CUSTOMER_TYPE_LABELS,
  type Customer,
  type CustomerInput,
  type CustomerFormValues,
} from './types';
