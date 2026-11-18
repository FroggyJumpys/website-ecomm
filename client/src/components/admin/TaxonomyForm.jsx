import { useRef, useState } from 'react';
import { Input, Textarea } from '../ui/Form.jsx';
import { FormAlert } from '../ui/FormAlert.jsx';
import { slugify } from '../../lib/format.js';
import { focusFirstInvalid } from '../../lib/focus.js';
import { validateTaxonomy } from '../../lib/validation.js';

/**
 * Create/edit form for a category or a brand. Both are the same shape except
 * that a category carries a description and a cover image, so `kind` decides
 * which fields are shown instead of duplicating the form.
 */
export function TaxonomyForm({ kind, item, submitting, onSubmit }) {
  const isCategory = kind === 'category';
  const noun = isCategory ? 'kategori' : 'merek';
  const formRef = useRef(null);

  const [values, setValues] = useState(() => ({
    name: item?.name ?? '',
    slug: item?.slug ?? '',
    description: item?.description ?? '',
    image: item?.image ?? '',
  }));
  const [slugTouched, setSlugTouched] = useState(Boolean(item?.slug));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');

  const updateField = (field) => (event) => {
    const { value } = event.target;

    setValues((current) => ({
      ...current,
      [field]: value,
      ...(field === 'name' && !slugTouched ? { slug: slugify(value) } : {}),
    }));

    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setFormError('');
  };

  const handleSlug = (event) => {
    setSlugTouched(true);
    updateField('slug')(event);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;

    const payload = {
      name: values.name,
      ...(values.slug.trim() ? { slug: values.slug.trim() } : {}),
      ...(isCategory ? { description: values.description, image: values.image } : {}),
    };

    const fieldErrors = validateTaxonomy(payload);
    setErrors(fieldErrors);
    setFormError('');

    if (Object.keys(fieldErrors).length > 0) {
      focusFirstInvalid(formRef.current);
      return;
    }

    try {
      await onSubmit(payload);
    } catch (error) {
      setFormError(error.message || `Data ${noun} tidak dapat disimpan. Coba lagi.`);
    }
  };

  return (
    <form ref={formRef} id="form-taxonomy" onSubmit={handleSubmit} noValidate className="space-y-4">
      {formError && <FormAlert message={formError} />}

      <Input
        id={`${noun}-nama`}
        label={`Nama ${noun}`}
        value={values.name}
        onChange={updateField('name')}
        error={errors.name}
        required
      />

      <Input
        id={`${noun}-slug`}
        label="Slug URL"
        hint="Dibuat otomatis dari nama. Ubah hanya bila perlu."
        value={values.slug}
        onChange={handleSlug}
        error={errors.slug}
      />

      {isCategory && (
        <>
          <Textarea
            id="kategori-deskripsi"
            label="Deskripsi"
            rows={3}
            value={values.description}
            onChange={updateField('description')}
            error={errors.description}
            hint="Satu atau dua kalimat, dipakai di halaman kategori."
          />
          <Input
            id="kategori-gambar"
            label="Gambar kategori"
            value={values.image}
            onChange={updateField('image')}
            error={errors.image}
            hint="Path gambar, misalnya /images/category/category-1.jpg."
          />
        </>
      )}
    </form>
  );
}
