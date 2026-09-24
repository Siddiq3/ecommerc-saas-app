import { useRouter } from 'expo-router';
import { Screen } from '../../src/components/Screen.jsx';
import { ProductForm } from '../../src/components/ProductForm.jsx';
import { useToast } from '../../src/components/Toast.jsx';
import { useAuth } from '../../src/state/auth.jsx';
import { useAction, useAsync } from '../../src/lib/useAsync.js';
import { categories as categoriesApi, products as productsApi } from '../../src/api/endpoints.js';

/** New product. Replaces itself with the detail screen so Back returns to the list. */
export default function NewProduct() {
  const router = useRouter();
  const toast = useToast();
  const { businessId } = useAuth();

  const { data: categories } = useAsync(
    () => (businessId ? categoriesApi.list(businessId) : Promise.resolve(null)),
    [businessId],
  );

  const { run, pending, error } = useAction(async (input) => {
    const product = await productsApi.create(businessId, input);
    toast.success('Product added');
    router.replace(`/products/${product.productId}`);
  });

  return (
    <Screen>
      <ProductForm
        businessId={businessId}
        categories={categories?.items ?? []}
        submitting={pending}
        error={error}
        submitLabel="Add product"
        onSubmit={(input) => run(input).catch(() => undefined)}
      />
    </Screen>
  );
}
