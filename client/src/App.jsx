import { Routes, Route } from 'react-router-dom';
import { MainLayout } from './layouts/MainLayout.jsx';
import { HomePage } from './pages/HomePage.jsx';
import { ShopPage } from './pages/ShopPage.jsx';
import { ProductPage } from './pages/ProductPage.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { RegisterPage } from './pages/RegisterPage.jsx';
import { AccountPage } from './pages/AccountPage.jsx';
import { ProfilePage } from './pages/ProfilePage.jsx';
import { AddressesPage } from './pages/AddressesPage.jsx';
import { OrdersPage } from './pages/OrdersPage.jsx';
import { OrderDetailPage } from './pages/OrderDetailPage.jsx';
import { WishlistPage } from './pages/WishlistPage.jsx';
import { CartPage } from './pages/CartPage.jsx';
import { CheckoutPage } from './pages/CheckoutPage.jsx';
import { OrderCompletePage } from './pages/OrderCompletePage.jsx';
import { NotFoundPage } from './pages/NotFoundPage.jsx';
import { AdminLayout } from './layouts/AdminLayout.jsx';
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage.jsx';
import { AdminProductsPage } from './pages/admin/AdminProductsPage.jsx';
import { AdminOrdersPage } from './pages/admin/AdminOrdersPage.jsx';
import { AdminOrderDetailPage } from './pages/admin/AdminOrderDetailPage.jsx';
import { RequireAuth } from './components/auth/RequireAuth.jsx';
import { RequireAdmin } from './components/auth/RequireAdmin.jsx';
import { AccountLayout } from './components/account/AccountLayout.jsx';
import { routes } from './lib/nav.js';

/** Route paths are defined once in lib/nav.js and reused here. */
const path = (route) => route.replace(/^\//, '');

export default function App() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route index element={<HomePage />} />
        <Route path={path(routes.shop)} element={<ShopPage />} />
        <Route path={path(routes.product())} element={<ProductPage />} />
        <Route
          path={path(routes.wishlist)}
          element={
            <RequireAuth>
              <WishlistPage />
            </RequireAuth>
          }
        />
        <Route path={path(routes.cart)} element={<CartPage />} />
        <Route
          path={path(routes.checkout)}
          element={
            <RequireAuth>
              <CheckoutPage />
            </RequireAuth>
          }
        />
        <Route
          path={path(routes.orderComplete())}
          element={
            <RequireAuth>
              <OrderCompletePage />
            </RequireAuth>
          }
        />
        <Route path={path(routes.login)} element={<LoginPage />} />
        <Route path={path(routes.register)} element={<RegisterPage />} />
        <Route
          path={path(routes.account)}
          element={
            <RequireAuth>
              <AccountLayout />
            </RequireAuth>
          }
        >
          <Route index element={<AccountPage />} />
          <Route path="profil" element={<ProfilePage />} />
          <Route path="alamat" element={<AddressesPage />} />
          <Route path="pesanan" element={<OrdersPage />} />
          <Route path="pesanan/:orderNumber" element={<OrderDetailPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      <Route
        path={path(routes.admin)}
        element={
          <RequireAdmin>
            <AdminLayout />
          </RequireAdmin>
        }
      >
        <Route index element={<AdminDashboardPage />} />
        <Route path="produk" element={<AdminProductsPage />} />
        <Route path="pesanan" element={<AdminOrdersPage />} />
        <Route path="pesanan/:orderNumber" element={<AdminOrderDetailPage />} />
      </Route>
    </Routes>
  );
}
