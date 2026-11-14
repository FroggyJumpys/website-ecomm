import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/authContext.js';
import { addToWishlist, fetchWishlist, removeFromWishlist } from '../services/wishlist.js';

/**
 * Wishlist server-state. The query key carries the user id so signing out and
 * signing in as somebody else cannot show the previous customer's saved items
 * from the cache, and the heart buttons can read it without their own request.
 */

export function useWishlist() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['wishlist', user?.id],
    queryFn: fetchWishlist,
    enabled: Boolean(user),
    staleTime: 60 * 1000,
  });
}

function useWishlistMutation(mutationFn) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wishlist'] });
    },
  });
}

export function useAddToWishlist() {
  return useWishlistMutation(addToWishlist);
}

export function useRemoveFromWishlist() {
  return useWishlistMutation(removeFromWishlist);
}

/** True when `productId` is already saved; false while the list is unknown. */
export function useIsSaved(productId) {
  const query = useWishlist();

  return Boolean(query.data?.data?.some((item) => item.id === productId));
}
