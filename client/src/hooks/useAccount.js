import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/authContext.js';
import {
  changePassword,
  createAddress,
  deleteAddress,
  fetchAddresses,
  fetchOrder,
  fetchOrders,
  setDefaultAddress,
  updateAddress,
  updateProfile,
} from '../services/account.js';

/**
 * Account server-state hooks. Query keys include the user id so signing out and
 * signing in as somebody else cannot show the previous customer's addresses or
 * orders from the cache.
 */

export function useAddresses() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['addresses', user?.id],
    queryFn: fetchAddresses,
    enabled: Boolean(user),
  });
}

export function useOrders() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['orders', user?.id],
    queryFn: fetchOrders,
    enabled: Boolean(user),
  });
}

export function useOrder(orderNumber) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['orders', user?.id, orderNumber],
    queryFn: () => fetchOrder(orderNumber),
    enabled: Boolean(user) && Boolean(orderNumber),
  });
}

/** Saving the profile also refreshes the user held by AuthProvider. */
export function useUpdateProfile() {
  const { updateUser } = useAuth();

  return useMutation({
    mutationFn: updateProfile,
    onSuccess: (payload) => {
      if (payload?.data) updateUser(payload.data);
    },
  });
}

export function useChangePassword() {
  return useMutation({ mutationFn: changePassword });
}

function useAddressMutation(mutationFn) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addresses'] });
    },
  });
}

export function useCreateAddress() {
  return useAddressMutation(createAddress);
}

export function useUpdateAddress() {
  return useAddressMutation(updateAddress);
}

export function useDeleteAddress() {
  return useAddressMutation(deleteAddress);
}

export function useSetDefaultAddress() {
  return useAddressMutation(setDefaultAddress);
}
