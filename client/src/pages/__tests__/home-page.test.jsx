import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HomePage } from '../HomePage.jsx';

/**
 * Pins the reviewer's 03a finding: a pending grid must reserve the same number of
 * slots as the loaded grid fills. Rendered on the server so no browser or extra
 * test dependency is needed.
 */

const PRODUCT_SKELETON = 'aspect-square w-full animate-pulse';

function renderHomePage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const html = renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    </QueryClientProvider>
  );

  return { html, queryClient };
}

function countOf(html, pattern) {
  return html.match(new RegExp(pattern, 'g'))?.length ?? 0;
}

describe('HomePage', () => {
  it('reserves one product skeleton per product each grid will load', () => {
    const { html, queryClient } = renderHomePage();

    const arrivals = html.slice(html.indexOf('Baru tiba'), html.indexOf('Sedang digemari'));
    const trending = html.slice(html.indexOf('Sedang digemari'));

    expect(countOf(arrivals, PRODUCT_SKELETON)).toBe(4);
    expect(countOf(trending, PRODUCT_SKELETON)).toBe(8);

    // The skeleton counts above must stay tied to the limits the page requests.
    const requestedLimits = queryClient
      .getQueryCache()
      .getAll()
      .filter((query) => query.queryKey[0] === 'products' && query.queryKey[1]?.limit)
      .map((query) => query.queryKey[1].limit)
      .sort((a, b) => a - b);

    expect(requestedLimits).toEqual([4, 8]);
  });
});
