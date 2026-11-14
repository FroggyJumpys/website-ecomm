import { FiGrid, FiList } from 'react-icons/fi';
import { cn } from '../../lib/cn.js';
import { VIEW } from '../../lib/shopParams.js';

const options = [
  { value: VIEW.grid, label: 'Tampilan grid', Icon: FiGrid },
  { value: VIEW.list, label: 'Tampilan daftar', Icon: FiList },
];

/** Grid or list layout for the results. The choice is kept in the URL. */
export function ViewToggle({ value, onChange, className }) {
  return (
    <div className={cn('inline-flex rounded-full border border-ink/15 p-0.5', className)}>
      {options.map(({ value: optionValue, label, Icon }) => {
        const active = value === optionValue;

        return (
          <button
            key={optionValue}
            type="button"
            onClick={() => onChange(optionValue)}
            aria-label={label}
            aria-pressed={active}
            className={cn(
              'grid size-8 place-items-center rounded-full transition',
              active ? 'bg-ink text-paper' : 'text-ink-soft hover:bg-ink/5 hover:text-ink'
            )}
          >
            <Icon className="size-4" />
          </button>
        );
      })}
    </div>
  );
}
