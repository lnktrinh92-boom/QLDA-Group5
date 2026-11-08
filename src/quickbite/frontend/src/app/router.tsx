import { lazy } from 'react';
import { createBrowserRouter } from 'react-router';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { GuestOnlyRoute, ProtectedRoute } from '@/features/auth/ProtectedRoute';
import { HomePage } from '@/pages/HomePage';
import { NotFoundPage } from '@/pages/NotFoundPage';

// Các trang còn lại được tải khi cần (code-splitting) để trang chủ mở nhanh hơn
const page = <K extends string>(loader: () => Promise<Record<K, React.ComponentType>>, name: K) =>
  lazy(() => loader().then((m) => ({ default: m[name] })));

const FoodDiscoveryPage = page(() => import('@/pages/FoodDiscoveryPage'), 'FoodDiscoveryPage');
const FoodDetailPage = page(() => import('@/pages/FoodDetailPage'), 'FoodDetailPage');
const StallsPage = page(() => import('@/pages/StallsPage'), 'StallsPage');
const StallDetailPage = page(() => import('@/pages/StallDetailPage'), 'StallDetailPage');
const SystemStatusPage = page(() => import('@/pages/SystemStatusPage'), 'SystemStatusPage');
const LoginPage = page(() => import('@/pages/LoginPage'), 'LoginPage');
const RegisterPage = page(() => import('@/pages/RegisterPage'), 'RegisterPage');
const ProfilePage = page(() => import('@/pages/ProfilePage'), 'ProfilePage');
const VendorLayout = page(() => import('@/components/layout/VendorLayout'), 'VendorLayout');
const VendorDashboardPage = page(() => import('@/pages/vendor/VendorDashboardPage'), 'VendorDashboardPage');
const VendorOrdersPage = page(() => import('@/pages/vendor/VendorOrdersPage'), 'VendorOrdersPage');
const VendorMenuPage = page(() => import('@/pages/vendor/VendorMenuPage'), 'VendorMenuPage');
const VendorReportsPage = page(() => import('@/pages/vendor/VendorReportsPage'), 'VendorReportsPage');
const VendorStallSettingsPage = page(() => import('@/pages/vendor/VendorStallSettingsPage'), 'VendorStallSettingsPage');
const NotificationsPage = page(() => import('@/pages/NotificationsPage'), 'NotificationsPage');
const AdminLayout = page(() => import('@/components/layout/AdminLayout'), 'AdminLayout');
const AdminDashboardPage = page(() => import('@/pages/admin/AdminDashboardPage'), 'AdminDashboardPage');
const AdminUsersPage = page(() => import('@/pages/admin/AdminUsersPage'), 'AdminUsersPage');
const AdminStallsPage = page(() => import('@/pages/admin/AdminStallsPage'), 'AdminStallsPage');
const AdminCategoriesPage = page(() => import('@/pages/admin/AdminCategoriesPage'), 'AdminCategoriesPage');
const AdminPickupLocationsPage = page(() => import('@/pages/admin/AdminPickupLocationsPage'), 'AdminPickupLocationsPage');
const AdminOrdersPage = page(() => import('@/pages/admin/AdminOrdersPage'), 'AdminOrdersPage');
const AdminReviewsPage = page(() => import('@/pages/admin/AdminReviewsPage'), 'AdminReviewsPage');
const AdminAuditLogsPage = page(() => import('@/pages/admin/AdminAuditLogsPage'), 'AdminAuditLogsPage');
const CartPage = page(() => import('@/pages/CartPage'), 'CartPage');
const CheckoutPage = page(() => import('@/pages/CheckoutPage'), 'CheckoutPage');
const OrdersPage = page(() => import('@/pages/OrdersPage'), 'OrdersPage');
const OrderDetailPage = page(() => import('@/pages/OrderDetailPage'), 'OrderDetailPage');

const studentOnly = (el: React.ReactNode) => <ProtectedRoute roles={['STUDENT']}>{el}</ProtectedRoute>;

export const routes = [
  {
    element: <PublicLayout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/mon-an', element: <FoodDiscoveryPage /> },
      { path: '/mon-an/:id', element: <FoodDetailPage /> },
      { path: '/quan-an', element: <StallsPage /> },
      { path: '/quan-an/:slug', element: <StallDetailPage /> },
      { path: '/trang-thai', element: <SystemStatusPage /> },
      { path: '/dang-nhap', element: <GuestOnlyRoute><LoginPage /></GuestOnlyRoute> },
      { path: '/dang-ky', element: <GuestOnlyRoute><RegisterPage /></GuestOnlyRoute> },
      { path: '/tai-khoan', element: <ProtectedRoute><ProfilePage /></ProtectedRoute> },
      { path: '/gio-hang', element: studentOnly(<CartPage />) },
      { path: '/thanh-toan', element: studentOnly(<CheckoutPage />) },
      { path: '/don-hang', element: studentOnly(<OrdersPage />) },
      { path: '/don-hang/:id', element: studentOnly(<OrderDetailPage />) },
      { path: '/thong-bao', element: <ProtectedRoute><NotificationsPage /></ProtectedRoute> },
      {
        path: '/quan-ly',
        element: <ProtectedRoute roles={['VENDOR', 'ADMIN']}><VendorLayout /></ProtectedRoute>,
        children: [
          { index: true, element: <VendorDashboardPage /> },
          { path: 'don-hang', element: <VendorOrdersPage /> },
          { path: 'thuc-don', element: <VendorMenuPage /> },
          { path: 'bao-cao', element: <VendorReportsPage /> },
          { path: 'thong-tin-quay', element: <VendorStallSettingsPage /> },
        ],
      },
      {
        path: '/quan-tri',
        element: <ProtectedRoute roles={['ADMIN']}><AdminLayout /></ProtectedRoute>,
        children: [
          { index: true, element: <AdminDashboardPage /> },
          { path: 'nguoi-dung', element: <AdminUsersPage /> },
          { path: 'quay-an', element: <AdminStallsPage /> },
          { path: 'danh-muc', element: <AdminCategoriesPage /> },
          { path: 'diem-nhan', element: <AdminPickupLocationsPage /> },
          { path: 'don-hang', element: <AdminOrdersPage /> },
          { path: 'danh-gia', element: <AdminReviewsPage /> },
          { path: 'nhat-ky', element: <AdminAuditLogsPage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
