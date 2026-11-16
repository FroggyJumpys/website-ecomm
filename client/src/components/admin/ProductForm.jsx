import { useRef, useState } from 'react';
import { Checkbox, Input, Select, Textarea } from '../ui/Form.jsx';
import { FormAlert } from '../ui/FormAlert.jsx';
import { formatIDR, slugify } from '../../lib/format.js';
import { focusFirstInvalid } from '../../lib/focus.js';
import { validateProduct } from '../../lib/validation.js';

function splitList(value) {
  return String(value ?? '')
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function toFormValues(product) {
  if (!product) return {};

  return {
    name: product.name,
    slug: product.slug,
    categorySlug: product.categorySlug,
    brandSlug: product.brandSlug,
    price: String(product.price),
    compareAtPrice: product.compareAtPrice ? String(product.compareAtPrice) : '',
    stock: String(product.stock),
    material: product.material,
    dimensions: product.dimensions,
    description: product.description,
    colors: (product.colors ?? []).join(', '),
    sizes: (product.sizes ?? []).join(', '),
    images: (product.images ?? []).join('\n'),
    isNew: Boolean(product.isNew),
    isTrending: Boolean(product.isTrending),
    isActive: product.isActive !== false,
  };
}

function Section({ title, children }) {
  return (
    <fieldset className="space-y-4 border-t border-sand pt-5 first:border-t-0 first:pt-0">
      <legend className="text-spec text-ink-soft">{title}</legend>
      {children}
    </fieldset>
  );
}

/**
 * Create/edit form for a product, rendered inside a Drawer so the list stays
 * visible behind it. Prices are typed as whole Rupiah; the field shows the
 * formatted amount underneath so separators are never guessed wrong.
 */
export function ProductForm({ product, categories, brands, submitting, onSubmit }) {
  const formRef = useRef(null);
  const [values, setValues] = useState(() => ({
    name: '',
    slug: '',
    categorySlug: categories[0]?.slug ?? '',
    brandSlug: brands[0]?.slug ?? '',
    price: '',
    compareAtPrice: '',
    stock: '0',
    material: '',
    dimensions: '',
    description: '',
    colors: '',
    sizes: '',
    images: '',
    isNew: false,
    isTrending: false,
    isActive: true,
    ...toFormValues(product),
  }));
  const [slugTouched, setSlugTouched] = useState(Boolean(product?.slug));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [brokenPreview, setBrokenPreview] = useState('');

  const updateField = (field) => (event) => {
    const { type, checked, value } = event.target;

    setValues((current) => ({
      ...current,
      [field]: type === 'checkbox' ? checked : value,
    }));

    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setFormError('');
  };

  const updateName = (event) => {
    const name = event.target.value;

    setValues((current) => ({
      ...current,
      name,
      ...(slugTouched ? {} : { slug: slugify(name) }),
    }));

    setErrors((current) => {
      if (!current.name) return current;
      const next = { ...current };
      delete next.name;
      return next;
    });
  };

  const updateSlug = (event) => {
    setSlugTouched(true);
    updateField('slug')(event);
  };

  const images = splitList(values.images);
  const preview = images[0];
  const priceHint = Number(values.price) > 0 ? formatIDR(Number(values.price)) : undefined;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;

    const payload = {
      ...values,
      price: Number(values.price),
      compareAtPrice: values.compareAtPrice ? Number(values.compareAtPrice) : null,
      stock: Number(values.stock),
      colors: splitList(values.colors),
      sizes: splitList(values.sizes),
      images: splitList(values.images),
    };

    const fieldErrors = validateProduct(payload);
    setErrors(fieldErrors);
    setFormError('');

    if (Object.keys(fieldErrors).length > 0) {
      focusFirstInvalid(formRef.current);
      return;
    }

    try {
      await onSubmit(payload);
    } catch (error) {
      setFormError(error.message || 'Produk tidak dapat disimpan. Coba lagi.');
    }
  };

  return (
    <form ref={formRef} id="form-produk" onSubmit={handleSubmit} noValidate className="space-y-5">
      {formError && <FormAlert message={formError} />}

      <Section title="Identitas">
        <Input
          id="produk-nama"
          label="Nama produk"
          value={values.name}
          onChange={updateName}
          error={errors.name}
          required
        />
        <Input
          id="produk-slug"
          label="Slug URL"
          hint="Dibuat otomatis dari nama. Ubah hanya bila perlu."
          value={values.slug}
          onChange={updateSlug}
          error={errors.slug}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            id="produk-kategori"
            label="Kategori"
            value={values.categorySlug}
            onChange={updateField('categorySlug')}
            error={errors.categorySlug}
            required
          >
            {categories.map((category) => (
              <option key={category.slug} value={category.slug}>
                {category.name}
              </option>
            ))}
          </Select>
          <Select
            id="produk-merek"
            label="Merek"
            value={values.brandSlug}
            onChange={updateField('brandSlug')}
            error={errors.brandSlug}
            required
          >
            {brands.map((brand) => (
              <option key={brand.slug} value={brand.slug}>
                {brand.name}
              </option>
            ))}
          </Select>
        </div>
      </Section>

      <Section title="Harga & stok">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            id="produk-harga"
            label="Harga jual (Rp)"
            type="number"
            inputMode="numeric"
            min="0"
            step="1000"
            value={values.price}
            onChange={updateField('price')}
            error={errors.price}
            hint={priceHint}
            required
          />
          <Input
            id="produk-harga-asli"
            label="Harga sebelum diskon (Rp)"
            type="number"
            inputMode="numeric"
            min="0"
            step="1000"
            value={values.compareAtPrice}
            onChange={updateField('compareAtPrice')}
            error={errors.compareAtPrice}
            hint="Kosongkan bila tidak sedang diskon."
          />
        </div>
        <Input
          id="produk-stok"
          label="Stok"
          type="number"
          inputMode="numeric"
          min="0"
          step="1"
          value={values.stock}
          onChange={updateField('stock')}
          error={errors.stock}
          hint="Jumlah unit yang siap dikirim. 0 berarti stok habis."
          required
        />
      </Section>

      <Section title="Detail">
        <Input
          id="produk-bahan"
          label="Bahan"
          value={values.material}
          onChange={updateField('material')}
          error={errors.material}
          hint="Misalnya: Kayu ulin solid, finishing minyak alami."
          required
        />
        <Input
          id="produk-dimensi"
          label="Dimensi"
          value={values.dimensions}
          onChange={updateField('dimensions')}
          error={errors.dimensions}
          hint="Format bebas, misalnya 180 × 90 × 76 cm."
          required
        />
        <Textarea
          id="produk-deskripsi"
          label="Deskripsi"
          rows={4}
          value={values.description}
          onChange={updateField('description')}
          error={errors.description}
          required
        />
      </Section>

      <Section title="Varian & gambar">
        <Input
          id="produk-warna"
          label="Warna"
          value={values.colors}
          onChange={updateField('colors')}
          error={errors.colors}
          hint="Pisahkan dengan koma. Warna pertama jadi pilihan awal."
          required
        />
        <Input
          id="produk-ukuran"
          label="Ukuran"
          value={values.sizes}
          onChange={updateField('sizes')}
          error={errors.sizes}
          hint="Pisahkan dengan koma. Boleh dikosongkan."
        />

        <Textarea
          id="produk-gambar"
          label="Gambar"
          rows={3}
          value={values.images}
          onChange={updateField('images')}
          error={errors.images}
          hint="Satu path per baris, misalnya /images/products/product1.jpg."
          required
        />

        {preview && preview !== brokenPreview ? (
          <div className="flex items-center gap-3">
            <img
              src={preview}
              alt=""
              loading="lazy"
              className="size-16 rounded-field bg-sand object-cover"
              onError={() => setBrokenPreview(preview)}
            />
            <p className="text-spec text-ink-soft">Pratinjau gambar pertama.</p>
          </div>
        ) : (
          preview && (
            <p className="text-spec text-danger">
              Gambar tidak dapat dimuat. Periksa path-nya.
            </p>
          )
        )}
      </Section>

      <Section title="Tampilan">
        <Checkbox
          id="produk-baru"
          label="Tandai sebagai produk baru"
          checked={values.isNew}
          onChange={updateField('isNew')}
        />
        <Checkbox
          id="produk-trending"
          label="Tampilkan di bagian trending"
          checked={values.isTrending}
          onChange={updateField('isTrending')}
        />
        <Checkbox
          id="produk-aktif"
          label="Tampilkan di toko"
          hint="Produk yang disembunyikan tetap ada di pesanan lama."
          checked={values.isActive}
          onChange={updateField('isActive')}
        />
      </Section>
    </form>
  );
}
