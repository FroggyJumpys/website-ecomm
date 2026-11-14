import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FiCheck, FiShield, FiShoppingBag, FiTruck } from 'react-icons/fi';
import { FaWhatsapp } from 'react-icons/fa6';
import { Button } from '../ui/Button.jsx';
import { buttonStyles } from '../ui/buttonStyles.js';
import { Price } from '../ui/Price.jsx';
import { QuantityStepper } from '../ui/QuantityStepper.jsx';
import { Rating } from '../ui/Rating.jsx';
import { WishlistButton } from './WishlistButton.jsx';
import { useCart } from '../../context/cartContext.js';
import { cn } from '../../lib/cn.js';
import { routes } from '../../lib/nav.js';
import { COLOR_SWATCH } from '../../lib/shopParams.js';

const WHATSAPP_NUMBER = '6281100000000';

const optionBase =
  'flex cursor-pointer items-center gap-2 rounded-full border px-3.5 py-1.5 text-[0.8125rem] ' +
  'transition focus-within:ring-2 focus-within:ring-primary/50';

/**
 * Everything needed to choose and add one product: title, price, variant
 * pickers, quantity, the primary action and the delivery reassurance. Selection
 * is local state, reset per product by the page's `key`.
 */
export function ProductPurchase({ product }) {
  const { addItem } = useCart();
  const colors = product.colors ?? [];
  const sizes = product.sizes ?? [];
  const stock = Number(product.stock) || 0;

  const [color, setColor] = useState(colors[0] ?? '');
  const [size, setSize] = useState(sizes[0] ?? '');
  const [quantity, setQuantity] = useState(1);
  const [justAdded, setJustAdded] = useState(false);

  const soldOut = stock <= 0;
  const lowStock = stock > 0 && stock <= 5;

  const whatsappHref = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
    `Halo BaDekor, saya ingin bertanya tentang ${product.name}.`
  )}`;

  const chooseColor = (value) => {
    setColor(value);
    setJustAdded(false);
  };

  const chooseSize = (value) => {
    setSize(value);
    setJustAdded(false);
  };

  const chooseQuantity = (value) => {
    setQuantity(value);
    setJustAdded(false);
  };

  const handleAdd = () => {
    addItem(product, { color, size, quantity });
    setJustAdded(true);
  };

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-spec text-ink-soft">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {product.category && (
            <Link
              to={`${routes.shop}?kategori=${product.category.slug}`}
              className="transition hover:text-ink hover:underline underline-offset-4"
            >
              {product.category.name}
            </Link>
          )}
          {product.brand && <span>oleh {product.brand.name}</span>}
        </div>

        <WishlistButton product={product} variant="plain" />
      </div>

      <h1 className="mt-2 text-title text-ink">{product.name}</h1>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Rating value={product.rating} count={product.reviewCount} size="md" />
      </div>

      <div className="mt-5">
        <Price amount={product.price} compareAt={product.compareAtPrice} size="xl" />
      </div>

      <p className="mt-4 max-w-prose text-sm leading-relaxed text-ink-soft">
        {product.description}
      </p>

      <div className="mt-6 space-y-5 border-t border-sand pt-6">
        {colors.length > 0 && (
          <fieldset>
            <legend className="text-spec text-ink-soft">Warna</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {colors.map((option) => {
                const selected = color === option;

                return (
                  <label
                    key={option}
                    className={cn(
                      optionBase,
                      selected
                        ? 'border-ink bg-ink text-paper'
                        : 'border-ink/15 text-ink hover:border-ink/40'
                    )}
                  >
                    <input
                      type="radio"
                      name="warna"
                      value={option}
                      checked={selected}
                      onChange={() => chooseColor(option)}
                      className="sr-only"
                    />
                    <span
                      aria-hidden="true"
                      className="size-3 rounded-full ring-1 ring-inset ring-black/20"
                      style={{ backgroundColor: COLOR_SWATCH[option] ?? '#c9c2b8' }}
                    />
                    {option}
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}

        {sizes.length > 0 && (
          <fieldset>
            <legend className="text-spec text-ink-soft">Ukuran</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {sizes.map((option) => {
                const selected = size === option;

                return (
                  <label
                    key={option}
                    className={cn(
                      optionBase,
                      selected
                        ? 'border-ink bg-ink text-paper'
                        : 'border-ink/15 text-ink hover:border-ink/40'
                    )}
                  >
                    <input
                      type="radio"
                      name="ukuran"
                      value={option}
                      checked={selected}
                      onChange={() => chooseSize(option)}
                      className="sr-only"
                    />
                    {option}
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}

        <div>
          <p className="text-spec text-ink-soft">Jumlah</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
            {soldOut ? (
              <span className="text-sm text-danger">Stok habis</span>
            ) : (
              <QuantityStepper
                value={quantity}
                onChange={chooseQuantity}
                max={stock}
                label="Jumlah"
              />
            )}
            {!soldOut && (
              <p
                className={cn(
                  'text-spec',
                  lowStock ? 'text-warning' : 'text-ink-soft'
                )}
              >
                {lowStock ? `Tersisa ${stock} unit` : 'Stok tersedia'}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Button
          size="lg"
          onClick={handleAdd}
          disabled={soldOut}
          className="sm:flex-1"
          aria-describedby={justAdded ? 'keranjang-status' : undefined}
        >
          <FiShoppingBag className="size-4" aria-hidden="true" />
          {soldOut ? 'Stok habis' : 'Tambah ke keranjang'}
        </Button>

        <a
          href={whatsappHref}
          target="_blank"
          rel="noreferrer"
          className={buttonStyles({ variant: 'outline', size: 'lg' })}
        >
          <FaWhatsapp className="size-4" aria-hidden="true" />
          Tanya ukuran
        </a>
      </div>

      {justAdded && (
        <p
          id="keranjang-status"
          role="status"
          className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-success"
        >
          <FiCheck className="size-4 shrink-0" aria-hidden="true" />
          {quantity} × {product.name} masuk keranjang.
          <Link
            to={routes.cart}
            className="font-medium text-ink underline underline-offset-4 hover:text-primary-deep"
          >
            Lihat keranjang
          </Link>
        </p>
      )}

      <ul className="mt-6 space-y-2 border-t border-sand pt-5 text-spec text-ink-soft">
        <li className="flex items-center gap-2.5">
          <FiTruck className="size-4 shrink-0" aria-hidden="true" />
          Dikirim dari Banjarmasin, dengan opsi perakitan di rumah.
        </li>
        <li className="flex items-center gap-2.5">
          <FiShield className="size-4 shrink-0" aria-hidden="true" />
          Garansi rangka ulin lima tahun untuk setiap unit.
        </li>
      </ul>
    </div>
  );
}
